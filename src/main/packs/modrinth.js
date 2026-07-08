// Modrinth API (no key required; identify via User-Agent).
import { fetchJson } from '../util.js';

const API = 'https://api.modrinth.com/v2';

export async function searchModrinth({ query = '', projectType = 'modpack', mcVersion, loader, limit = 20 }) {
  const facets = [[`project_type:${projectType}`]];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);
  const url = `${API}/search?query=${encodeURIComponent(query)}&limit=${limit}&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetchJson(url);
  return res.hits.map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    downloads: h.downloads,
    iconUrl: h.icon_url,
    author: h.author,
  }));
}

export async function getModrinthProject(idOrSlug) {
  return fetchJson(`${API}/project/${encodeURIComponent(idOrSlug)}`);
}

/** Versions of a project, newest first. Optionally filter by mc version / loader. */
export async function getModrinthVersions(idOrSlug, { mcVersion, loader } = {}) {
  const params = [];
  if (mcVersion) params.push(`game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`);
  if (loader && loader !== 'vanilla') params.push(`loaders=${encodeURIComponent(JSON.stringify([loader]))}`);
  const url = `${API}/project/${encodeURIComponent(idOrSlug)}/version${params.length ? `?${params.join('&')}` : ''}`;
  const versions = await fetchJson(url);
  return versions.map((v) => ({
    id: v.id,
    projectId: v.project_id,
    number: v.version_number,
    channel: v.version_type,
    date: v.date_published,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    files: v.files.map((f) => ({
      url: f.url,
      filename: f.filename,
      primary: f.primary,
      size: f.size,
      sha1: f.hashes?.sha1,
      sha512: f.hashes?.sha512,
    })),
  }));
}

export function primaryFile(version) {
  return version.files.find((f) => f.primary) || version.files[0];
}

/** Newest version of a modpack project (any channel — follow the author exactly). */
export async function latestModrinthPackVersion(idOrSlug) {
  const versions = await getModrinthVersions(idOrSlug);
  const withPack = versions.find((v) => primaryFile(v)?.filename?.endsWith('.mrpack'));
  if (!withPack) throw new Error('This Modrinth project has no .mrpack files (is it a modpack?).');
  return withPack;
}
