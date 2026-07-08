import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const USER_AGENT = 'IzLuis/Personal-Minecraft-Launcher (github.com/IzLuis/Personal-Minecraft-Launcher)';

export async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

export async function hashFile(file, algo = 'sha1') {
  const hash = crypto.createHash(algo);
  await pipeline(fs.createReadStream(file), async function* (source) {
    for await (const chunk of source) hash.update(chunk);
  });
  return hash.digest('hex');
}

export function hashBuffer(buf, algo = 'sha1') {
  return crypto.createHash(algo).update(buf).digest('hex');
}

/**
 * Join `rel` under `base`, refusing absolute paths and `..` escapes (zip-slip guard).
 * Returns the absolute path or throws.
 */
export function safeJoin(base, rel) {
  const cleaned = String(rel).replace(/\\/g, '/');
  if (path.isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned)) throw new Error(`Unsafe absolute path in archive: ${rel}`);
  const target = path.resolve(base, cleaned);
  const normBase = path.resolve(base);
  if (target !== normBase && !target.startsWith(normBase + path.sep)) {
    throw new Error(`Unsafe path escapes target directory: ${rel}`);
  }
  return target;
}

/**
 * Compare dotted/loose version strings ("1.2.10" > "1.2.9", "0.5.0-beta" < "0.5.0").
 * Returns -1 | 0 | 1. Non-numeric tags compare alphabetically after numerics.
 */
export function compareVersions(a, b) {
  const norm = (v) => String(v).trim().replace(/^v/i, '');
  const [aMain, aPre = ''] = norm(a).split('-', 2);
  const [bMain, bPre = ''] = norm(b).split('-', 2);
  const as = aMain.split('.').map((n) => parseInt(n, 10));
  const bs = bMain.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = Number.isFinite(as[i]) ? as[i] : 0;
    const y = Number.isFinite(bs[i]) ? bs[i] : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (aPre === bPre) return 0;
  if (aPre === '') return 1; // release > prerelease
  if (bPre === '') return -1;
  return aPre < bPre ? -1 : 1;
}

/**
 * Download `url` to `dest` (atomic: temp file + rename).
 * Verifies sha1 when given. Skips download when dest already matches sha1.
 */
export async function download(url, dest, { sha1, headers = {}, onProgress, expectedSize } = {}) {
  if (sha1 && fs.existsSync(dest)) {
    try {
      if ((await hashFile(dest, 'sha1')) === sha1.toLowerCase()) return dest;
    } catch { /* re-download */ }
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part-${crypto.randomBytes(4).toString('hex')}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed (${res.status}) ${url}`);
    const total = expectedSize || Number(res.headers.get('content-length')) || 0;
    let received = 0;
    const hash = crypto.createHash('sha1');
    const counter = async function* (source) {
      for await (const chunk of source) {
        received += chunk.length;
        hash.update(chunk);
        if (onProgress) onProgress(received, total);
        yield chunk;
      }
    };
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(tmp));
    if (sha1 && hash.digest('hex') !== sha1.toLowerCase()) {
      throw new Error(`SHA1 mismatch for ${url}`);
    }
    await fsp.rename(tmp, dest);
    return dest;
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }
}

/**
 * Download many files with limited concurrency.
 * files: [{ url, dest, sha1?, size?, headers?, label? }]
 * onProgress(done, total, label) fires as each file completes.
 * Throws an AggregateError listing every failed file (after all settle).
 */
export async function downloadMany(files, { concurrency = 6, onProgress } = {}) {
  let done = 0;
  const failures = [];
  const queue = [...files];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      try {
        await download(f.url, f.dest, { sha1: f.sha1, headers: f.headers, expectedSize: f.size });
      } catch (err) {
        // one retry for flaky CDNs
        try {
          await download(f.url, f.dest, { sha1: f.sha1, headers: f.headers, expectedSize: f.size });
        } catch (err2) {
          failures.push({ file: f, error: err2 });
        }
      }
      done++;
      if (onProgress) onProgress(done, files.length, f.label || path.basename(f.dest));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length || 1) }, worker));
  if (failures.length) {
    const err = new AggregateError(failures.map((f) => f.error), `${failures.length} download(s) failed`);
    err.failures = failures;
    throw err;
  }
}

/** Recursively list files under dir, as relative POSIX paths. */
export async function walkFiles(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else if (e.isFile()) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'instance';
}

export function nowIso() {
  return new Date().toISOString();
}
