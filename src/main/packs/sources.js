// Pack source orchestration: importing from anywhere, checking for updates,
// and applying updates — all funneled through the same archive install engine.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { cacheDir } from '../paths.js';
import { download, slugify } from '../util.js';
import { readInstance, writeInstance, deleteInstance, allocateInstanceId, defaultInstance } from '../instances.js';
import { applyPackArchive, inspectPackArchive } from './install.js';
import { latestModrinthPackVersion, getModrinthProject, getModrinthVersions, primaryFile } from './modrinth.js';
import { latestCurseforgePackFile, getCurseforgeProject } from './curseforge.js';
import { latestGithubRelease } from './github.js';
import { parseGithubRepo, parseModrinthRef } from './plan.js';

async function tempArchivePath(hint) {
  const dir = path.join(cacheDir(), 'pack-archives');
  await fsp.mkdir(dir, { recursive: true });
  return path.join(dir, `${slugify(hint)}-${Date.now()}${hint.endsWith('.mrpack') ? '.mrpack' : '.zip'}`);
}

/**
 * Resolve any pack reference into { zipPath, source, versionLabel }.
 * ref: { type: 'file'|'url'|'modrinth'|'curseforge'|'github-releases', ... }
 */
export async function fetchPackArchive(ref, settings, onStatus = () => {}) {
  switch (ref.type) {
    case 'file':
      return { zipPath: ref.path, source: { type: 'none' }, versionLabel: null };
    case 'url': {
      onStatus('Downloading pack…');
      const dest = await tempArchivePath(path.basename(new URL(ref.url).pathname) || 'pack.zip');
      await download(ref.url, dest);
      return { zipPath: dest, source: { type: 'mrpack-url', url: ref.url }, versionLabel: null };
    }
    case 'modrinth': {
      const projectRef = parseModrinthRef(ref.project);
      onStatus('Contacting Modrinth…');
      const project = await getModrinthProject(projectRef);
      const version = ref.versionId
        ? (await getModrinthVersions(projectRef)).find((v) => v.id === ref.versionId)
        : await latestModrinthPackVersion(projectRef);
      if (!version) throw new Error('Modrinth version not found.');
      const file = primaryFile(version);
      onStatus(`Downloading ${file.filename}…`);
      const dest = await tempArchivePath(file.filename);
      await download(file.url, dest, { sha1: file.sha1 });
      return {
        zipPath: dest,
        source: { type: 'modrinth', projectId: project.id, slug: project.slug, versionId: version.id },
        versionLabel: version.number,
        suggestedName: project.title,
      };
    }
    case 'curseforge': {
      onStatus('Contacting CurseForge…');
      const projectID = Number(String(ref.project).match(/\d+/)?.[0]);
      if (!projectID) throw new Error('Expected a CurseForge project ID (a number). Find it on the project page sidebar.');
      let title = `CurseForge ${projectID}`;
      try { title = (await getCurseforgeProject(projectID, settings)).name; } catch { /* keyless */ }
      const file = await latestCurseforgePackFile(projectID, settings);
      onStatus(`Downloading ${file.fileName}…`);
      const dest = await tempArchivePath(file.fileName);
      await download(file.url, dest, { sha1: file.sha1 });
      return {
        zipPath: dest,
        source: { type: 'curseforge', projectId: projectID, fileId: file.fileID },
        versionLabel: file.displayName,
        suggestedName: title,
      };
    }
    case 'github-releases': {
      const { owner, repo } = parseGithubRepo(ref.repo);
      onStatus('Checking GitHub releases…');
      const rel = await latestGithubRelease(owner, repo);
      onStatus(`Downloading ${rel.assetName}…`);
      const dest = await tempArchivePath(rel.assetName);
      await download(rel.assetUrl, dest);
      return {
        zipPath: dest,
        source: { type: 'github-releases', owner, repo, tag: rel.tag },
        versionLabel: rel.tag,
        suggestedName: repo,
      };
    }
    default:
      throw new Error(`Unknown pack reference type: ${ref.type}`);
  }
}

/**
 * Phase 1 of an import: fetch + inspect. Returns pack metadata, optional-file list,
 * and a ticket (the cached archive) for phase 2.
 */
export async function beginImport(ref, settings, onStatus) {
  const fetched = await fetchPackArchive(ref, settings, onStatus);
  const info = await inspectPackArchive(fetched.zipPath, settings);
  return {
    ticket: { zipPath: fetched.zipPath, source: fetched.source, versionLabel: fetched.versionLabel },
    name: fetched.suggestedName || info.name,
    version: fetched.versionLabel || info.version,
    mcVersion: info.mcVersion,
    loader: info.loader,
    optionals: info.optionals,
  };
}

