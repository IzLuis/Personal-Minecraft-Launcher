// Auto-provisioned Java runtimes from Adoptium (Temurin), one per major version.
// Friends never have to install Java themselves.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';
import { fetchJson, download } from './util.js';
import { runtimesDir, cacheDir } from './paths.js';

function adoptiumParams() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  return { os, arch };
}

function javaBinaryName() {
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

/** Find bin/java inside an extracted runtime dir (handles macOS Contents/Home nesting). */
async function findJavaBinary(root) {
  const candidates = [
    path.join(root, 'bin', javaBinaryName()),
    path.join(root, 'Contents', 'Home', 'bin', javaBinaryName()),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = await findJavaBinary(path.join(root, e.name));
      if (found) return found;
    }
  }
  return null;
}

async function extractArchive(archive, destDir) {
  await fsp.rm(destDir, { recursive: true, force: true });
  await fsp.mkdir(destDir, { recursive: true });
  if (archive.endsWith('.zip')) {
    new AdmZip(archive).extractAllTo(destDir, true);
  } else {
    // .tar.gz — use system tar (preserves the executable bit; present on macOS/Linux).
    await new Promise((resolve, reject) => {
      const p = spawn('tar', ['-xzf', archive, '-C', destDir], { stdio: 'ignore' });
      p.on('error', reject);
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`))));
    });
  }
}

/**
 * Ensure a Temurin JRE for `major` exists locally; returns absolute path to the java binary.
 */
export async function ensureJava(major, { onStatus } = {}) {
  const dir = path.join(runtimesDir(), `java${major}`);
  const marker = path.join(dir, '.pmcl-java-path');
  if (fs.existsSync(marker)) {
    const bin = (await fsp.readFile(marker, 'utf8')).trim();
    if (fs.existsSync(bin)) return bin;
  }
  const { os, arch } = adoptiumParams();
  if (onStatus) onStatus(`Downloading Java ${major} runtime…`);
  const assets = await fetchJson(
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=${os}&architecture=${arch}&image_type=jre`
  );
  const asset = assets.find((a) => a.binary?.package?.link);
  if (!asset) throw new Error(`No Java ${major} runtime available for ${os}/${arch}`);
  const pkg = asset.binary.package;
  const archive = path.join(cacheDir(), 'java', pkg.name || `java${major}-${os}-${arch}${pkg.link.endsWith('.zip') ? '.zip' : '.tar.gz'}`);
  await download(pkg.link, archive, { sha1: undefined });
  if (onStatus) onStatus(`Extracting Java ${major}…`);
  await extractArchive(archive, dir);
  const bin = await findJavaBinary(dir);
  if (!bin) throw new Error(`Could not locate java binary in extracted runtime for Java ${major}`);
  await fsp.writeFile(marker, bin);
  await fsp.rm(archive, { force: true }).catch(() => {});
  return bin;
}
