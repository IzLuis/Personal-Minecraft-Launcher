// IPC surface. Every handler validates inputs minimally and returns plain JSON.
// Long operations stream progress via the 'pmcl:event' channel.
import { app, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { JsonStore, SETTINGS_DEFAULTS } from './store.js';
import { settingsFile, instanceDir, exportsDir, dataDir } from './paths.js';
import { listMinecraftVersions } from './mojang.js';
import { listLoaderVersions, LOADERS } from './loaders.js';
import * as auth from './auth.js';
import * as instances from './instances.js';
import { launchInstance, killInstance, isRunning } from './launch.js';
import { beginImport, completeImport, checkForUpdate, beginUpdate, completeUpdate } from './packs/sources.js';
import { setOptionalEnabled } from './packs/install.js';
import { searchModrinth } from './packs/modrinth.js';
import { searchModsForInstance, installModrinthMod, setModOptionalFlag, exportInstanceAsMrpack } from './packs/authoring.js';

let settings;

export function getSettings() {
  if (!settings) settings = new JsonStore(settingsFile(), SETTINGS_DEFAULTS);
  return settings;
}

export function registerIpc(getWindow) {
  const s = getSettings();

  const emit = (payload) => getWindow()?.webContents.send('pmcl:event', payload);
  const instanceEvents = (id) => ({
    onStatus: (text) => emit({ type: 'status', instanceId: id, text }),
    onProgress: (p) => emit({ type: 'progress', instanceId: id, ...p }),
    onLog: (line) => emit({ type: 'log', instanceId: id, line }),
    onExit: (code) => emit({ type: 'exit', instanceId: id, code }),
  });

  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        return { ok: true, data: await fn(payload || {}) };
      } catch (err) {
        console.error(`[ipc:${channel}]`, err);
        return { ok: false, error: err?.message || String(err) };
      }
    });

  // App / settings
  handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir(), platform: process.platform }));
  handle('settings:get', () => s.data);
  handle('settings:set', (patch) => { s.patch(patch); return s.data; });
  handle('app:openPath', ({ target }) => {
    const allowed = {
      data: dataDir(),
      exports: exportsDir(),
    };
    const p = allowed[target];
    if (!p) throw new Error('Unknown path target');
    return shell.openPath(p);
  });

  // Accounts
  handle('accounts:list', () => auth.listAccounts());
  handle('accounts:addMicrosoft', () => auth.addMicrosoftAccount());
  handle('accounts:addOffline', ({ name }) => auth.addOfflineAccount(name));
  handle('accounts:remove', ({ id }) => auth.removeAccount(id));
  handle('accounts:setActive', ({ id }) => auth.setActiveAccount(id));

  // Version catalogs
  handle('mc:versions', ({ includeSnapshots }) => listMinecraftVersions({ includeSnapshots }));
  handle('mc:loaders', () => LOADERS);
  handle('mc:loaderVersions', ({ loader, mcVersion }) => listLoaderVersions(loader, mcVersion));

  // Instances
  handle('instances:list', async () => {
    const list = await instances.listInstances();
    return list.map((i) => ({ ...i, running: isRunning(i.id) }));
  });
  handle('instances:get', async ({ id }) => ({ ...(await instances.readInstance(id)), running: isRunning(id) }));
  handle('instances:create', (opts) => instances.createInstance(opts));
  handle('instances:delete', ({ id }) => instances.deleteInstance(id));
  handle('instances:rename', ({ id, name }) => instances.renameInstance(id, name));
  handle('instances:patchSettings', ({ id, patch }) => instances.patchInstanceSettings(id, patch));
  handle('instances:openFolder', ({ id }) => shell.openPath(instanceDir(id)));

  // Mods
  handle('mods:list', ({ id }) => instances.listMods(id));
  handle('mods:toggle', ({ id, file }) => instances.toggleMod(id, file));
  handle('mods:delete', ({ id, file }) => instances.deleteMod(id, file));
  handle('mods:addLocal', async ({ id }) => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Add mod jars',
      filters: [{ name: 'Mod jars', extensions: ['jar'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled) return instances.listMods(id);
    for (const f of res.filePaths) await instances.addLocalMod(id, f);
    return instances.listMods(id);
  });
  handle('mods:searchModrinth', ({ id, query }) => searchModsForInstance(id, query));
  handle('mods:installModrinth', ({ id, project, optional }) => installModrinthMod(id, project, { optional }));
  handle('mods:setOptionalFlag', ({ id, rel, optional }) => setModOptionalFlag(id, rel, optional));
  handle('mods:setOptionalEnabled', ({ id, rel, enabled }) => setOptionalEnabled(id, rel, enabled, s));

  // Pack import (two-phase so the UI can show the optional-mods chooser)
  handle('packs:pickFile', async () => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Import modpack',
      filters: [{ name: 'Modpacks', extensions: ['mrpack', 'zip'] }],
      properties: ['openFile'],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  handle('packs:searchModrinth', ({ query }) => searchModrinth({ query, projectType: 'modpack' }));
  handle('packs:beginImport', ({ ref }) => beginImport(ref, s, (text) => emit({ type: 'status', instanceId: null, text })));
  handle('packs:completeImport', async ({ ticket, name, choices }) => {
    const result = await completeImport({ ticket, name, choices }, s, instanceEvents(null));
    emit({ type: 'instances-changed' });
    return result;
  });

  // Updates
  handle('packs:checkUpdate', ({ id }) => checkForUpdate(id, s));
  handle('packs:beginUpdate', ({ id }) => beginUpdate(id, s, (text) => emit({ type: 'status', instanceId: id, text })));
  handle('packs:completeUpdate', async ({ id, ticket, newChoices }) => {
    const result = await completeUpdate(id, { ticket, newChoices }, s, instanceEvents(id));
    emit({ type: 'instances-changed' });
    return result;
  });

  // Export / authoring
  handle('packs:export', async ({ id, version, summary }) => {
    const result = await exportInstanceAsMrpack(id, { version, summary });
    shell.showItemInFolder(result.path);
    return result;
  });

  // Launch
  handle('launch:play', ({ id }) => launchInstance(id, s, instanceEvents(id)));
  handle('launch:kill', ({ id }) => killInstance(id));
}
