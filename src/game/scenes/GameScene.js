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
        this.load.spritesheet("tiles" , "assets/images/tileset.png" , { frameWidth: 32, frameHeight: 32 })
        this.load.tilemapTiledJSON("map" , "assets/maps/map.json")
        this.load.image("player" , "assets/images/player.png")
        this.load.spritesheet("doors" , "assets/images/Doors.png" , { frameWidth: 32, frameHeight: 32 })
        this.load.spritesheet('trees', 'assets/images/Trees.png', { frameWidth: 64, frameHeight: 64 })
        this.load.spritesheet('plants', 'assets/images/Plants.png', { frameWidth: 32, frameHeight: 32 })
        this.load.spritesheet('beds', 'assets/images/Beds.png', { frameWidth: 64, frameHeight: 64 })
    }

    async create() {

        this.sound.pauseOnBlur = false
        this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB])

        
        // --- Carte ---
        const tsByName = (name) => this.make.tilemap({ key: 'map' }).tilesets.find(t => t.name === name) || (this.scene.map ? this.scene.map.tilesets.find(t => t.name === name) : null)
        const map = this.make.tilemap({ key: 'map' })
        const toCenter = (obj, tw, th) => ({ x: obj.x + tw / 2, y: obj.y - th / 2 })
        const FLIP_H = 0x80000000, FLIP_V = 0x40000000, FLIP_D = 0x20000000
        const frameFromGid = (ts, gid) => ((gid >>> 0) & ~(FLIP_H | FLIP_V | FLIP_D)) - ts.firstgid

        this.beds = this.add.group()
        this.bedColliders = this.physics.add.staticGroup()
        this.caches = this.add.group()

        const tileset = map.addTilesetImage('Tileset', 'tiles')
        map.createLayer("Sol", tileset, 0, 0)
        map.createLayer("Plancher", tileset, 0 , 0)
        map.createLayer("Route" , tileset , 0 , 0)
        const wallsLayer = map.createLayer("Mur", tileset, 0, 0)
        const DecoColLayer = map.createLayer("Deco collision" , tileset , 0 , 0)
        wallsLayer.setCollisionByExclusion([-1])
        DecoColLayer.setCollisionByExclusion([-1])

        // --- Portes ---
        this.doors = this.physics.add.staticGroup()
        const doorLayer = map.getObjectLayer("Porte")
        const doorObjects = doorLayer ? doorLayer.objects : []
        doorObjects.forEach((doorObj , index) => {

            const px = doorObj.x + (doorObj.width || 32) / 2
            const py = doorObj.y + (doorObj.height || 32) / 2 - 32

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

         // Création du joueur local
        const savedPlayerPos = this.worldData.players[this.playerName]
        const spawnLayer = map.getObjectLayer('PlayerSpawn');
        const spawnPointObj = spawnLayer ? spawnLayer.objects[0] : null;
        let spawnPoint = savedPlayerPos || spawnPointObj || { x: 100, y: 100 }
        this.player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, 'player')
        this.player.body.setSize(24, 24)
        this.physics.add.collider(this.player , wallsLayer)
        this.physics.add.collider(this.player , DecoColLayer)
        this.physics.add.collider(this.player , this.doors)
        this.player.nameText = this.add.text(0, 0, this.playerName, { font: '14px Arial', fill: '#ffffff' }).setOrigin(0.5)

        this.borderWalls = this.physics.add.staticGroup()
        this.trees = this.physics.add.staticGroup()
        this.pots = this.physics.add.staticGroup()
        this.caches = this.add.group()

        const addStaticFromTileObj = (layerName, tilesetName, textureKey) => {
            const ts = tsByName(tilesetName)
            if (!ts) return []
            const tw = ts.tileWidth, th = ts.tileHeight
            const objs = (map.getObjectLayer(layerName)?.objects) || []
            const out = []
            for (const obj of objs) {
                if (typeof obj.gid !== 'number') continue
                const frame = obj.gid - ts.firstgid
                const { x, y } = toCenter(obj, tw, th)
                const s = this.add.sprite(x, y, textureKey, frame).setOrigin(0.5)
                this.physics.add.existing(s, true)
                s.body.setSize(tw, th)
                s.body.updateFromGameObject()
                out.push(s)
            }
            return out
        }

        {
            const layer = map.getObjectLayer('Bordure')
            if (layer?.objects?.length) {
                for (const o of layer.objects) {
                    const rx = o.x + o.width / 2
                    const ry = o.y + o.height / 2
                    const rect = this.add.rectangle(rx, ry, o.width, o.height, 0x00ff00, 0) // invisible
                    this.physics.add.existing(rect, true)
                    rect.body.setSize(o.width, o.height)
                    rect.body.updateFromGameObject()
                    this.borderWalls.add(rect)
                }
            }
            this.physics.add.collider(this.player, this.borderWalls)
        }
        {
            const sprites = addStaticFromTileObj('Arbre', 'Trees', 'trees')
            sprites.forEach(s => this.trees.add(s))
            this.physics.add.collider(this.player, this.trees)
        }
        {
            const sprites = addStaticFromTileObj('Pots', 'Plants', 'plants')
            sprites.forEach(s => this.pots.add(s))
            this.physics.add.collider(this.player, this.pots)
        }
        {
            const ts = map.tilesets.find(t => t.name === 'Beds')
            const layer = map.getObjectLayer('Lit')
            if (ts && layer?.objects?.length) {
                const tw = ts.tileWidth, th = ts.tileHeight // 64x64
                for (const obj of layer.objects) {
                    if (typeof obj.gid !== 'number') continue
                    const frame = frameFromGid(ts, obj.gid) // 0..3 sur l’image 128x128 (2x2)
                    const { x, y } = toCenter(obj, tw, th)

                    // Sprite visuel
                    const bedSprite = this.add.sprite(x, y, 'beds', frame).setOrigin(0.5)
                    this.beds.add(bedSprite)

                    // Hitbox dans la tuile 64x64
                    const hb = {
                        0: { w: 32, h: 64, ox: 0,  oy: 0  }, // vertical gauche (TL)
                        1: { w: 64, h: 32, ox: 0,  oy: 0  }, // horizontal haut (TR)
                        2: { w: 64, h: 32, ox: 0,  oy: 32 }, // horizontal bas (BL)
                        3: { w: 32, h: 64, ox: 32, oy: 0  }  // vertical droite (BR)
                    }[frame] || { w: 32, h: 64, ox: 0, oy: 0 }

                    // Position monde du collider (rectangle statique invisible)
                    const left = x - tw / 2
                    const top  = y - th / 2
                    const cx = left + hb.ox + hb.w / 2
                    const cy = top  + hb.oy + hb.h / 2

                    const col = this.add.rectangle(cx, cy, hb.w, hb.h, 0x00ff00, 0)
                    this.physics.add.existing(col, true)
                    this.bedColliders.add(col)
                }
            }
        }

        this.physics.add.collider(this.player, this.bedColliders)
        this.setupCollisionDebug({ wallsLayer, DecoColLayer })

        {
            const ts = map.tilesets.find(t => t.name === 'Tileset')
            const layer = map.getObjectLayer('Cachette')
            if (ts && layer?.objects?.length) {
                const tw = ts.tileWidth, th = ts.tileHeight // 32x32
                for (const obj of layer.objects) {
                    if (typeof obj.gid !== 'number') continue
                    const frame = frameFromGid(ts, obj.gid)
                    const { x, y } = toCenter(obj, tw, th)
                    const s = this.add.sprite(x, y, 'tiles', frame).setOrigin(0.5)
                    s.setDepth(10)
                    this.caches.add(s)
                }
            }
        }


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

    setupCollisionDebug({ wallsLayer, DecoColLayer }) {
        // Graphics pour dessiner les tiles en collision
        this._debug = { enabled: false }
        this._debugGfx = this.add.graphics().setScrollFactor(1).setDepth(9999).setAlpha(0.65)

        // Toggle F1
        this.input.keyboard.on('keydown-F1', () => {
            this._debug.enabled = !this._debug.enabled
            this._debugGfx.clear()
            if (this._debug.enabled) {
                this.drawCollisionTiles(wallsLayer, DecoColLayer)
                this.installCollisionLogging(wallsLayer, DecoColLayer)
                console.log('[debug] collisions ON')
            } else {
                this.uninstallCollisionLogging()
                console.log('[debug] collisions OFF')
            }
        })

        // Noms lisibles pour les objets
        const tag = (go, name) => go?.setData && go.setData('debugName', name)
        tag(this.player, 'player')
        tag(this.borderWalls, 'Bordure')
        tag(this.trees, 'Arbre')
        tag(this.pots, 'Pots')
        tag(this.bedColliders, 'LitCollider')
        tag(this.doors, 'Porte')

        // Optionnel: activer d’entrée
        // this.input.keyboard.emit('keydown-F1')
    }

    drawCollisionTiles(wallsLayer, DecoColLayer) {
        this._debugGfx.clear()
        const style = {
            tileColor: null,
            collidingTileColor: new Phaser.Display.Color(255, 128, 0, 140),
            faceColor: new Phaser.Display.Color(0, 255, 255, 80)
        }
        wallsLayer.renderDebug(this._debugGfx, style)
        DecoColLayer.renderDebug(this._debugGfx, style)

        // Dessine aussi nos colliders manuels (bordures / lits) pour bien les voir
        const stroke = (obj, color = 0x00ff00) => {
            if (!obj) return
            const draw = body => this._debugGfx.strokeRect(body.x, body.y, body.width, body.height)
            this._debugGfx.lineStyle(2, color, 1)
            if (obj.getChildren) {
                obj.getChildren().forEach(c => c.body && draw(c.body))
            } else if (obj.body) {
                draw(obj.body)
            }
        }
        stroke(this.borderWalls, 0xff00ff)
        stroke(this.bedColliders, 0x00ffff)
        stroke(this.trees, 0x33ff33)
        stroke(this.pots, 0xffff33)
        stroke(this.doors, 0xff3333)
    }

    installCollisionLogging(wallsLayer, DecoColLayer) {
        // Log global bodies-bodies
        this._onWorldCollide = (obj1, obj2) => {
            const n = go => go?.getData?.('debugName') || go?.name || go?.texture?.key || go?.type || 'obj'
            console.log(`[collide] ${n(obj1)} <-> ${n(obj2)}`)
            this.flashBody(obj1)
            this.flashBody(obj2)
        }
        this.physics.world.on('collide', this._onWorldCollide)

        // Log bodies-tiles pour savoir quelle couche bloque
        this._debugColliders = []
        const markTile = (layerName, player, tile) => {
            // surbrillance rapide du tile touché
            this._debugGfx.lineStyle(3, 0xffffff, 1)
            this._debugGfx.strokeRect(tile.pixelX, tile.pixelY, tile.width, tile.height)
            console.log(`[tile] player <-> ${layerName} @ tileIndex=${tile.index} (x=${tile.x}, y=${tile.y})`)
        }
        this._debugColliders.push(
            this.physics.add.collider(this.player, wallsLayer, (p, t) => markTile('Mur', p, t)),
            this.physics.add.collider(this.player, DecoColLayer, (p, t) => markTile('Deco collision', p, t))
        )

        // Redessiner les tiles en collision à chaque seconde (utile si la caméra bouge)
        this._debugTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => this._debug.enabled && this.drawCollisionTiles(wallsLayer, DecoColLayer)
        })
    }

    uninstallCollisionLogging() {
        if (this._onWorldCollide) {
            this.physics.world.off('collide', this._onWorldCollide)
            this._onWorldCollide = null
        }
        if (this._debugColliders) {
            this._debugColliders.forEach(c => c?.destroy && c.destroy())
            this._debugColliders = null
        }
        this._debugTimer?.remove?.()
        this._debugGfx?.clear?.()
    }

    flashBody(go) {
        const body = go?.body
        if (!body || !this._debugGfx) return
        this._debugGfx.lineStyle(3, 0xff00ff, 1)
        this._debugGfx.strokeRect(body.x, body.y, body.width, body.height)
        this.tweens.add({
            targets: this._debugGfx,
            alpha: 1,
            duration: 80,
            yoyo: true
        })
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

        try { this.uninstallCollisionLogging() } catch {}
        try { this._debugGfx?.destroy?.(); this._debugGfx = null } catch {}
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