/** Phase 2: create the instance and install the archive with the user's optional choices. */
export async function completeImport({ ticket, name, choices = {} }, settings, events = {}) {
  const inst = defaultInstance();
  inst.id = await allocateInstanceId(name || 'modpack');
  inst.name = (name || '').trim() || 'Modpack';
  inst.mc.version = 'pending';
  await writeInstance(inst);
  try {
    const { summary, meta } = await applyPackArchive(inst.id, ticket.zipPath, {
      choices,
      settings,
      source: ticket.source,
      ...events,
    });
    const updated = await readInstance(inst.id);
    if (ticket.versionLabel) {
      updated.packVersion = ticket.versionLabel;
      await writeInstance(updated);
    }
    return { instanceId: inst.id, summary, meta };
  } catch (err) {
    // Leave nothing half-imported.
    await deleteInstance(inst.id).catch(() => {});
    throw err;
  }
}

/** Check whether an instance's source has a newer pack version. */
export async function checkForUpdate(instanceId, settings) {
  const inst = await readInstance(instanceId);
  const src = inst.source || { type: 'none' };
  const current = inst.packVersion;
  switch (src.type) {
    case 'modrinth': {
      const latest = await latestModrinthPackVersion(src.projectId);
      return {
        available: latest.id !== src.versionId,
        current,
        latest: latest.number,
        ref: { type: 'modrinth', project: src.projectId, versionId: latest.id },
      };
    }
    case 'curseforge': {
      const latest = await latestCurseforgePackFile(src.projectId, settings);
      return {
        available: latest.fileID !== src.fileId,
        current,
        latest: latest.displayName,
        ref: { type: 'curseforge', project: src.projectId },
      };
    }
    case 'github-releases': {
      const rel = await latestGithubRelease(src.owner, src.repo);
      return {
        available: rel.tag !== src.tag,
        current: src.tag || current,
        latest: rel.tag,
        ref: { type: 'github-releases', repo: `${src.owner}/${src.repo}` },
      };
    }
    case 'mrpack-url': {
      // Static URL: re-download and compare the declared pack version.
      const fetched = await fetchPackArchive({ type: 'url', url: src.url }, settings);
      const info = await inspectPackArchive(fetched.zipPath, settings);
      // Follow whatever the URL currently serves: any version change counts.
      const available = current == null || info.version !== current;
      return { available, current, latest: info.version, ref: { type: 'url', url: src.url }, prefetchedZip: fetched.zipPath };
    }
    default:
      return { available: false, current, latest: current, ref: null, unmanaged: true };
  }
}

/**
 * Phase 1 of an update: fetch + inspect the new version, surface NEW optional files
 * (existing choices are kept automatically).
 */
export async function beginUpdate(instanceId, settings, onStatus) {
  const inst = await readInstance(instanceId);
  const check = await checkForUpdate(instanceId, settings);
  if (!check.ref) throw new Error('This instance has no update source.');
  const fetched = check.prefetchedZip
    ? { zipPath: check.prefetchedZip, source: inst.source, versionLabel: check.latest }
    : await fetchPackArchive(check.ref, settings, onStatus);
  const info = await inspectPackArchive(fetched.zipPath, settings);
  const known = inst.optionalChoices || {};
  const newOptionals = info.optionals.filter((o) => !(o.path in known));
  return {
    ticket: { zipPath: fetched.zipPath, source: fetched.source, versionLabel: fetched.versionLabel },
    name: inst.name,
    fromVersion: inst.packVersion,
    toVersion: fetched.versionLabel || info.version,
    newOptionals,
  };
}

/** Phase 2 of an update: apply archive with merged optional choices. */
export async function completeUpdate(instanceId, { ticket, newChoices = {} }, settings, events = {}) {
  const inst = await readInstance(instanceId);
  const choices = { ...(inst.optionalChoices || {}), ...newChoices };
  const { summary, meta } = await applyPackArchive(instanceId, ticket.zipPath, {
    choices,
    settings,
    source: ticket.source,
    ...events,
  });
  const updated = await readInstance(instanceId);
  if (ticket.versionLabel) {
    updated.packVersion = ticket.versionLabel;
    await writeInstance(updated);
  }
  return { summary, meta };
}
