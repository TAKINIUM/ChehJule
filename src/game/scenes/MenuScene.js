export class MenuScene extends Phaser.Scene {
    
    constructor() {
        super("MenuScene")
    }

    create() {
        this.titleText = this.add.text(0 , 0 , "CHEHJULE" , {
            font: "64px Arial" ,
            fill: "#ffffff"
        }).setOrigin(0.5)

        this.playButton = this.add.text(0 , 0 , "Jouer" , {
            font: "32px Arial",
            fill: "#ffffff"
        }).setOrigin(0.5).setInteractive()

        this.optionsButton = this.add.text(0 , 0 , "Options" , {
            font: "32px Arial",
            fill: "#ffffff"
        }).setOrigin(0.5).setInteractive()

        this.quitButton = this.add.text(0 , 0 , "Quitter" , {
            font: "32px Arial",
            fill: "#ffffff"
        }).setOrigin(0.5).setInteractive()

        this.playButton.on("pointerdown" , () => {
            this.scene.start("SelectWorldScene")
        })

        this.optionsButton.on("pointerdown" , () => {
            console.log("ouvertures des options ...")
        })

        this.quitButton.on("pointerdown" , () => {
            window.electronAPI.quitApp()
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

        this.titleText.setPosition(centerX, centerY - 150)
        this.playButton.setPosition(centerX, centerY)
        this.optionsButton.setPosition(centerX, centerY + 70)
        this.quitButton.setPosition(centerX, centerY + 140)
    }
}