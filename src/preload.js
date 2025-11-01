const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    quitApp: () => ipcRenderer.send('quit-app'),
    getSaves: () => ipcRenderer.invoke('get-saves'),
    saveSaves: (data) => ipcRenderer.send('save-saves', data),
    saveWorldSlots: (slots) => ipcRenderer.send('save-world-slots', slots), // Ajouter cette ligne
    saveWorldData: (slotIndex, worldData) => ipcRenderer.send('save-world-data', { slotIndex, worldData }),
    exportSave: (worldData) => ipcRenderer.invoke('export-save', worldData),
    importSave: () => ipcRenderer.invoke('import-save'),
    on: (channel, callback) => {
        if (typeof callback !== 'function') {
            console.warn('electronAPI.on: callback invalide pour le channel', channel);
            return;
        }
        ipcRenderer.on(channel, (event, ...args) => callback(...args));
    },
    send: (channel, data) =>ipcRenderer.send(channel, data),
    stopServer: () => ipcRenderer.send('stop-server'),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
    getPublicIp: () => ipcRenderer.invoke('get-public-ip'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateProgress: (cb) => ipcRenderer.on('update-download-progress', (_, p) => cb(p))
});