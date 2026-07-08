// Bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, payload) {
  const res = await ipcRenderer.invoke(channel, payload);
  if (!res || res.ok !== true) throw new Error(res?.error || `IPC ${channel} failed`);
  return res.data;
}

contextBridge.exposeInMainWorld('pmcl', {
  invoke,
  onEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pmcl:event', listener);
    return () => ipcRenderer.removeListener('pmcl:event', listener);
  },
});
