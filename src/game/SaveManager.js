
const Store = require('electron-store')
const store = new Store()

module.exports = {
    // Sauvegardes de mondes et pseudo
    getSaves: () => {
        return {
            lastPlayerName: store.get('lastPlayerName', ''),
            worldSlots: store.get('worldSlots', [null, null, null, null, null])
        }
    },
    saveWorldData: (slotIndex, worldData) => {
        if (slotIndex < 0 || slotIndex >= 5) return;
        const slots = store.get('worldSlots', [null, null, null, null, null]);
        slots[slotIndex] = worldData;
        store.set('worldSlots', slots);
    },
    saveWorldSlots: (slots) => {
        store.set('worldSlots', slots);
    },
    saveSaves: (data) => {
        if (data.playerName) {
            store.set('lastPlayerName', data.playerName);
        }
    },

    // Réglages généraux (ex: audio)
    getSettings: () => {
        const defaults = { audio: { bgmVolume: 0.8 } }
        const audio = store.get('audio', defaults.audio)
        return { audio }
    },
    saveSettings: (settings) => {
        if (settings?.audio) {
            const vol = typeof settings.audio.bgmVolume === 'number' ? settings.audio.bgmVolume : undefined
            if (vol !== undefined) {
                store.set('audio', { ...store.get('audio', {}), bgmVolume: Math.max(0, Math.min(1, vol)) })
            }
        }
    }
}