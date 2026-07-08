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

  const memoryMax = inst.settings.memoryMax || settingsStore.get('memoryMax', '4G');
  const memoryMin = inst.settings.memoryMin || settingsStore.get('memoryMin', '1G');
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
