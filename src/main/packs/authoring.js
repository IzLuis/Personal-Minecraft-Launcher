// Authoring tools: add mods from Modrinth into an instance (tracked with their
// download URLs so exports stay lean), and export an instance as a versioned
// .mrpack ready to attach to a GitHub release for your friends.
import path from 'node:path';
import fsp from 'node:fs/promises';
import AdmZip from 'adm-zip';
import { instanceDir, exportsDir } from '../paths.js';
import { hashFile, walkFiles, download, slugify } from '../util.js';
import { readInstance, writeInstance } from '../instances.js';
import { getModrinthVersions, primaryFile, searchModrinth } from './modrinth.js';

/** Search Modrinth for MODS compatible with the instance (author convenience). */
export async function searchModsForInstance(instanceId, query) {
  const inst = await readInstance(instanceId);
  return searchModrinth({
    query,
    projectType: 'mod',
    mcVersion: inst.mc.version,
    loader: inst.loader.type === 'vanilla' ? undefined : inst.loader.type,
    limit: 15,
  });
}

/**
 * Install the newest compatible version of a Modrinth mod into the instance,
 * recording it as a pack-managed file (URL + hash) so exports reference it
 * remotely instead of bundling the jar.
 */
export async function installModrinthMod(instanceId, projectIdOrSlug, { optional = false } = {}) {
  const inst = await readInstance(instanceId);
  const versions = await getModrinthVersions(projectIdOrSlug, {
    mcVersion: inst.mc.version,
    loader: inst.loader.type === 'vanilla' ? undefined : inst.loader.type,
  });
  if (!versions.length) {
    throw new Error(`No compatible version found for ${inst.mc.version} + ${inst.loader.type}.`);
  }
  const version = versions[0];
  const file = primaryFile(version);
  const rel = `mods/${file.filename}`;
  await download(file.url, path.join(instanceDir(instanceId), 'mods', file.filename), { sha1: file.sha1 });
  const entry = { sha1: file.sha1?.toLowerCase(), sha512: file.sha512?.toLowerCase(), size: file.size, url: file.url, optional, name: file.filename };
  inst.packFiles[rel] = entry;
  if (optional) {
    inst.optionalCatalog = { ...(inst.optionalCatalog || {}), [rel]: entry };
    inst.optionalChoices = { ...(inst.optionalChoices || {}), [rel]: true };
  }
  await writeInstance(inst);
  return { file: file.filename, version: version.number };
}

/** Mark/unmark a pack-managed file as optional (affects the exported pack). */
export async function setModOptionalFlag(instanceId, rel, optional) {
  const inst = await readInstance(instanceId);
  const entry = inst.packFiles[rel];
  if (!entry) throw new Error(`Not a pack-managed file: ${rel}`);
  entry.optional = optional;
  if (optional) {
    inst.optionalCatalog = { ...(inst.optionalCatalog || {}), [rel]: entry };
    inst.optionalChoices = { ...(inst.optionalChoices || {}), [rel]: true };
  } else {
    if (inst.optionalCatalog) delete inst.optionalCatalog[rel];
    if (inst.optionalChoices) delete inst.optionalChoices[rel];
  }
  await writeInstance(inst);
  return entry;
}

// Directories shared with friends when exporting. Personal state (saves,
// screenshots, logs, options.txt, servers picked up at runtime) stays local.
const EXPORT_DIRS = ['config', 'defaultconfigs', 'kubejs', 'scripts', 'resourcepacks', 'shaderpacks', 'datapacks', 'global_packs', 'structures'];
const EXPORT_EXCLUDE = new Set(['options.txt', 'optionsof.txt', 'optionsshaders.txt', 'servers.dat', 'servers.dat_old', 'realms_persistence.json']);

/**
 * Export an instance as a .mrpack.
 * - Files with a recorded download URL become remote entries (small pack file).
 * - Everything else shareable (loose mods, config/, scripts/, ...) goes into overrides/.
 * Returns the path of the written .mrpack.
 */
export async function exportInstanceAsMrpack(instanceId, { version, name, summary } = {}) {
  if (!version || !String(version).trim()) throw new Error('An export needs a version, e.g. 1.0.0');
  const inst = await readInstance(instanceId);
  if (!inst.mc.version || inst.mc.version === 'pending') throw new Error('Instance has no Minecraft version.');
  const dir = instanceDir(instanceId);
  const packName = (name || inst.name).trim();
  const versionId = String(version).trim();

  const dependencies = { minecraft: inst.mc.version };
  const loaderKey = { fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge' }[inst.loader.type];
  if (loaderKey) {
    if (!inst.loader.version) throw new Error('Instance is missing its mod loader version.');
    dependencies[loaderKey] = inst.loader.version;
  }

  const files = [];
  const overridePaths = [];
  const seen = new Set();

  // 1) Pack-managed files with URLs -> remote entries (must have sha1+sha512 per spec).
  for (const [rel, meta] of Object.entries(inst.packFiles || {})) {
    const abs = path.join(dir, ...rel.split('/'));
    const disabledAbs = `${abs}.disabled`;
    let realPath = abs;
    try { await fsp.access(abs); } catch {
      try { await fsp.access(disabledAbs); realPath = disabledAbs; } catch { continue; } // gone -> skip
    }
    if (!meta.url) continue; // no URL -> ships in overrides below
    const sha1 = await hashFile(realPath, 'sha1');
    const sha512 = await hashFile(realPath, 'sha512');
    files.push({
      path: rel,
      hashes: { sha1, sha512 },
      env: meta.optional ? { client: 'optional', server: 'unsupported' } : { client: 'required', server: 'required' },
      downloads: [meta.url],
      fileSize: (await fsp.stat(realPath)).size,
    });
    seen.add(rel);
  }

  // 2) Shareable local files -> overrides.
  const candidateDirs = ['mods', ...EXPORT_DIRS];
  for (const sub of candidateDirs) {
    const rels = await walkFiles(path.join(dir, sub));
    for (const r of rels) {
      const rel = `${sub}/${r}`;
      const baseName = rel.split('/').pop();
      if (seen.has(rel)) continue;
      if (rel.endsWith('.disabled') && seen.has(rel.slice(0, -'.disabled'.length))) continue;
      if (EXPORT_EXCLUDE.has(baseName) || baseName.startsWith('.')) continue;
      if (/\.bak(-|$)/.test(baseName)) continue;
      overridePaths.push(rel);
    }
  }

  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId,
    name: packName,
    ...(summary ? { summary } : {}),
    files,
    dependencies,
  };

  const zip = new AdmZip();
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)));
  for (const rel of overridePaths) {
    const data = await fsp.readFile(path.join(dir, ...rel.split('/')));
    zip.addFile(`overrides/${rel}`, data);
  }
  await fsp.mkdir(exportsDir(), { recursive: true });
  const outPath = path.join(exportsDir(), `${slugify(packName)}-${versionId}.mrpack`);
  zip.writeZip(outPath);
  return { path: outPath, remoteFiles: files.length, overrideFiles: overridePaths.length };
}
