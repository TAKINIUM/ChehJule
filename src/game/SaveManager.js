
const Store = require('electron-store')
const store = new Store()

module.exports = {
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
    // Nouvelle fonction pour sauvegarder l'array des slots
    saveWorldSlots: (slots) => {
        store.set('worldSlots', slots);
    },
    saveSaves: (data) => {
        if (data.playerName) {
            store.set('lastPlayerName', data.playerName);
        }
    }
}