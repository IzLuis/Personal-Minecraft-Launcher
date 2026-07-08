// The install/update engine shared by every pack source.
// Strategy: compute the full desired file set (remote files + archive overrides),
// diff against the instance's recorded packFiles, then apply. User files —
// anything not recorded in packFiles — are never deleted or overwritten,
// except when a pack override replaces a file the user edited, in which case
// the user's copy is backed up as <file>.bak-<version> first.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { instanceDir } from '../paths.js';
import { hashBuffer, hashFile, safeJoin, downloadMany } from '../util.js';
import { planFilesFromMrpackIndex, listMrpackOptionals, parseCurseforgeManifest, planUpdate } from './plan.js';
import { loaderFromMrpackDependencies, loaderFromCurseforgeId } from '../loaders.js';
import { readInstance, writeInstance } from '../instances.js';
import { resolveCurseforgeFiles } from './curseforge.js';

/** Detect archive kind and parse its manifest. Returns a normalized "pack archive" object. */
export function openPackArchive(zipPath) {
  const zip = new AdmZip(zipPath);
  const mrIndex = zip.getEntry('modrinth.index.json');
  if (mrIndex) {
    const index = JSON.parse(zip.readAsText(mrIndex));
    return { kind: 'mrpack', zip, index };
  }
  const cfManifest = zip.getEntry('manifest.json');
  if (cfManifest) {
    const manifest = parseCurseforgeManifest(JSON.parse(zip.readAsText(cfManifest)));
    return { kind: 'curseforge', zip, manifest };
  }
  throw new Error('Unrecognized modpack file (expected a Modrinth .mrpack or CurseForge zip).');
}

/** Read override entries (rel path -> Buffer) from a pack archive. */
function readOverrides(archive) {
  const prefixes = archive.kind === 'mrpack' ? ['overrides/', 'client-overrides/'] : [`${archive.manifest.overridesDir.replace(/\/+$/, '')}/`];
  const out = new Map(); // rel -> Buffer (later prefixes win: client-overrides beat overrides)
  for (const prefix of prefixes) {
    for (const entry of archive.zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.replace(/\\/g, '/');
      if (!name.startsWith(prefix)) continue;
      const rel = name.slice(prefix.length);
      if (!rel) continue;
      out.set(rel, entry.getData());
    }
  }
  return out;
}

/**
 * Inspect a pack archive without installing: metadata + optional files needing a choice.
 */
export async function inspectPackArchive(zipPath, settings) {
  const archive = openPackArchive(zipPath);
  if (archive.kind === 'mrpack') {
    const deps = archive.index.dependencies || {};
    return {
      kind: 'mrpack',
      name: archive.index.name || 'Modpack',
      version: String(archive.index.versionId ?? '0'),
      mcVersion: deps.minecraft,
      loader: loaderFromMrpackDependencies(deps),
      optionals: listMrpackOptionals(archive.index),
    };
  }
  const m = archive.manifest;
  const loader = m.loaderId ? loaderFromCurseforgeId(m.loaderId) : { type: 'vanilla', version: '' };
  // Optional CF files (required:false) need resolving to show names.
  const optionalRefs = m.files.filter((f) => !f.required);
  let optionals = [];
  if (optionalRefs.length) {
    const resolved = await resolveCurseforgeFiles(optionalRefs, settings, { tolerateFailures: true });
    optionals = resolved.filter((r) => r.fileName).map((r) => ({ path: `mods/${r.fileName}`, name: r.fileName }));
  }
  return { kind: 'curseforge', name: m.name, version: m.version, mcVersion: m.mcVersion, loader, optionals };
}

/**
 * Compute the desired file map (remote + overrides) for a pack archive.
 * Returns { desired, overrides, meta:{name,version,mcVersion,loader}, optionalCatalog }
 */
