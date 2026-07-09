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
import { getGroupConfig, groupInstallStates, refFromGroupPack } from './group.js';
import { getAutoUpdater } from './updater.js';
import { pingServer } from './ping.js';

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
  handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: dataDir(),
    platform: process.platform,
    locale: app.getLocale(),
  }));
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
  handle('app:openExternal', ({ url }) => {
    if (!/^https:\/\//.test(String(url))) throw new Error('Only https links can be opened.');
    return shell.openExternal(url);
  });
  handle('app:installUpdate', async () => {
    const updater = await getAutoUpdater();
    updater.quitAndInstall();
  });
  handle('app:checkLauncherUpdate', async () => {
    const updater = await getAutoUpdater();
    const res = await updater.checkForUpdates();
    return { current: app.getVersion(), latest: res?.updateInfo?.version || app.getVersion() };
  });

  // Group config (packs catalog, announcements, discord)
  handle('group:get', async ({ force }) => {
    const res = await getGroupConfig(s, { force });
    const installs = await groupInstallStates(res.config);
    return { ...res, installs };
  });
  handle('group:beginInstall', async ({ pack }) => {
    const ref = refFromGroupPack(pack);
    return beginImport(ref, s, (text) => emit({ type: 'status', instanceId: null, text }));
  });
  handle('group:markAnnouncementsSeen', ({ ids }) => {
    const seen = new Set(s.get('seenAnnouncements', []));
    for (const id of ids || []) seen.add(String(id));
    s.set('seenAnnouncements', [...seen].slice(-500));
    return s.get('seenAnnouncements');
  });
  handle('group:rememberPacks', ({ ids }) => {
    s.set('knownGroupPacks', [...new Set(ids || [])].slice(-200));
    return s.get('knownGroupPacks');
  });

  // Server status (SLP ping) + clipboard for "copy IP"
  handle('server:ping', ({ address, port }) => pingServer(String(address), Number(port) || 25565));
  handle('app:copyText', async ({ text }) => {
    const { clipboard } = await import('electron');
    clipboard.writeText(String(text ?? ''));
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
  handle('instances:setServer', ({ id, address }) => instances.setInstanceServer(id, address));
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
  handle('packs:completeImport', async ({ ticket, name, choices, extra }) => {
    const result = await completeImport({ ticket, name, choices, extra }, s, instanceEvents(null));
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
  handle('launch:play', ({ id, join }) => launchInstance(id, s, instanceEvents(id), { join: join !== false }));
  handle('launch:kill', ({ id }) => killInstance(id));
}
