import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBaseDirs, migrateLegacyDataDir } from './paths.js';
import { registerIpc } from './ipc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 940,
      minHeight: 620,
      title: 'IzLauncher',
      icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
      backgroundColor: '#0f1115',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    // External links open in the system browser, never inside the launcher.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    return mainWindow;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    migrateLegacyDataDir();
    ensureBaseDirs();
    registerIpc(() => mainWindow);
    createWindow();
    setupAutoUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Launcher self-update from GitHub Releases (friends never touch a terminal:
  // the update downloads in the background and a "Restart to update" banner
  // appears in the UI). No-op in dev / unpublished builds.
  async function setupAutoUpdater() {
    try {
      const { getAutoUpdater } = await import('./updater.js');
      const autoUpdater = await getAutoUpdater();
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      const send = (payload) => mainWindow?.webContents.send('pmcl:event', payload);
      autoUpdater.on('update-available', (info) => send({ type: 'launcher-update-available', version: info.version }));
      autoUpdater.on('update-downloaded', (info) => send({ type: 'launcher-update-ready', version: info.version }));
      autoUpdater.on('error', () => {}); // dev mode / offline — silent
      const check = () => autoUpdater.checkForUpdates().catch(() => {});
      check();
      setInterval(check, 6 * 60 * 60 * 1000); // every 6 hours while the launcher stays open
    } catch { /* updater unavailable in dev */ }
  }
}
