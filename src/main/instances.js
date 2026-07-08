// Instance management. Each instance is a folder under instances/<id>/ acting as the
// game directory (mods/, config/, saves/ ...) plus an instance.json describing it.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { instancesDir, instanceDir } from './paths.js';
import { slugify, nowIso } from './util.js';

const INSTANCE_FILE = 'instance.json';

export function defaultInstance() {
  return {
    formatVersion: 1,
    id: '',
    name: '',
    created: nowIso(),
    lastPlayed: null,
    mc: { version: '' },
    loader: { type: 'vanilla', version: '' },
    // Where this pack came from & how to check for updates. type: none | mrpack-url |
    // modrinth | curseforge | github-releases
    source: { type: 'none' },
    // Current installed pack version (whatever the source calls it).
    packVersion: null,
    // Files owned by the pack (relative path -> {sha1, size, url?, optional?, name?}).
    // Everything NOT listed here is user data and is never touched by updates.
    packFiles: {},
    // Player choices for optional pack files (relative path -> boolean enabled).
    optionalChoices: {},
    settings: { memoryMax: '', memoryMin: '', javaPath: '', jvmArgs: '' },
  };
}

export async function listInstances() {
  const dir = instancesDir();
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const meta = await readInstance(e.name).catch(() => null);
    if (meta) out.push(meta);
  }
  out.sort((a, b) => String(b.lastPlayed || b.created).localeCompare(String(a.lastPlayed || a.created)));
  return out;
}

export async function readInstance(id) {
  const file = path.join(instanceDir(id), INSTANCE_FILE);
  const raw = await fsp.readFile(file, 'utf8');
  const data = { ...defaultInstance(), ...JSON.parse(raw) };
  data.id = id;
  return data;
}

export async function writeInstance(inst) {
  const dir = instanceDir(inst.id);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${INSTANCE_FILE}.tmp`);
  await fsp.writeFile(tmp, JSON.stringify(inst, null, 2));
  await fsp.rename(tmp, path.join(dir, INSTANCE_FILE));
  return inst;
}

export async function allocateInstanceId(name) {
  const base = slugify(name);
  let id = base;
  let n = 2;
  while (fs.existsSync(instanceDir(id))) id = `${base}-${n++}`;
  return id;
}

export async function createInstance({ name, mcVersion, loader = 'vanilla', loaderVersion = '' }) {
  if (!name?.trim()) throw new Error('Instance name is required.');
  if (!mcVersion) throw new Error('Minecraft version is required.');
  const inst = defaultInstance();
  inst.id = await allocateInstanceId(name);
  inst.name = name.trim();
  inst.mc.version = mcVersion;
  inst.loader = { type: loader, version: loaderVersion };
  await fsp.mkdir(path.join(instanceDir(inst.id), 'mods'), { recursive: true });
  await writeInstance(inst);
  return inst;
}

export async function deleteInstance(id) {
  await fsp.rm(instanceDir(id), { recursive: true, force: true });
}

export async function renameInstance(id, name) {
  const inst = await readInstance(id);
  inst.name = String(name).trim() || inst.name;
  return writeInstance(inst);
}

export async function patchInstanceSettings(id, patch) {
  const inst = await readInstance(id);
  inst.settings = { ...inst.settings, ...patch };
  return writeInstance(inst);
}

export async function touchLastPlayed(id) {
  const inst = await readInstance(id);
  inst.lastPlayed = nowIso();
  return writeInstance(inst);
}

/**
 * List mod jars in the instance's mods/ folder with pack/user origin and enabled state.
 * A mod is "disabled" by renaming it to <name>.disabled (same trick Prism uses).
 */
export async function listMods(id) {
  const inst = await readInstance(id);
  const dir = path.join(instanceDir(id), 'mods');
  let files = [];
  try {
    files = await fsp.readdir(dir);
  } catch { /* no mods dir yet */ }
  return files
    .filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
    .map((f) => {
      const enabled = !f.endsWith('.disabled');
      const cleanName = enabled ? f : f.slice(0, -'.disabled'.length);
      const rel = `mods/${cleanName}`;
      const packEntry = inst.packFiles[rel];
      return {
        file: f,
        name: cleanName,
        enabled,
        fromPack: !!packEntry,
        optional: !!packEntry?.optional,
        projectName: packEntry?.name || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function toggleMod(id, file) {
  const dir = path.join(instanceDir(id), 'mods');
  const from = path.join(dir, file);
  if (!fs.existsSync(from)) throw new Error(`Mod not found: ${file}`);
  const to = file.endsWith('.disabled') ? from.slice(0, -'.disabled'.length) : `${from}.disabled`;
  await fsp.rename(from, to);
  return listMods(id);
}

export async function deleteMod(id, file) {
  const inst = await readInstance(id);
  const clean = file.endsWith('.disabled') ? file.slice(0, -'.disabled'.length) : file;
  await fsp.rm(path.join(instanceDir(id), 'mods', file), { force: true });
  delete inst.packFiles[`mods/${clean}`];
  delete inst.optionalChoices[`mods/${clean}`];
  await writeInstance(inst);
  return listMods(id);
}

export async function addLocalMod(id, sourcePath) {
  const dest = path.join(instanceDir(id), 'mods', path.basename(sourcePath));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(sourcePath, dest);
  return listMods(id);
}
