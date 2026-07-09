// Group config: ONE JSON file the group owner hosts (a GitHub repo edited in the
// browser). Friends' launchers poll it and get: the pack catalog ("the modpack is
// already in your launcher"), per-pack server addresses, the Discord invite, and
// announcements. See docs/GROUP-CONFIG.md for the schema.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fetchJson } from './util.js';
import { cacheDir } from './paths.js';
import { listInstances, readInstance, writeInstance } from './instances.js';

// ── EDIT THIS LINE before building installers for your friends ──────────────
// Point it at the raw URL of your config file (Settings can override it too).
export const DEFAULT_GROUP_CONFIG_URL =
  'https://raw.githubusercontent.com/IzLuis/izlauncher-config/main/izlauncher.json';
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_FILE = () => path.join(cacheDir(), 'group-config.json');

/** Validate + normalize a raw group config object. Throws on structural problems. */
export function normalizeGroupConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Group config is not a JSON object.');
  // Forgive the classic doubled-paste accident ("https://…https://…"): keep the first URL.
  let discordUrl = typeof raw.discordUrl === 'string' ? raw.discordUrl.trim() : '';
  const secondUrl = discordUrl.indexOf('https://', 8);
  if (secondUrl > 0) discordUrl = discordUrl.slice(0, secondUrl);
  const cfg = {
    configVersion: raw.configVersion ?? 1,
    groupName: String(raw.groupName || 'My Group'),
    discordUrl: /^https:\/\/\S+$/.test(discordUrl) ? discordUrl : null,
    packs: [],
    announcements: [],
  };
  for (const p of raw.packs || []) {
    if (!p?.id || !p?.name || !p?.source?.type) continue; // skip malformed entries
    const src = p.source;
    const okSource =
      (src.type === 'modrinth' && src.project) ||
      (src.type === 'github-releases' && src.repo) ||
      (src.type === 'curseforge' && src.project) ||
      (src.type === 'url' && /^https:\/\//.test(src.url || ''));
    if (!okSource) continue;
    let server = null;
    if (p.server?.address) {
      server = { address: String(p.server.address), port: Number(p.server.port) || null };
    }
    cfg.packs.push({
      id: String(p.id),
      name: String(p.name),
      description: String(p.description || ''),
      source: src,
      server,
      recommended: !!p.recommended,
    });
  }
  for (const a of raw.announcements || []) {
    if (!a?.id || !a?.title) continue;
    cfg.announcements.push({
      id: String(a.id),
      date: String(a.date || ''),
      title: String(a.title),
      body: String(a.body || ''),
      pinned: !!a.pinned,
      emoji: String(a.emoji || '📣').slice(0, 8),
      tag: String(a.tag || '').slice(0, 24),
      author: String(a.author || cfg.groupName).slice(0, 40),
    });
  }
  cfg.announcements.sort((x, y) => (y.pinned - x.pinned) || String(y.date).localeCompare(String(x.date)));
  return cfg;
}

/**
 * Fetch the group config (settings override > baked-in default), falling back to
 * the on-disk cache when offline. Returns { config, fromCache, url } or
 * { config: null } when no URL is configured / nothing is reachable.
 */
export async function getGroupConfig(settings, _opts = {}) {
  const url = (settings.get('groupConfigUrl', '') || DEFAULT_GROUP_CONFIG_URL || '').trim();
  if (!url) return { config: null, fromCache: false, url: null };
  try {
    // Always cache-bust: raw.githubusercontent caches ~5 min and a fresh commit
    // must show up right away.
    const bust = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const raw = await fetchJson(bust, { 'Cache-Control': 'no-cache' });
    const config = normalizeGroupConfig(raw);
    await fsp.mkdir(path.dirname(CACHE_FILE()), { recursive: true });
    await fsp.writeFile(CACHE_FILE(), JSON.stringify(config));
    await syncGroupInstances(config);
    return { config, fromCache: false, url };
  } catch (err) {
    if (fs.existsSync(CACHE_FILE())) {
      try {
        const config = JSON.parse(await fsp.readFile(CACHE_FILE(), 'utf8'));
        return { config, fromCache: true, url, error: err.message };
      } catch { /* corrupt cache */ }
    }
    return { config: null, fromCache: false, url, error: err.message };
  }
}

/** Push config-side changes (server address, name) onto installed group instances. */
export async function syncGroupInstances(config) {
  const packById = new Map(config.packs.map((p) => [p.id, p]));
  for (const inst of await listInstances()) {
    const packId = inst.source?.groupPackId;
    if (!packId || !packById.has(packId)) continue;
    const pack = packById.get(packId);
    const full = await readInstance(inst.id);
    const before = JSON.stringify({ s: full.server });
    full.server = pack.server;
    if (JSON.stringify({ s: full.server }) !== before) await writeInstance(full);
  }
}

/** Map group packs to their installed instance (by source.groupPackId). */
export async function groupInstallStates(config) {
  const out = {};
  if (!config) return out;
  const instances = await listInstances();
  for (const pack of config.packs) {
    const inst = instances.find((i) => i.source?.groupPackId === pack.id);
    out[pack.id] = inst ? { instanceId: inst.id, packVersion: inst.packVersion } : null;
  }
  return out;
}

/** Build an import ref (for sources.beginImport) from a group pack entry. */
export function refFromGroupPack(pack) {
  const src = pack.source;
  switch (src.type) {
    case 'modrinth': return { type: 'modrinth', project: src.project };
    case 'github-releases': return { type: 'github-releases', repo: src.repo };
    case 'curseforge': return { type: 'curseforge', project: src.project };
    case 'url': return { type: 'url', url: src.url };
    default: throw new Error(`Unknown group pack source: ${src.type}`);
  }
}
