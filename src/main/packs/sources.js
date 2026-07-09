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
import { groupPackForInstance, refFromGroupPack, packDefaults } from '../group.js';

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
        iconUrl: project.icon_url || null,
      };
    }
    case 'curseforge': {
      onStatus('Contacting CurseForge…');
      const projectID = Number(String(ref.project).match(/\d+/)?.[0]);
      if (!projectID) throw new Error('Expected a CurseForge project ID (a number). Find it on the project page sidebar.');
      let title = `CurseForge ${projectID}`;
      let iconUrl = null;
      try {
        const project = await getCurseforgeProject(projectID, settings);
        title = project.name;
        iconUrl = project.logo?.thumbnailUrl || project.logo?.url || null;
      } catch { /* keyless */ }
      const file = await latestCurseforgePackFile(projectID, settings);
      onStatus(`Downloading ${file.fileName}…`);
      const dest = await tempArchivePath(file.fileName);
      await download(file.url, dest, { sha1: file.sha1 });
      return {
        zipPath: dest,
        source: { type: 'curseforge', projectId: projectID, fileId: file.fileID },
        versionLabel: file.displayName,
        suggestedName: title,
        iconUrl,
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
 * and a ticket (the cached archive) for phase 2. `ref.defaults` (from a group pack
 * entry) supplies name/version/mc/loader/icon for archives that can't self-describe.
 */
export async function beginImport(ref, settings, onStatus) {
  const defaults = ref.defaults || {};
  const fetched = await fetchPackArchive(ref, settings, onStatus);
  const info = await inspectPackArchive(fetched.zipPath, settings, defaults);
  return {
    ticket: {
      zipPath: fetched.zipPath,
      source: fetched.source,
      versionLabel: defaults.version || fetched.versionLabel,
      defaults,
    },
    name: defaults.name || fetched.suggestedName || info.name,
    version: defaults.version || fetched.versionLabel || info.version,
    mcVersion: info.mcVersion,
    loader: info.loader,
    optionals: info.optionals,
    iconUrl: fetched.iconUrl || defaults.icon || null,
  };
}

/**
 * Phase 2: create the instance and install the archive with the user's optional choices.
 * `extra` can attach group metadata: { server: {address,port}, groupPackId }.
 */
export async function completeImport({ ticket, name, choices = {}, extra = {} }, settings, events = {}) {
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
      defaults: ticket.defaults || {},
      ...events,
    });
    const updated = await readInstance(inst.id);
    if (ticket.versionLabel) updated.packVersion = ticket.versionLabel;
    if (extra.server) updated.server = extra.server;
    if (extra.groupPackId) updated.source = { ...updated.source, groupPackId: extra.groupPackId };
    if (extra.icon && /^https:\/\//.test(extra.icon)) updated.icon = { type: 'url', url: extra.icon };
    await writeInstance(updated);
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

  // Group-managed instances: a declared "version" in izlauncher.json wins over
  // source-native checks — bumping it is how the owner pushes an update,
  // whatever the pack's format or host.
  const groupPack = await groupPackForInstance(inst, settings).catch(() => null);
  if (groupPack?.version) {
    return {
      available: groupPack.version !== current,
      current,
      latest: groupPack.version,
      ref: refFromGroupPack(groupPack),
    };
  }
  const groupDefaults = groupPack ? packDefaults(groupPack) : null;
  const withDefaults = (result) => {
    if (groupDefaults && result.ref) result.ref = { ...result.ref, defaults: groupDefaults };
    return result;
  };
  return withDefaults(await nativeCheck());

  async function nativeCheck() {
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
}

/**
 * Phase 1 of an update: fetch + inspect the new version, surface NEW optional files
 * (existing choices are kept automatically).
 */
export async function beginUpdate(instanceId, settings, onStatus) {
  const inst = await readInstance(instanceId);
  const check = await checkForUpdate(instanceId, settings);
  if (!check.ref) throw new Error('This instance has no update source.');
  const defaults = check.ref.defaults || {};
  const fetched = check.prefetchedZip
    ? { zipPath: check.prefetchedZip, source: inst.source, versionLabel: check.latest }
    : await fetchPackArchive(check.ref, settings, onStatus);
  const info = await inspectPackArchive(fetched.zipPath, settings, defaults);
  const known = inst.optionalChoices || {};
  const newOptionals = info.optionals.filter((o) => !(o.path in known));
  return {
    ticket: {
      zipPath: fetched.zipPath,
      source: fetched.source,
      versionLabel: defaults.version || fetched.versionLabel,
      defaults,
    },
    name: inst.name,
    fromVersion: inst.packVersion,
    toVersion: defaults.version || fetched.versionLabel || info.version,
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
    defaults: ticket.defaults || {},
    ...events,
  });
  const updated = await readInstance(instanceId);
  if (ticket.versionLabel) {
    updated.packVersion = ticket.versionLabel;
    await writeInstance(updated);
  }
  return { summary, meta };
}
