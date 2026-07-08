import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fetchJson } from './util.js';
import { cacheDir } from './paths.js';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

let manifestCache = null;
let manifestAt = 0;

/** Full Mojang version manifest (cached 30 min in memory, plus on disk for offline). */
export async function getVersionManifest() {
  if (manifestCache && Date.now() - manifestAt < 30 * 60_000) return manifestCache;
  const diskCache = path.join(cacheDir(), 'version_manifest_v2.json');
  try {
    manifestCache = await fetchJson(MANIFEST_URL);
    manifestAt = Date.now();
    await fsp.mkdir(path.dirname(diskCache), { recursive: true });
    await fsp.writeFile(diskCache, JSON.stringify(manifestCache));
  } catch (err) {
    if (fs.existsSync(diskCache)) {
      manifestCache = JSON.parse(await fsp.readFile(diskCache, 'utf8'));
      manifestAt = Date.now();
    } else {
      throw err;
    }
  }
  return manifestCache;
}

export async function listMinecraftVersions({ includeSnapshots = false } = {}) {
  const m = await getVersionManifest();
  return m.versions
    .filter((v) => v.type === 'release' || (includeSnapshots && v.type === 'snapshot'))
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

/** Per-version JSON from piston-meta (cached on disk). Contains javaVersion, downloads, etc. */
export async function getVersionJson(id) {
  const cached = path.join(cacheDir(), 'version-json', `${id}.json`);
  if (fs.existsSync(cached)) {
    try { return JSON.parse(await fsp.readFile(cached, 'utf8')); } catch { /* refetch */ }
  }
  const m = await getVersionManifest();
  const entry = m.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Unknown Minecraft version: ${id}`);
  const json = await fetchJson(entry.url);
  await fsp.mkdir(path.dirname(cached), { recursive: true });
  await fsp.writeFile(cached, JSON.stringify(json));
  return json;
}

/** Required Java major version for a Minecraft version (8/16/17/21...). */
export async function requiredJavaMajor(mcVersion) {
  try {
    const json = await getVersionJson(mcVersion);
    if (json.javaVersion?.majorVersion) return json.javaVersion.majorVersion;
  } catch { /* fall through to heuristic */ }
  // Heuristic fallback for offline use.
  const [, minor = 0, patch = 0] = String(mcVersion).split('.').map((n) => parseInt(n, 10) || 0);
  if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}
