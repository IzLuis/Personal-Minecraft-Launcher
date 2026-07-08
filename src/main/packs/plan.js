// Pure modpack planning logic (no fs / network) so it can be unit-tested.

/**
 * Turn a modrinth.index.json into the desired file map, honoring optional-mod choices.
 * choices: { [path]: boolean } — optional files default to OFF unless chosen.
 * Returns { files: {rel: {sha1, sha512?, size, url, optional, name}}, skippedOptional: [rel...] }
 */
export function planFilesFromMrpackIndex(index, choices = {}) {
  if (index.formatVersion !== 1) throw new Error(`Unsupported mrpack formatVersion: ${index.formatVersion}`);
  if (index.game && index.game !== 'minecraft') throw new Error(`Not a Minecraft pack: ${index.game}`);
  const files = {};
  const skippedOptional = [];
  for (const f of index.files || []) {
    const rel = String(f.path).replace(/\\/g, '/');
    const clientEnv = f.env?.client || 'required';
    if (clientEnv === 'unsupported') continue;
    const optional = clientEnv === 'optional';
    if (optional && !choices[rel]) {
      skippedOptional.push(rel);
      continue;
    }
    files[rel] = {
      sha1: f.hashes?.sha1?.toLowerCase(),
      sha512: f.hashes?.sha512?.toLowerCase(),
      size: f.fileSize,
      url: f.downloads?.[0],
      optional,
      name: rel.split('/').pop(),
    };
    if (!files[rel].url) throw new Error(`mrpack file has no download URL: ${rel}`);
  }
  return { files, skippedOptional };
}

/** List optional client files declared by an mrpack index (for the chooser UI). */
export function listMrpackOptionals(index) {
  return (index.files || [])
    .filter((f) => (f.env?.client || 'required') === 'optional')
    .map((f) => ({ path: String(f.path).replace(/\\/g, '/'), name: String(f.path).split('/').pop() }));
}

/**
 * Validate + normalize a CurseForge pack manifest.json.
 * Returns { name, version, mcVersion, loaderId, files: [{projectID, fileID, required}], overridesDir }
 */
export function parseCurseforgeManifest(manifest) {
  if (manifest.manifestType !== 'minecraftModpack') throw new Error('Not a CurseForge Minecraft modpack (manifestType).');
  const loaders = manifest.minecraft?.modLoaders || [];
  const primary = loaders.find((l) => l.primary) || loaders[0];
  return {
    name: manifest.name || 'CurseForge Pack',
    version: manifest.version || '0',
    mcVersion: manifest.minecraft?.version,
    loaderId: primary?.id || null,
    files: (manifest.files || []).map((f) => ({
      projectID: f.projectID,
      fileID: f.fileID,
      required: f.required !== false,
    })),
    overridesDir: manifest.overrides || 'overrides',
  };
}

/**
 * Diff old pack-managed files against the new desired map.
 * Everything not in oldFiles is user data and is never listed for deletion.
 *
 * Returns:
 *  - toDelete: rels present before but absent from the new pack
 *  - toDownload: rels needing (re)download (new, or hash changed)
 *  - unchanged: rels kept as-is
 */
export function planUpdate(oldFiles = {}, desired = {}) {
  const toDelete = [];
  const toDownload = [];
  const unchanged = [];
  for (const rel of Object.keys(oldFiles)) {
    if (!(rel in desired)) toDelete.push(rel);
  }
  for (const [rel, meta] of Object.entries(desired)) {
    const old = oldFiles[rel];
    if (old && old.sha1 && meta.sha1 && old.sha1 === meta.sha1) unchanged.push(rel);
    else toDownload.push(rel);
  }
  return { toDelete, toDownload, unchanged };
}

/** Parse "owner/repo" or a github.com URL into { owner, repo }. */
export function parseGithubRepo(input) {
  const s = String(input).trim();
  let m = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) m = s.match(/^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  if (!m) throw new Error('Expected a GitHub repo like "owner/repo" or a github.com URL.');
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

/** Parse a Modrinth project reference: slug, project id, or modrinth.com URL. */
export function parseModrinthRef(input) {
  const s = String(input).trim();
  const m = s.match(/modrinth\.com\/(?:modpack|mod|project)\/([^/\s#?]+)/i);
  if (m) return m[1];
  if (/^[\w!@$()`.+,"\-']{3,64}$/.test(s) && !s.includes('/')) return s;
  throw new Error('Expected a Modrinth project URL, slug, or ID.');
}
