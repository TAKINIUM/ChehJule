export class MenuScene extends Phaser.Scene {
    
    constructor() {
        super("MenuScene")
    }

    preload() {
        this.load.image("logo" , "assets/ChehJule1.ico")
    }

    async create() {

        window.electronAPI?.onUpdateProgress?.((p) => {
            this.progressText?.setText(`MAJ: ${p.percent}%`)
        })

        this.logo = this.add.image(0 , 140 , "logo").setOrigin(0.5).setScale(0.8)
        this.tweens.add({
            targets: this.logo,
            y: '+=20',
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        })

        this.titleText = this.add.text(0 , 0 , "CHEHJULE" , {
            font: "64px Arial" ,
            fill: "#ffffff"
        }).setOrigin(0.5)

        this.tweens.add({
            targets: this.titleText,
            scale: { from: 1.0, to: 1.1 },
            duration: 2500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        })

        this.playButton = this.add.text(0 , 0 , "Jouer" , {
            font: "32px Arial",
            fill: "#ffffff"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })

        this.optionsButton = this.add.text(0 , 0 , "Options" , {
            font: "32px Arial",
            fill: "#ffffff"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })

        this.quitButton = this.add.text(0 , 0 , "Quitter" , {
            font: "32px Arial",
            fill: "#ffffff"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })

        const addHover = (btn) => {
            btn.on('pointerover', () => {
                this.tweens.add({ targets: btn, scale: 1.12, duration: 120, ease: 'Sine.easeOut' })
                btn.setStyle({ fill: '#ffff99' })
            })
            btn.on('pointerout', () => {
                this.tweens.add({ targets: btn, scale: 1, duration: 120, ease: 'Sine.easeOut' })
                btn.setStyle({ fill: '#ffffff' })
            })
        }
        addHover(this.playButton)
        addHover(this.optionsButton)
        addHover(this.quitButton)

        this.playButton.on("pointerdown" , () => {
            this.scene.start("SelectWorldScene")
        })

        this.optionsButton.on("pointerdown" , () => {
            console.log("ouvertures des options ...")
        })

        this.quitButton.on("pointerdown" , () => {
            window.electronAPI.quitApp()
        })

        const fallbackVersion = "0.0.1"
        let appVersion = fallbackVersion
        try {
            if (window.electronAPI?.getAppVersion) {
                appVersion = await window.electronAPI.getAppVersion()
            }
        } catch {}
        this.versionText = this.add.text(0, 0, `v${appVersion}`, {
            font: "14px Arial",
            fill: "#cccccc"
        }).setOrigin(0, 1)

        const repoUrl = "https://github.com/TAKINIUM/Chehjule"
        this.githubText = this.add.text(0, 0, "GitHub: TAKINIUM/Chehjule", {
            font: "14px Arial",
            fill: "#66aaff"
        }).setOrigin(1, 1).setInteractive({ useHandCursor: true })

        this.githubText.on('pointerover', () => this.githubText.setStyle({ fill: '#aaddff' }))
        this.githubText.on('pointerout',  () => this.githubText.setStyle({ fill: '#66aaff' }))
        this.githubText.on('pointerdown', () => {
            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(repoUrl)
            } else {
                window.open(repoUrl, "_blank")
            }
        })

        this.scale.on("resize" , this.updateLayout , this)
        this.updateLayout()

        window.electronAPI.on('check-if-host', () => {
            window.electronAPI.send('is-host-response', false)
        })
    }

    updateLayout() {
        if (!this.cameras || !this.cameras.main) {
            return
        }
        const centerX = this.cameras.main.width / 2
        const centerY = this.cameras.main.height / 2

        if (this.logo) this.logo.setPosition(centerX, centerY - 260)
        this.titleText.setPosition(centerX, centerY - 150)
        this.playButton.setPosition(centerX, centerY)
        this.optionsButton.setPosition(centerX, centerY + 70)
        this.quitButton.setPosition(centerX, centerY + 140)

        this.versionText.setPosition(10, this.cameras.main.height - 10)
        this.githubText.setPosition(this.cameras.main.width - 10, this.cameras.main.height - 10)
    }
}