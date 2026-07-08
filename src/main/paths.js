// Central place for every directory the launcher touches.
// PMCL_DATA_DIR overrides the base dir (used by tests and portable installs).
import path from 'node:path';
import fs from 'node:fs';

let baseDir = null;

export function setBaseDir(dir) {
  baseDir = dir;
}

export function dataDir() {
  if (baseDir) return baseDir;
  if (process.env.PMCL_DATA_DIR) {
    baseDir = process.env.PMCL_DATA_DIR;
    return baseDir;
  }
  // Lazy-required so pure-logic modules stay testable outside Electron.
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(process.env.HOME || '.', 'Library', 'Application Support')
        : process.env.XDG_DATA_HOME || path.join(process.env.HOME || '.', '.local', 'share');
  baseDir = path.join(appData, 'PersonalMCLauncher');
  return baseDir;
}

export const minecraftRoot = () => path.join(dataDir(), 'minecraft'); // shared versions/libraries/assets
export const instancesDir = () => path.join(dataDir(), 'instances');
export const instanceDir = (id) => path.join(instancesDir(), id);
export const runtimesDir = () => path.join(dataDir(), 'runtimes');
export const cacheDir = () => path.join(dataDir(), 'cache');
export const installersDir = () => path.join(cacheDir(), 'installers');
export const exportsDir = () => path.join(dataDir(), 'exports');
export const settingsFile = () => path.join(dataDir(), 'settings.json');
export const accountsFile = () => path.join(dataDir(), 'accounts.json');

export function ensureBaseDirs() {
  for (const d of [dataDir(), minecraftRoot(), instancesDir(), runtimesDir(), cacheDir(), installersDir(), exportsDir()]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
