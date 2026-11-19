const { contextBridge, ipcRenderer } = require('electron');

const channels = ['sdk:sample', 'sdk:validation', 'sdk:status', 'sdk:error', 'sdk:frame', 'sdk:fps'];

contextBridge.exposeInMainWorld('unskipped', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, cb) => {
    if (!channels.includes(channel)) throw new Error(`unknown channel ${channel}`);
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
