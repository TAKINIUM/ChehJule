import { NetworkManager } from '../network/NetworkManager.js'

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene')
        this.player = null
        this.keys = null
        this.isHost = false
        this.playerName = ''
        this.myPeerId = null
        this.otherPlayers = new Map()
        this.doors = null
    }

    init(data) {
        this.isHost = data.isHost
        this.playerName = data.playerName
        this.serverAddress = data.serverAddress 
        this.worldData = data.worldData || { name: 'Nouveau Monde', players: {}, doors: [] }
        this.slotIndex = data.slotIndex
        this.mySocketId = null
        this.runMode = data.runMode || (this.isHost && !this.serverAddress ? 'host' : 'client') // new
        this.otherPlayers.clear()
    }

    preload() {
        this.load.image('tiles', 'assets/images/tileset.png')
        this.load.tilemapTiledJSON('map', 'assets/maps/map.json')
        this.load.image('player', 'assets/images/player.png')
        this.load.spritesheet("doors" , "assets/images/Doors.png" , { frameWidth: 32, frameHeight: 32 })
    }

    async create() {

        // --- Carte ---
        const map = this.make.tilemap({ key: 'map' })
        const tileset = map.addTilesetImage('Tileset', 'tiles')
        map.createLayer('Sol', tileset, 0, 0)
        map.createLayer('Plancher', tileset, 0, 0)
        const wallsLayer = map.createLayer('Mur', tileset, 0, 0)
        wallsLayer.setCollisionByExclusion([-1])

        // --- Portes ---
        this.doors = this.physics.add.staticGroup()
        const doorLayer = map.getObjectLayer("Porte")
        const doorObjects = doorLayer ? doorLayer.objects : []
        doorObjects.forEach((doorObj , index) => {

            const px = doorObj.x + (doorObj.width || 32) / 2
            const py = doorObj.y + (doorObj.height || 32) / 2

            const door = this.doors.create(px, py, "doors").setOrigin(0.5, 0.5)
            door.doorId = index

            const propIsOpen = (doorObj.properties || []).find(p => p.name === "isOpen")
            door.isOpen = propIsOpen ? !!propIsOpen.value : false

            const propDir = (doorObj.properties || []).find(p => p.name === "direction")
            door.direction = propDir ? String(propDir.value).toLowerCase() : null

            if (!door.direction) {
                if (doorObj.rotation) {
                    const r = ((doorObj.rotation % 360) + 360) % 360
                    if (r === 90) door.direction = 'right'
                    else if (r === 180) door.direction = 'down'
                    else if (r === 270) door.direction = 'left'
                    else door.direction = 'up'
                } else {
                    door.direction = (doorObj.height > doorObj.width) ? 'up' : 'right'
                }
            }

            door.isVertical = (door.direction === 'up' || door.direction === 'down')

            const savedDoorState = this.worldData.doors[index];
            if (savedDoorState !== undefined) {
                door.isOpen = savedDoorState.isOpen;
            }

            this.updateDoorState(door , door.isOpen)
        })

         // Création du joueur local (important de le faire avant le réseau)
        const savedPlayerPos = this.worldData.players[this.playerName]
        const spawnLayer = map.getObjectLayer('PlayerSpawn');
        const spawnPointObj = spawnLayer ? spawnLayer.objects[0] : null;
        let spawnPoint = savedPlayerPos || spawnPointObj || { x: 100, y: 100 }
        this.player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, 'player')
        this.player.body.setSize(24, 24)
        this.physics.add.collider(this.player, wallsLayer)
        this.physics.add.collider(this.player, this.doors)
        this.player.nameText = this.add.text(0, 0, this.playerName, { font: '14px Arial', fill: '#ffffff' }).setOrigin(0.5)

        // Menu Pause
        this.pauseMenu = this.add.group();
        const rect = this.add.rectangle(this.cameras.main.width / 2, this.cameras.main.height / 2, 300, 200, 0x000000, 0.8).setScrollFactor(0)
        const resumeBtn = this.add.text(rect.x, rect.y - 50, 'Continuer', { font: '24px Arial', fill: '#fff' }).setOrigin(0.5).setInteractive().setScrollFactor(0)
        const saveBtn = this.add.text(rect.x, rect.y, 'Sauvegarder', { font: '24px Arial', fill: '#fff' }).setOrigin(0.5).setInteractive().setScrollFactor(0)
        const menuBtn = this.add.text(rect.x, rect.y + 50, 'Retour au Menu', { font: '24px Arial', fill: '#fff' }).setOrigin(0.5).setInteractive().setScrollFactor(0)
        this.pauseMenu.addMultiple([rect, resumeBtn, saveBtn, menuBtn])
        this.pauseMenu.setVisible(false)
        saveBtn.on('pointerdown', () => this.saveCurrentWorldState())
        resumeBtn.on('pointerdown', () => this.togglePauseMenu(false))
        menuBtn.on('pointerdown', () => { this.leaveWorldAndGoToMenu(); });
        this.input.keyboard.on('keydown-ESC', () => this.togglePauseMenu(!this.pauseMenu.visible))
        
        this.events.once('shutdown', () => this.cleanupResources());
        this.events.once('destroy', () => this.cleanupResources());
        
        // Logique de fermeture (app quit)
        this._onCheckIfHost = () => { window.electronAPI.send('is-host-response', this.isHost) };
        this._onHostQuitting = () => {
            if (this.isHost) {
                console.log("L'hôte sauvegarde le monde avant de quitter...")
                this.saveCurrentWorldState()
                NetworkManager.disconnectAll()
                window.electronAPI.send('host-saved-and-ready-to-quit')
            }
        };
        window.electronAPI.on('check-if-host', this._onCheckIfHost)
        window.electronAPI.on('host-quitting', this._onHostQuitting)

        // --- Caméra et contrôles ---
        this.cameras.main.startFollow(this.player, true)
        this.cameras.main.setLerp(0.1 , 0.1)
        this.cameras.main.setZoom(2)
        this.keys = this.input.keyboard.addKeys({ up: 'Z', down: 'S', left: 'Q', right: 'D' , interact: "E"})
    
        this.initializeNetwork()
    }

    initializeNetwork() {
        const loadingText = (this.runMode === 'solo')
            ? null
            : this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'Connexion en cours...', { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5).setScrollFactor(0);
        
        NetworkManager.handleData = (data) => {
            if (!data || !data.type) {
                console.warn("Message réseau reçu sans données ou sans type, ignoré.", data);
                return;
            }
            switch (data.type) {
                case 'host-disconnected':
                    // Retourne proprement au menu côté client
                    this.leaveWorldAndGoToMenu();
                    break;
                case 'full-world-state':
                    data.doors.forEach((doorState, index) => {
                        const doorToUpdate = this.doors.children.entries[index];
                        if (doorToUpdate) this.updateDoorState(doorToUpdate, doorState.isOpen);
                    });
                    data.players.forEach(p => {
                        if (p.socketId !== this.mySocketId) {
                            this.addOrUpdateOtherPlayer(p.socketId, p);
                        }
                    });
                    break;
                case "state-update":
                    if (data.players) {
                        data.players.forEach(p => {
                            if (p.socketId !== this.mySocketId) {
                                this.addOrUpdateOtherPlayer(p.socketId, p);
                            }
                        });
                    }
                    if (data.doors) {
                         data.doors.forEach((doorState, index) => {
                            const doorToUpdate = this.doors.children.entries[index];
                            if (doorToUpdate) this.updateDoorState(doorToUpdate, doorState.isOpen);
                        });
                    }
                    break;
                case "player-left":
                    console.log(`Le joueur ${data.socketId} est parti.`);
                    this.removeOtherPlayer(data.socketId);
                    break;
                case "door-update":
                    const doorToUpdate = this.doors.children.entries.find(d => d.doorId === data.doorId);
                    if (doorToUpdate) this.updateDoorState(doorToUpdate, data.isOpen);
                    break;
            }
        }

        // SOLO: no server, no sockets
        if (this.runMode === 'solo') {
            this.mySocketId = 'local';
            if (loadingText) loadingText.destroy();
            return;
        }

        if (this.isHost) {
            if (window.electronAPI.removeAllListeners) {
                window.electronAPI.removeAllListeners('server-event');
            }

            // Définir UNE callback et l’enregistrer
            this._onServerEvent = ({ from, data }) => {
                if (!data || !data.type) return;
                switch (data.type) {
                    case 'player-joined':
                        console.log(`Le joueur ${data.playerInfo.name} a rejoint, envoi de l'état du monde.`);
                        this.addOrUpdateOtherPlayer(from, data.playerInfo);
                        this.sendFullStateToPlayer(from);
                        window.electronAPI.send('send-to-clients', {
                            target: 'broadcast',
                            data: { 
                                exclude: from,
                                payload: { type: 'state-update', players: [this.getCurrentPlayerState(from, data.playerInfo)] }
                            }
                        });
                        break;
                    case 'player-left':
                        const p = this.otherPlayers.get(from);
                        if (p) {
                            const leftName = p.nameText?.text || ('socket-' + from);
                            this.worldData.players[leftName] = { x: p.x, y: p.y };
                            window.electronAPI.saveWorldData(this.slotIndex, this.worldData);
                        }
                        this.removeOtherPlayer(from);
                        window.electronAPI.send('send-to-clients', {
                            target: 'all',
                            data: { type: 'player-left', socketId: from }
                        });
                        break;
                    case 'player-update':
                        this.addOrUpdateOtherPlayer(from, { x: data.x, y: data.y, name: data.name });
                        window.electronAPI.send('send-to-clients', {
                            target: 'broadcast',
                            data: {
                                exclude: from,
                                payload: { type: 'state-update', players: [this.getCurrentPlayerState(from, data)] }
                            }
                        });
                        break;
                    case 'door-update':
                        const doorToUpdate = this.doors.children.entries.find(d => d.doorId === data.doorId);
                        if (doorToUpdate) {
                            this.updateDoorState(doorToUpdate, data.isOpen);
                            window.electronAPI.send('send-to-clients', {
                                target: 'all',
                                data: { type: 'door-update', doorId: data.doorId, isOpen: data.isOpen }
                            });
                        }
                        break;
                }
            };
            window.electronAPI.on('server-event', this._onServerEvent);

            NetworkManager.host(async (ip, port, socketId) => {
                this.mySocketId = socketId;
                loadingText.destroy();
                const y = 16;
                this.add.text(16, y, `Local: ${ip}:${port}`, { font: '18px Arial', fill: '#ffffff', backgroundColor: '#000000' }).setScrollFactor(0);
                // Try to fetch public IP (needs port-forward 3000)
                try {
                    const publicIp = await window.electronAPI.getPublicIp();
                    if (publicIp) {
                        this.add.text(16, y + 24, `Public: ${publicIp}:${port}`, { font: '18px Arial', fill: '#ffff99', backgroundColor: '#000000' }).setScrollFactor(0);
                    }
                } catch {}
            })
            return
        }

        NetworkManager.join(this.serverAddress, (socketId) => {
            this.mySocketId = socketId
            if (loadingText) loadingText.destroy()
            this.add.text(16, 16, 'Connecté !', { font: '18px Arial', fill: '#00ff00', backgroundColor: '#000000' }).setScrollFactor(0);
            NetworkManager.send({
                type: 'player-joined',
                socketId: this.mySocketId,
                playerInfo: { name: this.playerName, x: this.player.x, y: this.player.y }
            })
        })
    }

    addOrUpdateOtherPlayer(peerId, playerInfo) {
        if (!this.otherPlayers.has(peerId)) {
            const otherPlayer = this.add.sprite(playerInfo.x, playerInfo.y, 'player')
            otherPlayer.nameText = this.add.text(playerInfo.x, playerInfo.y - 20, playerInfo.name || 'Joueur', { font: '14px Arial', fill: '#ffffff' }).setOrigin(0.5)
            otherPlayer.targetX = playerInfo.x
            otherPlayer.targetY = playerInfo.y
            this.otherPlayers.set(peerId, otherPlayer)
        } else {
            const otherPlayer = this.otherPlayers.get(peerId)
            otherPlayer.targetX = playerInfo.x
            otherPlayer.targetY = playerInfo.y
            if (playerInfo.name) {
                otherPlayer.nameText.setText(playerInfo.name);
            }
        }
    }

    removeOtherPlayer(peerId) {
        const playerToRemove = this.otherPlayers.get(peerId)
        if (playerToRemove) {
            if (this.isHost) {
                const name = playerToRemove.nameText?.text || ('socket-' + peerId);
                this.worldData.players[name] = { x: playerToRemove.x, y: playerToRemove.y };
                window.electronAPI.saveWorldData(this.slotIndex, this.worldData);
            }
            playerToRemove.nameText.destroy()
            playerToRemove.destroy()
            this.otherPlayers.delete(peerId)
            console.log(`Joueur ${peerId} supprimé de la scène.`);
        }
    }
    
    getDoorFrameIndex(door) {
        const mapDir = { up: 0, right: 1, down: 2, left: 3 }
        const base = mapDir[door.direction] !== undefined ? mapDir[door.direction] : 0
        return base + (door.isOpen ? 4 : 0)
    }

    updateDoorState(door, isOpen) {
        door.isOpen = !!isOpen

        const frameIndex = this.getDoorFrameIndex(door)
        door.setFrame(frameIndex)

        if (door.body) {
            // pour un static body, désactiver body.remove ou body.enable fonctionne
            if (door.isOpen) {
                // enlever la hitbox pour traverser
                door.body.enable = false
                // si checkCollision existe, neutraliser
                if (door.body.checkCollision) {
                    door.body.checkCollision.none = true
                }
            } else {
                // réactiver la hitbox
                door.body.enable = true
                if (door.body.checkCollision) {
                    door.body.checkCollision.none = false
                }
            }
        }
    }

    handleInteraction() {
        if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
            const closestDoor = this.physics.closest(this.player, this.doors.getChildren())
            if (closestDoor && Phaser.Math.Distance.Between(this.player.x, this.player.y, closestDoor.x, closestDoor.y) < 64) {
                // Offline/solo: apply immediately
                if (this.runMode === 'solo' || (this.isHost && !NetworkManager.socket)) {
                    this.updateDoorState(closestDoor, !closestDoor.isOpen)
                    return
                }
                NetworkManager.send({
                    type: 'door-update',
                    doorId: closestDoor.doorId,
                    isOpen: !closestDoor.isOpen
                });
            }
        }
    }

    broadcastFullState() {
        if (!this.isHost) return;
        const state = this.getCurrentWorldState();
        window.electronAPI.send('send-to-clients', {
            target: 'broadcast', // Cible tout le monde sauf l'expéditeur (l'hôte)
            data: {
                exclude: this.mySocketId, // L'ID de l'hôte
                payload: { type: 'state-update', players: state.players, doors: state.doors }
            }
        });
    }

    sendFullStateToPlayer(socketId) {
        if (!this.isHost) return;
        const state = this.getCurrentWorldState();
        window.electronAPI.send('send-to-clients', {
            target: socketId,
            data: { type: 'full-world-state', ...state }
        });
        console.log(`État complet du monde envoyé à ${socketId}`);
    }

    getCurrentPlayerState(socketId, playerInfo) {
        return {
            socketId: socketId,
            name: playerInfo.name,
            x: playerInfo.x,
            y: playerInfo.y
        };
    }

    getCurrentWorldState() {
        const doorsState = this.doors.children.entries.map(door => ({
            isOpen: door.isOpen
        }))

        const playersState = [{
            socketId: this.mySocketId,
            name: this.playerName,
            x: this.player.x,
            y: this.player.y
        }];

        this.otherPlayers.forEach((player, socketId) => {
            playersState.push({
                socketId: socketId,
                name: player.nameText.text,
                x: player.x,
                y: player.y
            });
        });

        return { doors: doorsState, players: playersState };
    }

    togglePauseMenu(isPaused) {
        this.pauseMenu.setVisible(isPaused)
        this.pauseMenu.setDepth(1000)
    }

    saveCurrentWorldState() {
        if (!this.isHost) {
            console.log("Seul l'hôte peut sauvegarder la partie.")
            return
        }
        this.worldData.players[this.playerName] = { x: this.player.x , y: this.player.y }
        this.otherPlayers.forEach((p, id) => {
            if (p.nameText && p.nameText.text) {
                this.worldData.players[p.nameText.text] = { x: p.x, y: p.y }
            }
        })
        this.worldData.doors = this.doors.children.entries.map(door => ({
            isOpen: door.isOpen
        }))
        window.electronAPI.saveWorldData(this.slotIndex, this.worldData)
        console.log(`Monde ${this.slotIndex} sauvegardé !`)
    }

    leaveWorldAndGoToMenu() {
        // Save quickly if host, then cleanup, then go to menu
        if (this.isHost) this.saveCurrentWorldState();
        this.cleanupResources();
        this.scene.start('MenuScene');
    }

    cleanupResources() {
        // Stop server if host
        if (this.isHost) {
            try { window.electronAPI.stopServer(); } catch {}
        }
        // Network cleanup
        try { NetworkManager.disconnectAll(); } catch {}

        // Remove IPC listeners we registered
        try {
            window.electronAPI.removeAllListeners && window.electronAPI.removeAllListeners('server-event');
            window.electronAPI.removeAllListeners && window.electronAPI.removeAllListeners('check-if-host');
            window.electronAPI.removeAllListeners && window.electronAPI.removeAllListeners('host-quitting');
        } catch {}

        // Keyboard cleanup to avoid stealing Z/Q/S/D/E
        try {
            if (this.keys) {
                Object.values(this.keys).forEach(k => k && k.destroy && k.destroy());
            }
            this.input.keyboard.removeAllListeners();
            if (this.input.keyboard.clearCaptures) this.input.keyboard.clearCaptures();
        } catch {}
    }

    update(time, delta) {
        if ((this.pauseMenu && this.pauseMenu.visible) || !this.player || !this.keys) {
            return
        }
        const speed = 200
        let velocityX = 0
        let velocityY = 0

        if (this.keys.left.isDown) {
            velocityX = -speed
        } else if (this.keys.right.isDown) {
            velocityX = speed
        }

        if (this.keys.up.isDown) {
            velocityY = -speed
        } else if (this.keys.down.isDown) {
            velocityY = speed
        }

        this.player.setVelocityX(velocityX)
        this.player.setVelocityY(velocityY)

        this.player.body.velocity.normalize().scale(speed)

        this.handleInteraction()

        this.player.nameText.setPosition(this.player.x, this.player.y - 25)
        this.otherPlayers.forEach(p => {
            p.x = Phaser.Math.Linear(p.x, p.targetX, 0.2)
            p.y = Phaser.Math.Linear(p.y, p.targetY, 0.2)
            p.nameText.setPosition(p.x, p.y - 20)
        })

        // --- Envoi des mises à jour réseau ---
        this.lastUpdateTime = this.lastUpdateTime || 0
        if (time > this.lastUpdateTime + 100) {
            if (this.runMode === 'client') {
                if (!this.mySocketId) return
                NetworkManager.send({
                    type: 'player-update',
                    name: this.playerName,
                    x: this.player.x,
                    y: this.player.y
                })
            } else if (this.runMode === 'host') {
                if (!this.mySocketId) return
                this.broadcastFullState()
            }
            // solo -> rien à envoyer
            this.lastUpdateTime = time
        }
    }
}