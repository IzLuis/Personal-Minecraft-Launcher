// Launching: assemble MCLC options from an instance, with a shared minecraft root
// (versions/libraries/assets downloaded once) and per-instance game directories.
import path from 'node:path';
import { createRequire } from 'node:module';
import { minecraftRoot, instanceDir } from './paths.js';
import { readInstance, touchLastPlayed } from './instances.js';
import { ensureLoader } from './loaders.js';
import { requiredJavaMajor } from './mojang.js';
import { ensureJava } from './java.js';
import { getMclcAuth } from './auth.js';

const require = createRequire(import.meta.url);
const { Client } = require('minecraft-launcher-core');

const running = new Map(); // instanceId -> child process

/**
 * Normalize a user-entered memory value to something the JVM accepts.
 * "8G" -> "8G", "8192M" -> "8192M", plain "8" -> "8G" (people think in GB),
 * plain "2048" -> "2048M" (numbers above 128 are clearly megabytes),
 * "1.5G" -> "1536M". Invalid/empty input falls back.
 */
export function normalizeMemory(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*([gGmM])?[bB]?$/);
  if (!m) return fallback;
  let num = parseFloat(m[1]);
  if (!(num > 0)) return fallback;
  let unit = (m[2] || '').toUpperCase();
  if (!unit) unit = num <= 128 ? 'G' : 'M';
  if (!Number.isInteger(num)) {
    num = Math.round(unit === 'G' ? num * 1024 : num);
    unit = 'M';
  }
  return `${num}${unit}`;
}

/** Resolve max/min memory with normalization and a min<=max clamp. */
export function resolveMemory(rawMax, rawMin, defMax = '4G', defMin = '1G') {
  const toMb = (s) => parseInt(s, 10) * (s.endsWith('G') ? 1024 : 1);
  const max = normalizeMemory(rawMax, defMax);
  let min = normalizeMemory(rawMin, defMin);
  if (toMb(min) > toMb(max)) min = max;
  return { max, min };
}

export function isRunning(id) {
  return running.has(id);
}

export function killInstance(id) {
  const child = running.get(id);
  if (child) {
    try { child.kill(); } catch { /* already gone */ }
  }
  return !!child;
}

/**
 * Launch an instance. `events` receives lifecycle callbacks:
 *   onStatus(text), onProgress({label, value, max}), onLog(line), onExit(code)
 */
export async function launchInstance(id, settingsStore, events = {}) {
  const { onStatus = () => {}, onProgress = () => {}, onLog = () => {}, onExit = () => {} } = events;
  if (running.has(id)) throw new Error('This instance is already running.');
  const inst = await readInstance(id);

  onStatus('Signing in…');
  const authorization = await getMclcAuth();

  onStatus('Preparing Java…');
  const javaOverride = inst.settings.javaPath || settingsStore.get('javaPath');
  const javaPath = javaOverride || (await ensureJava(await requiredJavaMajor(inst.mc.version), { onStatus }));

  onStatus('Preparing mod loader…');
  const loaderHints = await ensureLoader(
    { loader: inst.loader.type, loaderVersion: inst.loader.version, mcVersion: inst.mc.version },
    { onStatus }
  );

  const rawMax = inst.settings.memoryMax || settingsStore.get('memoryMax', '4G');
  const rawMin = inst.settings.memoryMin || settingsStore.get('memoryMin', '1G');
  const { max: memoryMax, min: memoryMin } = resolveMemory(rawMax, rawMin);
  if (memoryMax !== String(rawMax).trim() || memoryMin !== String(rawMin).trim()) {
    onLog(`[launcher] Using RAM ${memoryMin}–${memoryMax} (interpreted from "${rawMin}"/"${rawMax}")`);
  }
  const jvmArgs = (inst.settings.jvmArgs || settingsStore.get('jvmArgs', '')).trim();

  const opts = {
    authorization,
    root: minecraftRoot(),
    version: {
      number: inst.mc.version,
      type: 'release',
      ...(loaderHints.custom ? { custom: loaderHints.custom } : {}),
    },
    ...(loaderHints.forge ? { forge: loaderHints.forge } : {}),
    memory: { max: memoryMax, min: memoryMin },
    javaPath,
    overrides: {
      gameDirectory: instanceDir(id),
      detached: false,
    },
    ...(jvmArgs ? { customArgs: jvmArgs.split(/\s+/) } : {}),
  };

  onStatus('Downloading game files…');
  const launcher = new Client();
  launcher.on('debug', (line) => onLog(`[debug] ${line}`));
  launcher.on('data', (line) => onLog(String(line).replace(/\n+$/, '')));
  launcher.on('progress', (p) => {
    if (p && p.total) onProgress({ label: `${p.type || 'download'}`, value: p.task ?? 0, max: p.total });
  });
  launcher.on('close', (code) => {
    running.delete(id);
    onExit(code ?? 0);
  });

  const child = await launcher.launch(opts);
  if (!child) {
    running.delete(id);
    throw new Error('Failed to start Minecraft (see logs).');
  }
  running.set(id, child);
  await touchLastPlayed(id);
  onStatus('Running');
  return { pid: child.pid };
}
