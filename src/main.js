const {app , BrowserWindow , ipcMain , protocol , dialog} = require("electron")
const path = require("path")
const fs = require('fs')
const saveManager = require('./game/SaveManager')
const { createServer } = require('http')
const { Server } = require('socket.io')
const os = require('os')
const { autoUpdater } = require("electron-updater")

const instanceId = Date.now().toString();
app.setPath('userData', `${app.getPath('userData')}-${instanceId}`)

let mainWindow
let isQuitting = false
let io; // <-- AJOUT : Pour garder une référence au serveur
let httpServer;

function getLocalIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 450,
        webPreferences: {
            preload: path.join(__dirname , "preload.js")
        }
    })

    mainWindow.on("close" , (event) => {
        if (isQuitting) {
            return
        }
        event.preventDefault()
        mainWindow.webContents.send("check-if-host")
    })

    mainWindow.loadFile(path.join(__dirname , "index.html"))
    mainWindow.maximize()
}

app.whenReady().then(() => {

    protocol.registerFileProtocol('file', (request, callback) => {
        const url = request.url.substr(7)
        callback({ path: path.normalize(`${__dirname}/${url}`) })
    })

    ipcMain.on('start-server', (event) => {
        if (httpServer && httpServer.listening) {
            const port = httpServer.address().port;
            const ip = getLocalIp();
            if (mainWindow) mainWindow.webContents.send('server-started', { ip, port });
            return
        }
        
        const port = 3000;
        const ip = getLocalIp();
        httpServer = createServer();
        io = new Server(httpServer, { cors: { origin: '*' } });

        io.on('connection', (socket) => {
            console.log(`Nouveau client connecté: ${socket.id}`);
            socket.on('game-event', (data) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('server-event', { from: socket.id, data });
                }
            });
            socket.on('disconnect', () => {
                console.log(`Client déconnecté: ${socket.id}`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('server-event', { from: socket.id, data: { type: 'player-left' } });
                }
            });
        });

        httpServer.listen(port , "0.0.0.0" , () => {
            console.log(`Serveur démarré sur ${ip}:${port}`);
            if (mainWindow) mainWindow.webContents.send('server-started', { ip, port });
        });
    });

    ipcMain.on('stop-server', () => {
        try {
            if (io) {
                io.removeAllListeners();
                io.close();
                io = null;
            }
            if (httpServer) {
                httpServer.close();
                httpServer.removeAllListeners();
                httpServer = null;
            }
            if (mainWindow) mainWindow.webContents.send('server-stopped');
        } catch (e) {
            console.error('Error stopping server', e);
        }
    });

    ipcMain.on('send-to-clients', (event, { target, data }) => {
        if (!io) return;

        if (target === 'all') {
            io.emit('game-update', data);
        } else if (target === 'broadcast') {
            const exclude = data.exclude;
            const payload = data.payload;
            if (exclude) {
                for (const [id, s] of io.sockets.sockets) {
                    if (id !== exclude) s.emit('game-update', payload);
                }
            } else {
                io.emit('game-update', payload);
            }
        } else if (typeof target === 'string') {
            const socket = io.sockets.sockets.get(target);
            if (socket) socket.emit('game-update', data);
        }
    });

    ipcMain.handle('get-public-ip', async () => {
        const https = require('https');
        return new Promise((resolve) => {
            https.get('https://api.ipify.org?format=json', (res) => {
                let raw = '';
                res.on('data', (chunk) => raw += chunk);
                res.on('end', () => {
                    try {
                        const obj = JSON.parse(raw);
                        resolve(obj.ip || null);
                    } catch {
                        resolve(null);
                    }
                });
            }).on('error', () => resolve(null));
        });
    });

    ipcMain.handle('get-saves', saveManager.getSaves)
    ipcMain.on('save-saves', (event, data) => saveManager.saveSaves(data))
    ipcMain.on('save-world-slots', (event, slots) => saveManager.saveWorldSlots(slots))
    ipcMain.on('save-world-data', (event, { slotIndex, worldData }) => saveManager.saveWorldData(slotIndex, worldData))

    ipcMain.on('is-host-response', (event, isHost) => {
        if (isHost) {
            event.sender.send('host-quitting')
        } else {
            isQuitting = true
            app.quit()
        }
    })

    ipcMain.on('host-saved-and-ready-to-quit', () => {
        isQuitting = true
        app.quit()
    })

    ipcMain.handle('export-save', async (event, worldData) => {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Exporter la sauvegarde du monde',
            defaultPath: `save_${worldData.name}.json`,
            filters: [{ name: 'Fichiers de sauvegarde', extensions: ['json'] }]
        });

        if (!canceled && filePath) {
            fs.writeFileSync(filePath, JSON.stringify(worldData, null, 2))
            return { success: true }
        }
        return { success: false }
    });

    ipcMain.handle('import-save', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Importer une sauvegarde de monde',
            properties: ['openFile'],
            filters: [{ name: 'Fichiers de sauvegarde', extensions: ['json'] }]
        });

        if (!canceled && filePaths.length > 0) {
            const data = fs.readFileSync(filePaths[0], 'utf-8')
            return { success: true, data: JSON.parse(data) }
        }
        return { success: false }
    })

    try {
        autoUpdater.autoDownload = true
        autoUpdater.autoInstallOnAppQuit = true
        autoUpdater.checkForUpdatesAndNotify()
        autoUpdater.on("error" , (e) => console.warn("AutoUpdate error: " , e?.message || e))
    } catch (e) {
        console.warn("autoUpdate init failed: " , e?.message || e)
    }

    createWindow()
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', function () {
    if (httpServer) {
        io.close();
        httpServer.close();
    }
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.on("quit-app" , () => {
    if (mainWindow) {
        mainWindow.close()
    }
})