async function buildDesired(archive, choices, settings) {
  let desired = {};
  let optionalCatalog = {};
  let meta;
  if (archive.kind === 'mrpack') {
    const { files } = planFilesFromMrpackIndex(archive.index, choices);
    desired = files;
    for (const f of archive.index.files || []) {
      if ((f.env?.client || 'required') === 'optional') {
        const rel = String(f.path).replace(/\\/g, '/');
        optionalCatalog[rel] = {
          sha1: f.hashes?.sha1?.toLowerCase(),
          size: f.fileSize,
          url: f.downloads?.[0],
          name: rel.split('/').pop(),
          optional: true,
        };
      }
    }
    const deps = archive.index.dependencies || {};
    meta = {
      name: archive.index.name || 'Modpack',
      version: String(archive.index.versionId ?? '0'),
      mcVersion: deps.minecraft,
      loader: loaderFromMrpackDependencies(deps),
    };
  } else {
    const m = archive.manifest;
    const resolved = await resolveCurseforgeFiles(m.files, settings);
    for (const r of resolved) {
      const rel = `mods/${r.fileName}`;
      const entry = { sha1: r.sha1, size: r.size, url: r.url, optional: !r.required, name: r.fileName, cf: { projectID: r.projectID, fileID: r.fileID } };
      if (!r.required) {
        optionalCatalog[rel] = entry;
        if (!choices[rel]) continue;
      }
      desired[rel] = entry;
    }
    meta = {
      name: m.name,
      version: m.version,
      mcVersion: m.mcVersion,
      loader: m.loaderId ? loaderFromCurseforgeId(m.loaderId) : { type: 'vanilla', version: '' },
    };
  }
  if (!meta.mcVersion) throw new Error('Pack does not declare a Minecraft version.');
  const overrides = readOverrides(archive);
  return { desired, overrides, meta, optionalCatalog };
}

/** Resolve where a pack file actually lives on disk, honoring user-disabled ".disabled" mods. */
function diskState(instDir, rel) {
  const p = safeJoin(instDir, rel);
  if (fs.existsSync(p)) return { path: p, disabled: false, exists: true };
  const pd = `${p}.disabled`;
  if (fs.existsSync(pd)) return { path: pd, disabled: true, exists: true };
  return { path: p, disabled: false, exists: false };
}

/**
 * Install or update a pack archive into an instance. This is the one write-path
 * for imports AND updates.
 */
