export class MenuScene extends Phaser.Scene {
    
    constructor() {
        super("MenuScene")
    }

    preload() {
        this.load.image("logo" , "assets/ChehJule1.ico")
        this.load.audio('menu_intro', 'assets/audio/Title_intro_Current.wav')
        this.load.audio('menu_loop', 'assets/audio/Title_loop_Current.wav')
    }

    async create() {

        this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB])

        // AutoUpdate

        window.electronAPI?.onUpdateProgress?.((p) => {
            this.progressText?.setText(`MAJ: ${p.percent}%`)
        })

        // Musique

        this.sound.pauseOnBlur = false
        const settings = await window.electronAPI?.getSettings?.()
        const vol = settings?.audio?.bgmVolume
        try {
            if (typeof vol === 'number') this.sound.volume = vol
        } catch {}

        const alreadyPlaying = this.sound.get("menu-loop")?.isPlaying || this.sound.get("menu-intro")?.isPlaying

        if (!alreadyPlaying && !this.registry.get('bgmStarted')) {
            const intro = this.sound.add('menu_intro', { volume: vol || 1 })
            const loop  = this.sound.add('menu_loop', { loop: true, volume: vol || 1 })
            intro.once('complete', () => {
                this._resumeAudioNow()
                if (!loop.isPlaying) loop.play()
            })
            intro.play()
            this.registry.set('bgmStarted', true)

            this._keepAliveEvent?.remove?.()
            this._keepAliveEvent = this.time.addEvent({
                delay: 3000,
                loop: true,
                callback: this._resumeAudioNow,
                callbackScope: this
            })
        }

        // Menu

        this.createBackground()

        this.logo = this.add.image(0 , 140 , "logo").setOrigin(0.5).setScale(0.9)
        this.tweens.add({ targets: this.logo, y: '+=20', duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

        this.titleText = this.add.text(0 , 0 , "CHEHJULE" , { font: "64px Arial" , fill: "#ffffff" }).setOrigin(0.5)
        this.tweens.add({ targets: this.titleText, scale: { from: 1.0, to: 1.12 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

        this.playButton    = this.createButton(0, 0, 'Jouer',   () => { this.transitionTo('SelectWorldScene') })
        this.optionsButton = this.createButton(0, 0, 'Options', () => { this.toggleOptions(true) })
        this.quitButton    = this.createButton(0, 0, 'Quitter', () => { window.electronAPI.quitApp() })

        const fallbackVersion = "0.0.0"
        let appVersion = fallbackVersion
        try {
            if (window.electronAPI?.getAppVersion) appVersion = await window.electronAPI.getAppVersion()
        } catch {}
        this.versionText = this.add.text(0, 0, `v${appVersion}`, { font: "14px Arial", fill: "#cccccc" }).setOrigin(0, 1)

        const repoUrl = "https:\/\/github.com\/TAKINIUM\/Chehjule"
        this.githubText = this.add.text(0, 0, "GitHub: TAKINIUM\/Chehjule", { font: "14px Arial", fill: "#66aaff" }).setOrigin(1, 1).setInteractive({ useHandCursor: true })
        this.githubText.on('pointerover', () => this.githubText.setStyle({ fill: '#aaddff' }))
        this.githubText.on('pointerout',  () => this.githubText.setStyle({ fill: '#66aaff' }))
        this.githubText.on('pointerdown', () => window.electronAPI?.openExternal ? window.electronAPI.openExternal(repoUrl) : window.open(repoUrl, "_blank"))
        
        this.scale.on("resize" , this.updateLayout , this)
        this.updateLayout()

        window.electronAPI.on('check-if-host', () => { window.electronAPI.send('is-host-response', false) })
    }

    _resumeAudioNow() {
        const ctx = this.sound.context
        if (ctx && ctx.state !== 'running') {
            try { ctx.resume() } catch {}
        }
        const loop = this.sound.get('menu_loop')
        const intro = this.sound.get('menu_intro')
        // Si ni l'intro ni le loop ne jouent, on relance la boucle
        if (loop && !loop.isPlaying && !intro?.isPlaying) {
            try { loop.play({ loop: true, volume: this.sound.volume || 1 }) } catch {}
        }
    }

    updateLayout() {
        if (!this.cameras || !this.cameras.main) return
        const cx = this.cameras.main.width / 2
        const cy = this.cameras.main.height / 2

        // Menu
        this.logo?.setPosition(cx, cy - 260)
        this.titleText?.setPosition(cx, cy - 150)
        this.playButton?.setPosition(cx, cy)
        this.optionsButton?.setPosition(cx, cy + 80)
        this.quitButton?.setPosition(cx, cy + 160)

        // Coin
        this.versionText?.setPosition(10, this.cameras.main.height - 10)
        this.githubText?.setPosition(this.cameras.main.width - 10, this.cameras.main.height - 10)

        // Option

        if (this.optionsPanel) {
            this.optionsPanel.backdrop
                ?.setPosition(cx, cy)
                ?.setSize(this.cameras.main.width, this.cameras.main.height)
            this.optionsPanel.container?.setPosition(cx, cy)
            this.optionsPanel.sliderDom?.setPosition(cx, cy + 10)
        }
    }

    toggleOptions(show) {
        if (!this.optionsPanel) this.createOptionsPanel()
        this.optionsPanel.backdrop?.setVisible(show)                 // intercepte les clics
        this.optionsPanel.container.setVisible(show)
        this.optionsPanel.sliderDom?.setVisible(show)

        // Désactive/active les boutons quand le panneau est ouvert
        this.setButtonEnabled(this.playButton, !show)
        this.setButtonEnabled(this.quitButton, !show)

        this.updateLayout()
    }

    createOptionsPanel() {

        if (this.optionsPanel) return this.optionsPanel

        const cx = this.cameras.main.width / 2
        const cy = this.cameras.main.height / 2

        // Anti Background Click
        const backdrop = this.add.rectangle(cx, cy, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.25)
            .setScrollFactor(0)
            .setDepth(1999)
            .setInteractive() 
            .setVisible(false)

        const container = this.add.container(cx, cy).setDepth(2000).setVisible(false)

        const bg = this.add.rectangle(0, 0, 520, 220, 0x000000, 0.86)
            .setStrokeStyle(2, 0xffffff)
        const title = this.add.text(0, -90, 'Options', { font: '32px Arial', fill: '#ffffff' }).setOrigin(0.5)
        const volText = this.add.text(0, -40, 'Volume musique', { font: '18px Arial', fill: '#ffffff' }).setOrigin(0.5)
        const closeBtn = this.add.text(0, 70, 'Fermer', {
            font: '20px Arial', fill: '#ffffff', backgroundColor: '#444', padding: { x: 10, y: 6 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        closeBtn.on('pointerup', () => this.toggleOptions(false))

        container.add([bg, title, volText, closeBtn])

        // Slider DOM — abaissé (y + 10)
        const sliderDom = this.add.dom(cx, cy + 10).createFromHTML(
            '<input id="bgmSlider" type="range" min="0" max="100" step="1" style="width:240px">'
        ).setDepth(2001).setVisible(false).setOrigin(0.5)

        const sliderEl = sliderDom.getChildByID('bgmSlider')
        if (sliderEl) sliderEl.value = String(Math.round((this.sound.volume ?? 1) * 100))
        const onInput = async (e) => {
            const v = Number(e.target.value) / 100
            this.sound.volume = Phaser.Math.Clamp(v, 0, 1)
            try { await window.electronAPI?.saveSettings?.({ audio: { bgmVolume: this.sound.volume } }) } catch {}
        }
        sliderEl?.addEventListener('input', onInput)

        // Save / CleanUp
        this.optionsPanel = { backdrop, container, bg, title, volText, closeBtn, sliderDom, sliderEl, onInput }
        this.events.once('shutdown', () => {
            try { this.optionsPanel.sliderEl?.removeEventListener('input', onInput) } catch {}
            try { this.optionsPanel.sliderDom?.destroy() } catch {}
            try { this.optionsPanel.container?.destroy(true) } catch {}
            try { this.optionsPanel.backdrop?.destroy() } catch {}
            this.optionsPanel = null
        })
        return this.optionsPanel
    }

    createBackground() {
        // Paticule
        if (!this.textures.exists('spark')) {
            const g = this.make.graphics({ x: 0, y: 0, add: false })
            g.fillStyle(0xffffff, 1)
            g.fillCircle(10, 10, 10)
            g.generateTexture('spark', 24, 24)
        }
        const w = this.cameras.main.width
        const h = this.cameras.main.height
        this.bgEmitter = this.add.particles(0, h + 50, 'spark', {
            x: { min: 0, max: w },
            lifespan: 12000,
            speedY: { min: -30, max: -130 },
            speedX: { min: -20, max: 20 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 0.5, end: 0 },
            quantity: 4,
            frequency: 120,
            blendMode: 'ADD'
        })
        this.bgEmitter.setDepth(-1)
    }

    createButton(x, y, label, onClick) {
        // Conteneur bouton stylé + effets
        const container = this.add.container(x, y)
        const glow = this.add.rectangle(0, 0, 300, 70, 0x00aaff, 0.15).setOrigin(0.5)
        const bg = this.add.rectangle(0, 0, 280, 56, 0x222733, 1).setOrigin(0.5).setStrokeStyle(2, 0x69c0ff)
        const txt = this.add.text(0, 0, label, { font: '28px Arial', fill: '#ffffff' }).setOrigin(0.5)
        container.add([glow, bg, txt])

        // on garde une référence au hitbox pour enable/disable
        container._hit = bg

        bg.setInteractive({ useHandCursor: true })

        const hoverIn = () => {
            if (!bg.input?.enabled) return
            this.tweens.add({ targets: container, scale: 1.06, duration: 140, ease: 'Sine.easeOut' })
            this.tweens.add({ targets: glow, alpha: 0.35, duration: 140, ease: 'Sine.easeOut' })
        }
        const hoverOut = () => {
            this.tweens.add({ targets: container, scale: 1.0, duration: 140, ease: 'Sine.easeOut' })
            this.tweens.add({ targets: glow, alpha: 0.15, duration: 140, ease: 'Sine.easeOut' })
        }
        const ripple = () => {
            const m = bg.getWorldTransformMatrix()
            const r = this.add.circle(m.tx, m.ty, 10, 0x69c0ff, 0.25).setDepth(5)
            this.tweens.add({ targets: r, radius: 120, alpha: 0, duration: 300, ease: 'Cubic.easeOut', onComplete: () => r.destroy() })
        }
        bg.on('pointerover', hoverIn)
        bg.on('pointerout', hoverOut)
        bg.on('pointerup', () => { ripple(); onClick && onClick() })

        return container
    }

    setButtonEnabled(btnContainer, enabled) {
        if (!btnContainer || !btnContainer._hit) return
        if (enabled) {
            btnContainer._hit.setInteractive({ useHandCursor: true })
            btnContainer.setAlpha(1)
        } else {
            btnContainer._hit.disableInteractive()
            btnContainer.setAlpha(0.6)
        }
    }

    transitionTo(sceneKey) {
        this.cameras.main.fadeOut(200, 0, 0, 0)
        this.time.delayedCall(210, () => this.scene.start(sceneKey))
    }

    shutdown() {
        try { this._keepAliveEvent?.remove?.() } catch {}
        try {
            this.game.events.off(Phaser.Core.Events.HIDDEN, this._onHidden)
            this.game.events.off(Phaser.Core.Events.BLUR,   this._onBlur)
            this.game.events.off(Phaser.Core.Events.VISIBLE, this._onShow)
            this.game.events.off(Phaser.Core.Events.FOCUS,   this._onShow)
        } catch {}
    }
}