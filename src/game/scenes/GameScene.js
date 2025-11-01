import { NetworkManager } from '../network/NetworkManager.js'

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene')
        this.player = null
        this.keys = null
        this.isHost = false
        this.playerName = ''
        this.otherPlayers = new Map()
        this.runMode = 'client'

        this.doors = null
        this.beds = null
        this.bedColliders = null
        this.borderWalls = null
        this.trees = null
        this.pots = null
        this.caches = null

        this.interactHint = null
        this.lastUpdateTime = 0

        // debug
        this._debug = { enabled: false }
        this._debugGfx = null
        this._debugTimer = null
    }

    init(data) {
        this.isHost = !!data.isHost
        this.playerName = data.playerName || ''
        this.serverAddress = data.serverAddress
        this.worldData = data.worldData || { name: 'Nouveau Monde', players: {}, doors: [] }
        this.slotIndex = data.slotIndex
        this.otherPlayers.clear()
        this.runMode = data.runMode || (this.isHost && !this.serverAddress ? 'host' : 'client')
        this.lastUpdateTime = 0
    }

    preload() {
        this.load.spritesheet('tiles',  'assets/images/tileset.png', { frameWidth: 32, frameHeight: 32 })
        this.load.tilemapTiledJSON('map', 'assets/maps/map.json')
        this.load.image('player', 'assets/images/player.png')
        this.load.spritesheet('doors', 'assets/images/Doors.png', { frameWidth: 32, frameHeight: 32 })
        this.load.spritesheet('trees', 'assets/images/Trees.png', { frameWidth: 64, frameHeight: 64 })
        this.load.spritesheet('plants','assets/images/Plants.png',{ frameWidth: 32, frameHeight: 32 })
        this.load.spritesheet('beds',  'assets/images/Beds.png',  { frameWidth: 64, frameHeight: 64 })
    }

    async create() {
        this.sound.pauseOnBlur = false
        this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB])

        // 1) Carte & helpers
        const map = this.make.tilemap({ key: 'map' })
        const tileset = map.addTilesetImage('Tileset', 'tiles')
        const layerSol       = map.createLayer('Sol', tileset, 0, 0)
        const layerPlancher  = map.createLayer('Plancher', tileset, 0, 0)
        const layerRoute     = map.createLayer('Route', tileset, 0, 0)
        const wallsLayer     = map.createLayer('Mur', tileset, 0, 0)
        const decoColLayer   = map.createLayer('Deco collision', tileset, 0, 0)

        wallsLayer?.setCollisionByExclusion([-1])
        decoColLayer?.setCollisionByExclusion([-1])

        const getObjs = (layerName) => {
            const l = map.getObjectLayer(layerName)
            if (!l || l.visible === false) return []
            return (l.objects || []).filter(o => o.visible !== false)
        }
        const tsByName = (name) => map.tilesets.find(t => t.name === name)
        const toCenter = (obj, tw, th) => ({ x: obj.x + tw / 2, y: obj.y - th / 2 })
        const FLIP_H = 0x80000000, FLIP_V = 0x40000000, FLIP_D = 0x20000000
        const frameFromGid = (ts, gid) => ((gid >>> 0) & ~(FLIP_H | FLIP_V | FLIP_D)) - ts.firstgid

        // 2) Groupes statiques
        this.borderWalls = this.physics.add.staticGroup()
        this.trees       = this.physics.add.staticGroup()
        this.pots        = this.physics.add.staticGroup()
        this.bedColliders= this.physics.add.staticGroup()
        this.beds        = this.add.group()
        this.caches      = this.add.group()
        this.doors       = this.physics.add.staticGroup()

        // 3) Portes (depuis calque d’objets "Porte")
        {
            const doorObjs = getObjs('Porte')
            doorObjs.forEach((doorObj, index) => {
                const px = doorObj.x + (doorObj.width || 32) / 2
                const py = doorObj.y + (doorObj.height || 32) / 2 - 32
                const door = this.doors.create(px, py, 'doors').setOrigin(0.5)
                door.doorId = index

                const propIsOpen = (doorObj.properties || []).find(p => p.name === 'isOpen')
                door.isOpen = propIsOpen ? !!propIsOpen.value : false

                let dir = (doorObj.properties || []).find(p => p.name === 'direction')?.value
                if (!dir) {
                    if (doorObj.rotation) {
                        const r = ((doorObj.rotation % 360) + 360) % 360
                        dir = (r === 90) ? 'right' : (r === 180) ? 'down' : (r === 270) ? 'left' : 'up'
                    } else {
                        dir = (doorObj.height > doorObj.width) ? 'up' : 'right'
                    }
                }
                door.direction = String(dir).toLowerCase()

                const saved = this.worldData.doors[index]
                if (saved) door.isOpen = !!saved.isOpen

                this.updateDoorState(door, door.isOpen)
            })
        }

        // 4) Bordures (rectangles invisibles)
        for (const o of getObjs('Bordure')) {
            const rx = o.x + o.width / 2
            const ry = o.y + o.height / 2
            const rect = this.add.rectangle(rx, ry, o.width, o.height, 0x00ff00, 0)
            this.physics.add.existing(rect, true)
            rect.body.setSize(o.width, o.height)
            rect.body.updateFromGameObject()
            this.borderWalls.add(rect)
        }

        // 5) Arbres (Trees) et Pots (Plants)
        const addStaticFromTileObj = (layerName, tilesetName, textureKey) => {
            const ts = tsByName(tilesetName); if (!ts) return []
            const tw = ts.tileWidth, th = ts.tileHeight
            const out = []
            for (const obj of getObjs(layerName)) {
                if (typeof obj.gid !== 'number') continue
                const frame = frameFromGid(ts, obj.gid)
                const { x, y } = toCenter(obj, tw, th)
                const s = this.add.sprite(x, y, textureKey, frame).setOrigin(0.5)
                this.physics.add.existing(s, true)
                s.body.setSize(tw, th)
                s.body.updateFromGameObject()
                out.push(s)
            }
            return out
        }
        addStaticFromTileObj('Arbre', 'Trees',  'trees').forEach(s => this.trees.add(s))
        addStaticFromTileObj('Pots',  'Plants', 'plants').forEach(s => this.pots.add(s))

        // 6) Lits (Beds 64x64) + colliders précis
        {
            const ts = tsByName('Beds')
            if (ts) {
                const tw = ts.tileWidth, th = ts.tileHeight // 64
                for (const obj of getObjs('Lit')) {
                    if (typeof obj.gid !== 'number') continue
                    const frame = frameFromGid(ts, obj.gid)
                    const { x, y } = toCenter(obj, tw, th)

                    const bedSprite = this.add.sprite(x, y, 'beds', frame).setOrigin(0.5)
                    this.beds.add(bedSprite)

                    const hb = {
                        0: { w: 32, h: 64, ox: 0,  oy: 0  }, // TL (vertical gauche)
                        1: { w: 64, h: 32, ox: 0,  oy: 0  }, // TR (horizontal haut)
                        2: { w: 64, h: 32, ox: 0,  oy: 32 }, // BL (horizontal bas)
                        3: { w: 32, h: 64, ox: 32, oy: 0  }  // BR (vertical droite)
                    }[frame] || { w: 32, h: 64, ox: 0, oy: 0 }

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

        // 7) Cachettes (affichage)
        {
            const ts = tsByName('Tileset')
            if (ts) {
                const tw = ts.tileWidth, th = ts.tileHeight
                for (const obj of getObjs('Cachette')) {
                    if (typeof obj.gid !== 'number') continue
                    const frame = frameFromGid(ts, obj.gid)
                    const { x, y } = toCenter(obj, tw, th)
                    this.caches.add(this.add.sprite(x, y, 'tiles', frame).setOrigin(0.5).setDepth(10))
                }
            }
        }

        // 8) Joueur
        const savedPlayerPos = this.worldData.players[this.playerName]
        const spawnObj = getObjs('PlayerSpawn')[0]
        const spawn = savedPlayerPos || { x: (spawnObj?.x || 100), y: (spawnObj?.y || 100) }
        this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player')
        this.player.body.setSize(24, 24)
        this.player.nameText = this.add.text(0, 0, this.playerName, { font: '14px Arial', fill: '#ffffff' }).setOrigin(0.5)

        // 9) Collisions (après création du joueur)
        if (wallsLayer)   this.physics.add.collider(this.player, wallsLayer)
        if (decoColLayer) this.physics.add.collider(this.player, decoColLayer)
        this.physics.add.collider(this.player, this.borderWalls)
        this.physics.add.collider(this.player, this.trees)
        this.physics.add.collider(this.player, this.pots)
        this.physics.add.collider(this.player, this.bedColliders)
        this.physics.add.collider(this.player, this.doors)

        // 10) UI: hint d’interaction
        this.interactHint = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height - 28,
            '',
            { font: '18px Arial', fill: '#ffffff', backgroundColor: '#000000', padding: { x: 10, y: 6 } }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(1000).setAlpha(0.85).setVisible(false)
        this.scale.on('resize', () => this.interactHint.setPosition(this.cameras.main.width / 2, this.cameras.main.height - 28))

        // 11) Caméra & contrôles
        this.cameras.main.startFollow(this.player, true)
        this.cameras.main.setLerp(0.1, 0.1)
        this.cameras.main.setZoom(2)
        this.keys = this.input.keyboard.addKeys({ up: 'Z', down: 'S', left: 'Q', right: 'D', interact: 'E' })

        // 12) Pause menu (léger)
        this.pauseMenu = this.add.group()
        const rect = this.add.rectangle(this.cameras.main.width / 2, this.cameras.main.height / 2, 300, 200, 0x000000, 0.8).setScrollFactor(0)
        const btn = (y, t, cb) => this.add.text(rect.x, rect.y + y, t, { font: '24px Arial', fill: '#fff' }).setOrigin(0.5).setInteractive().setScrollFactor(0).on('pointerdown', cb)
        this.pauseMenu.addMultiple([rect, btn(-50, 'Continuer', () => this.togglePauseMenu(false)), btn(0, 'Sauvegarder', () => this.saveCurrentWorldState()), btn(50, 'Retour au Menu', () => this.leaveWorldAndGoToMenu())])
        this.pauseMenu.setVisible(false)
        this.input.keyboard.on('keydown-ESC', () => this.togglePauseMenu(!this.pauseMenu.visible))

        // 13) Debug collisions (F1)
        this._debugGfx = this.add.graphics().setDepth(9999).setAlpha(0.65)
        this.input.keyboard.on('keydown-F1', () => {
            this._debug.enabled = !this._debug.enabled
            this._debugGfx.clear()
            if (this._debug.enabled) this.drawCollisionTiles(wallsLayer, decoColLayer)
        })

        // 14) Réseau
        this.events.once('shutdown', () => this.cleanupResources())
        this.events.once('destroy',  () => this.cleanupResources())
        this.setupQuitIpc()
        this.initializeNetwork()
    }

    // ---------- Interaction portes ----------
    getNearestInteractible() {
        if (!this.doors) return null
        const doors = this.doors.getChildren()
        let best = null, bestD = 9999
        for (const d of doors) {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y)
            if (dist < bestD && dist < 64) { best = d; bestD = dist }
        }
        return best
    }
    getInteractionLabel(target) {
        if (!target) return ''
        const isOpen = !!target.isOpen
        return `E — ${isOpen ? 'Fermer' : 'Ouvrir'} la porte`
    }
    getDoorFrameIndex(door) {
        const mapDir = { up: 0, right: 1, down: 2, left: 3 }
        const base = (mapDir[door.direction] ?? 0)
        return base + (door.isOpen ? 4 : 0)
    }
    updateDoorState(door, isOpen) {
        door.isOpen = !!isOpen
        door.setFrame(this.getDoorFrameIndex(door))
        if (door.body) {
            door.body.enable = !door.isOpen
            if (door.body.checkCollision) door.body.checkCollision.none = door.isOpen
        }
    }
    handleInteraction() {
        if (!Phaser.Input.Keyboard.JustDown(this.keys.interact)) return
        const door = this.getNearestInteractible()
        if (!door) return

        if (this.runMode === 'solo' || (this.isHost && !NetworkManager.socket)) {
            this.updateDoorState(door, !door.isOpen)
            return
        }
        NetworkManager.send({ type: 'door-update', doorId: door.doorId, isOpen: !door.isOpen })
    }

    // ---------- Réseau ----------
    initializeNetwork() {
        const loadingText = (this.runMode === 'solo') ? null :
            this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'Connexion en cours...', { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5).setScrollFactor(0)

        NetworkManager.handleData = (data) => {
            if (!data || !data.type) return
            switch (data.type) {
                case 'host-disconnected':
                    this.leaveWorldAndGoToMenu()
                    break
                case 'full-world-state':
                    data.doors.forEach((st, i) => { const d = this.doors.children.entries[i]; if (d) this.updateDoorState(d, st.isOpen) })
                    data.players.forEach(p => { if (p.socketId !== this.mySocketId) this.addOrUpdateOtherPlayer(p.socketId, p) })
                    break
                case 'state-update':
                    data.players?.forEach(p => { if (p.socketId !== this.mySocketId) this.addOrUpdateOtherPlayer(p.socketId, p) })
                    data.doors?.forEach((st, i) => { const d = this.doors.children.entries[i]; if (d) this.updateDoorState(d, st.isOpen) })
                    break
                case 'player-left':
                    this.removeOtherPlayer(data.socketId)
                    break
                case 'door-update':
                    const d = this.doors.children.entries.find(dd => dd.doorId === data.doorId)
                    if (d) this.updateDoorState(d, data.isOpen)
                    break
            }
        }

        if (this.runMode === 'solo') { this.mySocketId = 'local'; loadingText?.destroy(); return }

        if (this.isHost) {
            this._onServerEvent = ({ from, data }) => {
                if (!data || !data.type) return
                switch (data.type) {
                    case 'player-joined':
                        this.addOrUpdateOtherPlayer(from, data.playerInfo)
                        this.sendFullStateToPlayer(from)
                        window.electronAPI.send('send-to-clients', {
                            target: 'broadcast',
                            data: { exclude: from, payload: { type: 'state-update', players: [this.getCurrentPlayerState(from, data.playerInfo)] } }
                        })
                        break
                    case 'player-left':
                        const p = this.otherPlayers.get(from)
                        if (p) {
                            const name = p.nameText?.text || ('socket-' + from)
                            this.worldData.players[name] = { x: p.x, y: p.y }
                            window.electronAPI.saveWorldData(this.slotIndex, this.worldData)
                        }
                        this.removeOtherPlayer(from)
                        window.electronAPI.send('send-to-clients', { target: 'all', data: { type: 'player-left', socketId: from } })
                        break
                    case 'player-update':
                        this.addOrUpdateOtherPlayer(from, { x: data.x, y: data.y, name: data.name })
                        window.electronAPI.send('send-to-clients', {
                            target: 'broadcast',
                            data: { exclude: from, payload: { type: 'state-update', players: [this.getCurrentPlayerState(from, data)] } }
                        })
                        break
                    case 'door-update':
                        const door = this.doors.children.entries.find(dd => dd.doorId === data.doorId)
                        if (door) {
                            this.updateDoorState(door, data.isOpen)
                            window.electronAPI.send('send-to-clients', { target: 'all', data: { type: 'door-update', doorId: data.doorId, isOpen: data.isOpen } })
                        }
                        break
                }
            }
            window.electronAPI.removeAllListeners?.('server-event')
            window.electronAPI.on('server-event', this._onServerEvent)

            NetworkManager.host(async (ip, port, socketId) => {
                this.mySocketId = socketId
                loadingText?.destroy()
                const y = 16
                this.add.text(16, y, `Local: ${ip}:${port}`, { font: '18px Arial', fill: '#ffffff', backgroundColor: '#000000' }).setScrollFactor(0)
                try {
                    const publicIp = await window.electronAPI.getPublicIp()
                    if (publicIp) this.add.text(16, y + 24, `Public: ${publicIp}:${port}`, { font: '18px Arial', fill: '#ffff99', backgroundColor: '#000000' }).setScrollFactor(0)
                } catch {}
            })
            return
        }

        NetworkManager.join(this.serverAddress, (socketId) => {
            this.mySocketId = socketId
            loadingText?.destroy()
            this.add.text(16, 16, 'Connecté !', { font: '18px Arial', fill: '#00ff00', backgroundColor: '#000000' }).setScrollFactor(0)
            NetworkManager.send({ type: 'player-joined', socketId: this.mySocketId, playerInfo: { name: this.playerName, x: this.player.x, y: this.player.y } })
        })
    }

    // ---------- Players multi ----------
    addOrUpdateOtherPlayer(peerId, playerInfo) {
        if (!this.otherPlayers.has(peerId)) {
            const p = this.add.sprite(playerInfo.x, playerInfo.y, 'player')
            p.nameText = this.add.text(playerInfo.x, playerInfo.y - 20, playerInfo.name || 'Joueur', { font: '14px Arial', fill: '#ffffff' }).setOrigin(0.5)
            p.targetX = playerInfo.x; p.targetY = playerInfo.y
            this.otherPlayers.set(peerId, p)
        } else {
            const p = this.otherPlayers.get(peerId)
            p.targetX = playerInfo.x; p.targetY = playerInfo.y
            if (playerInfo.name) p.nameText.setText(playerInfo.name)
        }
    }
    removeOtherPlayer(peerId) {
        const p = this.otherPlayers.get(peerId)
        if (!p) return
        if (this.isHost) {
            const name = p.nameText?.text || ('socket-' + peerId)
            this.worldData.players[name] = { x: p.x, y: p.y }
            window.electronAPI.saveWorldData(this.slotIndex, this.worldData)
        }
        p.nameText?.destroy(); p.destroy()
        this.otherPlayers.delete(peerId)
    }

    // ---------- Etat monde ----------
    broadcastFullState() {
        if (!this.isHost) return
        const s = this.getCurrentWorldState()
        window.electronAPI.send('send-to-clients', { target: 'broadcast', data: { exclude: this.mySocketId, payload: { type: 'state-update', players: s.players, doors: s.doors } } })
    }
    sendFullStateToPlayer(socketId) {
        if (!this.isHost) return
        window.electronAPI.send('send-to-clients', { target: socketId, data: { type: 'full-world-state', ...this.getCurrentWorldState() } })
    }
    getCurrentPlayerState(socketId, info) {
        return { socketId, name: info.name, x: info.x, y: info.y }
    }
    getCurrentWorldState() {
        const doors = this.doors.children.entries.map(d => ({ isOpen: d.isOpen }))
        const players = [{ socketId: this.mySocketId, name: this.playerName, x: this.player.x, y: this.player.y }]
        this.otherPlayers.forEach((p, id) => players.push({ socketId: id, name: p.nameText.text, x: p.x, y: p.y }))
        return { doors, players }
    }

    // ---------- UI & sauvegarde ----------
    togglePauseMenu(isPaused) { this.pauseMenu.setVisible(isPaused).setDepth(1000) }
    saveCurrentWorldState() {
        if (!this.isHost) return
        this.worldData.players[this.playerName] = { x: this.player.x, y: this.player.y }
        this.otherPlayers.forEach(p => { if (p.nameText?.text) this.worldData.players[p.nameText.text] = { x: p.x, y: p.y } })
        this.worldData.doors = this.doors.children.entries.map(d => ({ isOpen: d.isOpen }))
        window.electronAPI.saveWorldData(this.slotIndex, this.worldData)
    }
    leaveWorldAndGoToMenu() {
        if (this.isHost) this.saveCurrentWorldState()
        this.cleanupResources()
        this.scene.start('MenuScene')
    }

    setupQuitIpc() {
        this._onCheckIfHost = () => { window.electronAPI.send('is-host-response', this.isHost) }
        this._onHostQuitting = () => {
            if (this.isHost) {
                this.saveCurrentWorldState()
                NetworkManager.disconnectAll()
                window.electronAPI.send('host-saved-and-ready-to-quit')
            }
        }
        window.electronAPI.on('check-if-host', this._onCheckIfHost)
        window.electronAPI.on('host-quitting', this._onHostQuitting)
    }

    // ---------- Debug collisions ----------
    drawCollisionTiles(wallsLayer, decoColLayer) {
        if (!this._debug.enabled) return
        this._debugGfx.clear()
        const style = {
            tileColor: null,
            collidingTileColor: new Phaser.Display.Color(255, 128, 0, 140),
            faceColor: new Phaser.Display.Color(0, 255, 255, 80)
        }
        wallsLayer?.renderDebug(this._debugGfx, style)
        decoColLayer?.renderDebug(this._debugGfx, style)

        const strokeBodies = (group, color) => {
            this._debugGfx.lineStyle(2, color, 1)
            group?.getChildren?.().forEach(c => c.body && this._debugGfx.strokeRect(c.body.x, c.body.y, c.body.width, c.body.height))
        }
        strokeBodies(this.borderWalls, 0xff00ff)
        strokeBodies(this.bedColliders, 0x00ffff)
        strokeBodies(this.trees, 0x33ff33)
        strokeBodies(this.pots, 0xffff33)
        strokeBodies(this.doors, 0xff3333)
    }

    // ---------- Cleanup ----------
    cleanupResources() {
        try { if (this.isHost) window.electronAPI.stopServer() } catch {}
        try { NetworkManager.disconnectAll() } catch {}
        try {
            window.electronAPI.removeAllListeners?.('server-event')
            window.electronAPI.removeAllListeners?.('check-if-host')
            window.electronAPI.removeAllListeners?.('host-quitting')
        } catch {}
        try {
            if (this.keys) Object.values(this.keys).forEach(k => k?.destroy?.())
            this.input.keyboard.removeAllListeners()
            this.input.keyboard.clearCaptures?.()
        } catch {}
        try { this._debugGfx?.destroy?.(); this._debugGfx = null } catch {}
    }

    // ---------- Update ----------
    update(time, delta) {
        if (!this.player || !this.keys || (this.pauseMenu?.visible)) return

        const speed = 200
        let vx = 0, vy = 0
        if (this.keys.left.isDown)  vx = -speed
        else if (this.keys.right.isDown) vx = speed
        if (this.keys.up.isDown)    vy = -speed
        else if (this.keys.down.isDown)  vy = speed
        this.player.setVelocity(vx, vy)
        this.player.body.velocity.normalize().scale(speed)

        // Interaction
        const cand = this.getNearestInteractible()
        const label = this.getInteractionLabel(cand)
        this.interactHint.setVisible(!!label).setText(label || '')
        this.handleInteraction()

        // Affichage noms + interp autres joueurs
        this.player.nameText.setPosition(this.player.x, this.player.y - 25)
        this.otherPlayers.forEach(p => {
            p.x = Phaser.Math.Linear(p.x, p.targetX, 0.2)
            p.y = Phaser.Math.Linear(p.y, p.targetY, 0.2)
            p.nameText.setPosition(p.x, p.y - 20)
        })

        // Réseau (throttle 100 ms)
        if (time > this.lastUpdateTime + 100) {
            if (this.runMode === 'client') {
                if (this.mySocketId) NetworkManager.send({ type: 'player-update', name: this.playerName, x: this.player.x, y: this.player.y })
            } else if (this.runMode === 'host') {
                if (this.mySocketId) this.broadcastFullState()
            }
            this.lastUpdateTime = time
        }
    }
}