export async function applyPackArchive(instanceId, zipPath, { choices = {}, settings, source, onStatus = () => {}, onProgress = () => {} } = {}) {
  const inst = await readInstance(instanceId);
  const archive = openPackArchive(zipPath);
  onStatus('Resolving pack files…');
  const { desired, overrides, meta, optionalCatalog } = await buildDesired(archive, choices, settings);
  const instDir = instanceDir(instanceId);

  // Overrides join the desired set with their content hash so they diff like everything else.
  const overrideMeta = {};
  for (const [rel, buf] of overrides) {
    overrideMeta[rel] = { sha1: hashBuffer(buf), size: buf.length, override: true, name: rel.split('/').pop() };
  }
  const fullDesired = { ...overrideMeta, ...desired }; // remote files win over an override at the same path

  const plan = planUpdate(inst.packFiles, fullDesired);
  const summary = { added: 0, updated: 0, removed: 0, backedUp: [], warnings: [], orphaned: [] };

  // 1) Delete pack files removed by the new version (skip files the user modified).
  onStatus('Removing files dropped by the pack…');
  for (const rel of plan.toDelete) {
    const old = inst.packFiles[rel];
    const state = diskState(instDir, rel);
    if (!state.exists) continue;
    try {
      const cur = await hashFile(state.path);
      if (old?.sha1 && cur !== old.sha1) {
        summary.orphaned.push(rel);
        summary.warnings.push(`Kept ${rel}: you modified it, but the pack removed it.`);
        continue;
      }
    } catch { /* unreadable -> delete anyway */ }
    await fsp.rm(state.path, { force: true });
    summary.removed++;
  }

  // 2) Download new/changed remote files (preserving the user's enabled/disabled state).
  const downloads = [];
  const postRename = [];
  for (const rel of plan.toDownload) {
    const metaF = fullDesired[rel];
    if (metaF.override) continue; // handled in step 3
    const state = diskState(instDir, rel);
    if (state.exists && metaF.sha1) {
      try {
        if ((await hashFile(state.path)) === metaF.sha1) continue; // already correct
      } catch { /* re-download */ }
    }
    const dest = safeJoin(instDir, rel);
    downloads.push({ url: metaF.url, dest, sha1: metaF.sha1, size: metaF.size, label: metaF.name });
    if (state.exists) {
      if (state.disabled) {
        // Replace the .disabled copy, then re-disable after download.
        await fsp.rm(state.path, { force: true });
        postRename.push(dest);
      }
      summary.updated++;
    } else {
      summary.added++;
    }
  }
  onStatus(`Downloading ${downloads.length} files…`);
  await downloadMany(downloads, {
    concurrency: settings?.get?.('downloadConcurrency', 6) ?? 6,
    onProgress: (done, total, label) => onProgress({ label: `Downloading ${label}`, value: done, max: total }),
  });
  for (const p of postRename) {
    await fsp.rename(p, `${p}.disabled`).catch(() => {});
  }

  // 3) Apply overrides (configs etc.), backing up files the user edited.
  onStatus('Applying shared configs…');
  for (const [rel, buf] of overrides) {
    if (desired[rel]) continue; // remote file version of this path wins
    const newHash = overrideMeta[rel].sha1;
    const old = inst.packFiles[rel];
    const state = diskState(instDir, rel);
    const dest = safeJoin(instDir, rel);
    if (state.exists) {
      let cur = null;
      try { cur = await hashFile(state.path); } catch { /* treat as changed */ }
      if (cur === newHash) continue; // already identical
      const userEdited = !old || (old.sha1 && cur !== old.sha1);
      if (userEdited) {
        const bak = `${dest}.bak-${(meta.version || 'prev').replace(/[^\w.-]+/g, '_')}`;
        await fsp.copyFile(state.path, bak).catch(() => {});
        summary.backedUp.push(rel);
      }
      summary.updated++;
    } else {
      summary.added++;
    }
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, buf);
  }

  // 4) Record the new pack state on the instance.
  inst.packFiles = fullDesired;
  inst.optionalCatalog = optionalCatalog;
  inst.optionalChoices = { ...Object.fromEntries(Object.keys(optionalCatalog).map((k) => [k, !!choices[k]])) };
  inst.packVersion = meta.version;
  inst.mc.version = meta.mcVersion;
  inst.loader = meta.loader.type === 'vanilla' && inst.loader.type !== 'vanilla' ? inst.loader : meta.loader;
  if (source) inst.source = { ...source };
  if (!inst.name) inst.name = meta.name;
  await writeInstance(inst);
  return { summary, meta };
}

/** Enable/disable a single optional pack file after install. */
export async function setOptionalEnabled(instanceId, rel, enabled, settings) {
  const inst = await readInstance(instanceId);
  const catalogEntry = (inst.optionalCatalog || {})[rel];
  if (!catalogEntry) throw new Error(`Not an optional pack file: ${rel}`);
  const instDir = instanceDir(instanceId);
  if (enabled) {
    if (!catalogEntry.url) throw new Error(`No download URL recorded for ${rel}. Re-import the pack.`);
    await downloadMany([{ url: catalogEntry.url, dest: safeJoin(instDir, rel), sha1: catalogEntry.sha1, size: catalogEntry.size, label: catalogEntry.name }], {
      concurrency: 1,
    });
    inst.packFiles[rel] = catalogEntry;
  } else {
    const state = diskState(instDir, rel);
    if (state.exists) await fsp.rm(state.path, { force: true });
    delete inst.packFiles[rel];
  }
  inst.optionalChoices = { ...(inst.optionalChoices || {}), [rel]: enabled };
  await writeInstance(inst);
  return inst.optionalChoices;
}
