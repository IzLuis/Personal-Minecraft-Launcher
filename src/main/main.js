import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBaseDirs } from './paths.js';
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
    ensureBaseDirs();
    registerIpc(() => mainWindow);
    createWindow();

    // Launcher self-update from GitHub Releases (no-op in dev / unpublished builds).
    try {
      const { default: pkg } = await import('electron-updater');
      const { autoUpdater } = pkg;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send('pmcl:event', { type: 'launcher-update-ready', version: info.version });
      });
      await autoUpdater.checkForUpdates().catch(() => {});
    } catch { /* updater unavailable in dev */ }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
