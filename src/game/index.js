import { MenuScene } from "./scenes/MenuScene.js"
import { SelectWorldScene } from "./scenes/SelectWorldScene.js"
import { GameScene } from "./scenes/GameScene.js"

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    scene: [MenuScene , SelectWorldScene , GameScene],
    parent: "game-container",
    pixelArt: true,
    backgroundColor: "#1a1a1a",
    autoPause: false,
    audio: {pauseOnBlur: false},
    dom: {
        createContainer: true
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
}

const game = new Phaser.Game(config)