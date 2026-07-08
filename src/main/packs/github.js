// GitHub Releases as a free, private-ish pack distribution channel for friend groups:
// the pack author uploads <pack>.mrpack to a release; friends' launchers poll
// /releases/latest and offer a one-click update when the tag changes.
import { fetchJson } from '../util.js';

export async function latestGithubRelease(owner, repo) {
  const rel = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    Accept: 'application/vnd.github+json',
  });
  const asset = (rel.assets || []).find((a) => a.name.endsWith('.mrpack')) ||
    (rel.assets || []).find((a) => a.name.endsWith('.zip'));
  if (!asset) {
    throw new Error(`Latest release of ${owner}/${repo} has no .mrpack (or .zip) asset attached.`);
  }
  return {
    tag: rel.tag_name,
    name: rel.name || rel.tag_name,
    publishedAt: rel.published_at,
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
    body: rel.body || '',
  };
}
