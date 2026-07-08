// Shared access to electron-updater's singleton (used by main.js wiring and IPC).
let cached = null;

export async function getAutoUpdater() {
  if (cached) return cached;
  const { default: pkg } = await import('electron-updater');
  cached = pkg.autoUpdater;
  return cached;
}
