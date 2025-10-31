export class SelectWorldScene extends Phaser.Scene {

    constructor() {
        super('SelectWorldScene')
        this.worldSlots = [null, null, null, null, null]
        this.lastPlayerName = ''
        this.creatingSlotIndex = -1
    }

    async init() {
        const saves = await window.electronAPI.getSaves()
        this.worldSlots = saves.worldSlots
        this.lastPlayerName = saves.lastPlayerName
    }

    preload() {
        this.load.html('nameform', 'assets/html/nameform.html')
        this.load.html('worldform', 'assets/html/worldform.html')
    }

    create() {
        this.cameras.main.setBackgroundColor('#333333')

        this.uiGroup = this.add.group()
        const centerX = this.cameras.main.width / 2
        const centerY = this.cameras.main.height / 2

        // --- UI Principale ---
        this.mainUI = this.add.group()
        this.mainUI.add(this.add.text(centerX, 80, 'Sélection du Monde', { font: '48px Arial', fill: '#ffffff' }).setOrigin(0.5))
        this.drawWorldSlots(this.mainUI)
        this.mainUI.add(this.add.text(centerX, centerY + 180, 'Pseudo :', { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5))
        this.nameInput = this.add.dom(centerX - 50, centerY + 230).createFromCache('nameform')
        this.mainUI.add(this.nameInput)

        const saveNameButton = this.add.text(centerX + 120, centerY + 230, 'OK', { font: '24px Arial', fill: '#fff', backgroundColor: '#555', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        this.mainUI.add(saveNameButton)

        // New: toggle solo/host
        this.hostOnline = false
        this.modeText = this.add.text(centerX, centerY + 130, 'Mode: Solo (cliquer pour héberger en ligne)', { font: '18px Arial', fill: '#ffffaa' }).setOrigin(0.5).setInteractive()
        this.modeText.on('pointerdown', () => {
            this.hostOnline = !this.hostOnline
            this.modeText.setText(this.hostOnline ? 'Mode: Héberger en ligne' : 'Mode: Solo (cliquer pour héberger en ligne)')
        })
        this.mainUI.add(this.modeText)

        const backButton = this.add.text(100, this.cameras.main.height - 50, 'Retour', { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5).setInteractive()
        backButton.on('pointerdown', () => this.scene.start('MenuScene'))
        this.mainUI.add(backButton)

        this.nameInput.getChildByName("nameField").value = this.lastPlayerName

        window.electronAPI.on('check-if-host', () => {
            window.electronAPI.send('is-host-response', false)
        })

        saveNameButton.on('pointerdown', () => {
            const newName = this.nameInput.getChildByName('nameField').value.trim();
            if (newName) {
                this.lastPlayerName = newName
                this.saveData(newName, this.worldSlots)
            }
        })

        // --- UI de Création de Monde (initialement cachée) ---
        this.creationUI = this.add.group()
        this.creationUI.add(this.add.rectangle(centerX, centerY, 500, 300, 0x222222).setStrokeStyle(2, 0xffffff))
        this.creationUI.add(this.add.text(centerX, centerY - 100, 'Créer un nouveau monde', { font: '32px Arial', fill: '#ffffff' }).setOrigin(0.5))
        this.worldNameInput = this.add.dom(centerX, centerY - 20).createFromCache('worldform')
        this.creationUI.add(this.worldNameInput)
        
        const confirmButton = this.add.text(centerX - 80, centerY + 50, 'Confirmer', { font: '24px Arial', fill: '#00ff00' }).setOrigin(0.5).setInteractive()
        confirmButton.on('pointerdown', () => this.confirmWorldCreation())
        this.creationUI.add(confirmButton)

        const cancelButton = this.add.text(centerX + 80, centerY + 50, 'Annuler', { font: '24px Arial', fill: '#ff0000' }).setOrigin(0.5).setInteractive()
        cancelButton.on('pointerdown', () => this.cancelWorldCreation())
        this.creationUI.add(cancelButton)
        this.creationUI.setVisible(false) // Cacher ce groupe par défaut

        // --- Texte d'erreur ---
        this.errorText = this.add.text(centerX, centerY + 270, '', { font: '16px Arial', fill: '#ff0000' }).setOrigin(0.5)
    }

    drawWorldSlots(uiGroup) {
        const centerX = this.cameras.main.width / 2
        for (let i = 0 ; i < 5 ; i++) {
            const slotY = 180 + (i * 70)
            const slotData = this.worldSlots[i]

            const slotButton = this.add.rectangle(centerX, slotY, 400, 50, 0x555555).setInteractive()
            slotButton.setStrokeStyle(2, 0xffffff)
            uiGroup.add(slotButton)

            if (slotData) {
                // Si le slot est occupé
                const textObject = this.add.text(centerX - 120, slotY, slotData.name, { font: '24px Arial', fill: '#ffffff' }).setOrigin(0, 0.5)
                const deleteBtn = this.add.text(centerX + 100, slotY, 'X', { font: '24px Arial', fill: '#ff6666' }).setOrigin(0.5).setInteractive()
                const exportBtn = this.add.text(centerX + 150, slotY, 'Export', { font: '18px Arial', fill: '#66aaff' }).setOrigin(0.5).setInteractive()
                
                slotButton.on('pointerdown', () => this.handleSlotClick(i))
                deleteBtn.on('pointerdown', () => this.handleDeleteClick(i))
                exportBtn.on('pointerdown', () => this.handleExportClick(i))

                uiGroup.add(textObject)
                uiGroup.add(deleteBtn)
                uiGroup.add(exportBtn)
            } else {
                // Si le slot est vide
                const textObject = this.add.text(centerX, slotY, '[ Emplacement Vide ]', { font: '24px Arial', fill: '#999999' }).setOrigin(0.5)
                slotButton.on('pointerdown', () => this.handleSlotClick(i))
                uiGroup.add(textObject)
            }
        }

        const importButton = this.add.text(centerX, 180 + (5 * 70), 'Importer un monde', { font: '24px Arial', fill: '#66ffaa' }).setOrigin(0.5).setInteractive()
        importButton.on('pointerdown', () => this.handleImportClick())
        uiGroup.add(importButton)

        const joinButton = this.add.text(this.cameras.main.width / 2, 180 + (6 * 70), 'Rejoindre un monde', { font: '24px Arial', fill: '#66aaff' }).setOrigin(0.5).setInteractive()
        joinButton.on('pointerdown', () => this.handleJoinClick())
        uiGroup.add(joinButton)
    }

    handleSlotClick(slotIndex) {
        const world = this.worldSlots[slotIndex];
        const runMode = this.hostOnline ? 'host' : 'solo';
        if (world && world.name) {
            this.scene.start('GameScene', {
                isHost: true,
                runMode,
                playerName: this.lastPlayerName,
                worldData: world,
                slotIndex: slotIndex
            });
        } else {
            this.creatingSlotIndex = slotIndex;
            this.mainUI.setVisible(false);
            this.creationUI.setVisible(true);
        }
    }

    handleJoinClick() {
        const playerName = this.nameInput.getChildByName('nameField').value;
        if (playerName.length < 3 || playerName.length > 24) {
            this.errorText.setText('Le pseudo doit contenir entre 3 et 24 caractères.');
            return;
        }
        this.errorText.setText('');

        // Sauvegarder le pseudo avant de continuer
        this.saveData(playerName, this.worldSlots);
        this.lastPlayerName = playerName;

        // Cacher l'interface principale
        this.mainUI.setVisible(false);
        

        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // Créer un champ de saisie HTML
        const inputElement = this.add.dom(centerX, centerY - 20).createFromHTML(`
            <input type="text" id="server-ip-input" placeholder="Entrez l'IP de l'hôte (ex: 192.168.1.42:3000)" style="width: 320px; padding: 10px; font-size: 16px;">
        `);

        const confirmButton = this.add.text(centerX, centerY + 40, 'Rejoindre', { font: '24px Arial', fill: '#ffffff', backgroundColor: '#00aa00', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        const cancelButton = this.add.text(centerX, centerY + 90, 'Annuler', { font: '20px Arial', fill: '#ffdddd' }).setOrigin(0.5).setInteractive();

        const cleanup = () => {
            inputElement.destroy();
            confirmButton.destroy();
            cancelButton.destroy();
            this.mainUI.setVisible(true);
        };

        confirmButton.on('pointerdown', () => {
            const serverAddress = document.getElementById('server-ip-input').value.trim();
            if (serverAddress) {
                this.scene.start('GameScene', {
                    isHost: false,
                    playerName: this.lastPlayerName,
                    serverAddress: serverAddress // <-- Changement ici
                });
            } else {
                cleanup();
            }
        });

        cancelButton.on('pointerdown', cleanup);
    }

    confirmWorldCreation() {
        const worldName = this.worldNameInput.getChildByName('nameField').value;
        if (worldName) {
            const newWorld = {
                name: worldName,
                players: {},
                doors: []
            };
            this.worldSlots[this.creatingSlotIndex] = newWorld;
            this.saveData(this.lastPlayerName, this.worldSlots);

            this.scene.start('GameScene', {
                isHost: true,
                playerName: this.lastPlayerName,
                worldData: newWorld, // Passe le nouvel objet monde
                slotIndex: this.creatingSlotIndex // Passe l'index
            });
        }
    }

    handleDeleteClick(slotIndex) {
        if (confirm(`Êtes-vous sûr de vouloir supprimer le monde "${this.worldSlots[slotIndex].name}" ? Cette action est irréversible.`)) {
            this.worldSlots[slotIndex] = null
            window.electronAPI.saveWorldSlots(this.worldSlots)
            this.scene.restart()
        }
    }

    async handleExportClick(slotIndex) {
        const worldData = this.worldSlots[slotIndex];
        await window.electronAPI.exportSave(worldData);
    }

    async handleImportClick() {
        const emptySlotIndex = this.worldSlots.findIndex(slot => slot === null);
        if (emptySlotIndex === -1) {
            alert("Aucun emplacement de sauvegarde n'est libre pour importer un monde.");
            return;
        }

        const result = await window.electronAPI.importSave();
        if (result.success) {
            this.worldSlots[emptySlotIndex] = result.data;
            this.saveData(this.lastPlayerName, this.worldSlots);
            this.scene.restart();
        }
    }

    saveData(playerName, worldSlots) {
        window.electronAPI.saveSaves({ playerName: playerName });
        window.electronAPI.saveWorldSlots(worldSlots);
    }

    cancelWorldCreation() {
        this.creationUI.setVisible(false)
        this.mainUI.setVisible(true)
    }
}