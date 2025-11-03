export const ITEMS = {
    money: {
        id: 'money',
        name: 'Argent',
        icon: 'money',
        stack: 9999999
    }
}

export function loadItemAssets(scene) {
    scene.load.image('money', 'assets/images/Money.png')
}