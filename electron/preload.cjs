const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('militariaDesktop', {
  isElectron: true,
  platform: process.platform
});
