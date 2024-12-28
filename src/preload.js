const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Tags Management
    getTags: () => ipcRenderer.invoke('get-tags'),
    updateTags: (data) => ipcRenderer.invoke('update-tags', data),
    onTagsUpdated: (callback) => {
        ipcRenderer.on('tags-updated', (_event, value) => callback(value));
        return () => {
            ipcRenderer.removeAllListeners('tags-updated');
        };
    },

    // File System Operations
    getGifPath: (filename) => ipcRenderer.invoke('get-gif-path', filename),
    openGifsFolder: () => ipcRenderer.invoke('open-gifs-folder'),
    handleFileDrop: (filePath) => ipcRenderer.invoke('handle-file-drop', filePath),
    deleteGif: (filename) => ipcRenderer.invoke('delete-gif', filename),

    // Clipboard Operations
    copyToClipboard: (filename) => ipcRenderer.invoke('copyToClipboard', filename),

    // Notifications
    onNotification: (callback) => {
        ipcRenderer.on('show-notification', (_event, message) => callback(message));
        return () => {
            ipcRenderer.removeAllListeners('show-notification');
        };
    },

    // Window Events
    onWindowShown: (callback) => {
        ipcRenderer.on('window-shown', () => callback());
        return () => {
            ipcRenderer.removeAllListeners('window-shown');
        };
    }
});