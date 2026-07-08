// CurseForge integration.
// With an API key (free from console.curseforge.com) we use the official API —
// batch metadata, hashes, update checks. Without a key we fall back to the
// public website download endpoint, which redirects to the CDN; we learn the
// file name from the final URL but get no hashes.
import { fetchJson, USER_AGENT } from '../util.js';

const API = 'https://api.curseforge.com/v1';
const WEB_API = 'https://www.curseforge.com/api/v1';

function apiKey(settings) {
  return settings?.get?.('curseforgeApiKey', '') || process.env.CF_API_KEY || '';
}

async function cfApi(pathname, settings, init = {}) {
  const key = apiKey(settings);
  if (!key) throw new Error('CurseForge API key not set (Settings → CurseForge API key).');
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'x-api-key': key, 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`CurseForge API ${pathname} failed: ${res.status}`);
  return (await res.json()).data;
}

function sha1FromHashes(hashes) {
  return hashes?.find((h) => h.algo === 1)?.value?.toLowerCase();
}

/** Keyless: resolve final CDN URL (and thus the file name) via the website endpoint. */
async function resolveViaWebsite(projectID, fileID) {
  const url = `${WEB_API}/mods/${projectID}/files/${fileID}/download`;
  const res = await fetch(url, { redirect: 'follow', method: 'HEAD', headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
  const final = res && res.ok ? res.url : null;
  if (!final) {
    // Some CDNs reject HEAD; retry with GET but drop the body.
    const res2 = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
    if (!res2.ok) throw new Error(`CurseForge download failed for project ${projectID} file ${fileID}: ${res2.status}`);
    try { await res2.body?.cancel(); } catch { /* ignore */ }
    return res2.url;
  }
  return final;
}

/**
 * Resolve CurseForge manifest entries into download descriptors.
 * refs: [{projectID, fileID, required}]
 * Returns [{projectID, fileID, required, fileName, url, sha1?, size?}]
 */
export async function resolveCurseforgeFiles(refs, settings, { tolerateFailures = false } = {}) {
  if (!refs.length) return [];
  const out = [];
  const key = apiKey(settings);
  if (key) {
    const data = await cfApi('/mods/files', settings, { method: 'POST', body: JSON.stringify({ fileIds: refs.map((r) => r.fileID) }) });
    const byId = new Map(data.map((f) => [f.id, f]));
    for (const ref of refs) {
      const f = byId.get(ref.fileID);
      if (!f) {
        if (tolerateFailures) { out.push({ ...ref, fileName: null }); continue; }
        throw new Error(`CurseForge file ${ref.fileID} (project ${ref.projectID}) not found via API.`);
      }
      let url = f.downloadUrl;
      if (!url) {
        // Author disabled API distribution; the website endpoint usually still works.
        url = await resolveViaWebsite(ref.projectID, ref.fileID).catch(() => null);
      }
      if (!url) {
        if (tolerateFailures) { out.push({ ...ref, fileName: f.fileName }); continue; }
        throw new Error(
          `"${f.displayName || f.fileName}" blocks automated downloads. Download it manually from https://www.curseforge.com/projects/${ref.projectID} into the instance mods folder, then retry.`
        );
      }
      out.push({ ...ref, fileName: f.fileName, url, sha1: sha1FromHashes(f.hashes), size: f.fileLength });
    }
    return out;
  }
  // Keyless path: sequential-ish resolution through the website endpoint.
  for (const ref of refs) {
    try {
      const finalUrl = await resolveViaWebsite(ref.projectID, ref.fileID);
      const fileName = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || `cf-${ref.fileID}.jar`);
      out.push({ ...ref, fileName, url: finalUrl });
    } catch (err) {
      if (tolerateFailures) { out.push({ ...ref, fileName: null }); continue; }
      throw new Error(
        `Could not resolve CurseForge project ${ref.projectID} file ${ref.fileID} without an API key (${err.message}). ` +
        'Add a free API key in Settings for reliable CurseForge support.'
      );
    }
  }
  return out;
}

/** Get modpack project info (needs API key). */
export async function getCurseforgeProject(projectID, settings) {
  return cfApi(`/mods/${projectID}`, settings);
}

/** Latest non-server pack file for a CF modpack project. */
export async function latestCurseforgePackFile(projectID, settings) {
  let files;
  const key = apiKey(settings);
  if (key) {
    files = await cfApi(`/mods/${projectID}/files?pageSize=50`, settings);
  } else {
    const res = await fetchJson(`${WEB_API}/mods/${projectID}/files?pageIndex=0&pageSize=50`);
    files = res.data;
  }
  const candidates = (files || []).filter((f) => !f.isServerPack && (f.fileName || '').endsWith('.zip'));
  candidates.sort((a, b) => String(b.fileDate || '').localeCompare(String(a.fileDate || '')));
  if (!candidates.length) throw new Error(`No downloadable pack files found for CurseForge project ${projectID}.`);
  const f = candidates[0];
  let url = f.downloadUrl;
  if (!url) url = await resolveViaWebsite(projectID, f.id);
  return { fileID: f.id, fileName: f.fileName, displayName: f.displayName || f.fileName, url, sha1: sha1FromHashes(f.hashes) };
}
