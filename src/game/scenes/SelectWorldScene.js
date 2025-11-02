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

        this.load.audio('menu_intro', 'assets/audio/Title_intro_Current.wav')
        this.load.audio('menu_loop', 'assets/audio/Title_loop_Current.wav')
    }

    async create() {

        this.sound.pauseOnBlur = false
        this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB])

        const pubIp = await window.electronAPI.getPublicIp()
        this.add.text(10, 10, `Public: ${pubIp || 'indispo'}:3000`, { font: '14px Arial', fill: '#ccc' })

        this.cameras.main.setBackgroundColor('#333333')

        this.uiGroup = this.add.group()
        const centerX = this.cameras.main.width / 2
        const centerY = this.cameras.main.height / 2

        // --- UI Principale ---
        this.mainUI = this.add.group()
        this.titleText = this.add.text(centerX, 80, 'Sélection du Monde', { font: '48px Arial', fill: '#ffffff' }).setOrigin(0.5)
        this.mainUI.add(this.titleText)
        this.slotCards = []
        this.drawWorldSlots(this.mainUI)
        this.playerLabel = this.add.text(centerX, centerY + 180, 'Pseudo :', { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5)
        this.mainUI.add(this.playerLabel)
        this.nameInput = this.add.dom(centerX - 50, centerY + 230).createFromCache('nameform')
        this.mainUI.add(this.nameInput)

        this.saveNameButton = this.add.text(centerX + 120, centerY + 230, 'OK', { font: '24px Arial', fill: '#fff', backgroundColor: '#555', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        this.mainUI.add(this.saveNameButton)

        // New: toggle solo/host
        this.hostOnline = false
        this.modeText = this.add.text(centerX, centerY + 130, 'Mode: Solo', { font: '18px Arial', fill: '#ffffaa' }).setOrigin(0.5).setInteractive()
        this.modeText.on('pointerdown', () => {
            this.hostOnline = !this.hostOnline
            this.modeText.setText(this.hostOnline ? 'Mode: Héberger en ligne' : 'Mode: Solo')
        })
        this.mainUI.add(this.modeText)

        this.backButton = this.add.text(100, this.cameras.main.height - 50, 'Retour', { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5).setInteractive()
        this.backButton.on('pointerdown', () => {
            this.scene.start('MenuScene')
        })
        this.mainUI.add(this.backButton)

        this.nameInput.getChildByName("nameField").value = this.lastPlayerName

        window.electronAPI.on('check-if-host', () => {
            window.electronAPI.send('is-host-response', false)
        })

        this.saveNameButton.on('pointerdown', () => {
            const newName = this.nameInput.getChildByName('nameField').value.trim();
            if (newName) {
                this.lastPlayerName = newName
                this.saveData(newName, this.worldSlots)
            }
        })

        // --- UI de Création de Monde (initialement cachée) ---
    this.creationUI = this.add.group()
    this.createRect = this.add.rectangle(centerX, centerY, 500, 300, 0x222222).setStrokeStyle(2, 0xffffff)
    this.creationTitle = this.add.text(centerX, centerY - 100, 'Créer un nouveau monde', { font: '32px Arial', fill: '#ffffff' }).setOrigin(0.5)
    this.worldNameInput = this.add.dom(centerX, centerY - 20).createFromCache('worldform')
    this.creationUI.addMultiple([this.createRect, this.creationTitle, this.worldNameInput])
        
    const confirmButton = this.add.text(centerX - 80, centerY + 50, 'Confirmer', { font: '24px Arial', fill: '#00ff00' }).setOrigin(0.5).setInteractive()
        confirmButton.on('pointerdown', () => this.confirmWorldCreation())
        this.creationUI.add(confirmButton)

    const cancelButton = this.add.text(centerX + 80, centerY + 50, 'Annuler', { font: '24px Arial', fill: '#ff0000' }).setOrigin(0.5).setInteractive()
        cancelButton.on('pointerdown', () => this.cancelWorldCreation())
        this.creationUI.add(cancelButton)
        this.creationUI.setVisible(false) // Cacher ce groupe par défaut

        // --- Texte d'erreur ---
        this.errorText = this.add.text(centerX, centerY + 270, '', { font: '16px Arial', fill: '#ff0000' }).setOrigin(0.5)

        // Recalculer la mise en page sur resize
        this.scale.on('resize', this.updateLayout, this)
        this.updateLayout()
    }

    drawWorldSlots(uiGroup) {
        const centerX = this.cameras.main.width / 2
        const baseY = 160
        const cardW = Phaser.Math.Clamp(Math.floor(this.cameras.main.width * 0.6), 420, 700)
        const cardH = 64

        // Nettoyer anciennes cartes si redraw
        if (this.slotCards?.length) {
            this.slotCards.forEach(c => c.shadow?.destroy?.())
            this.slotCards.forEach(c => c.card?.destroy?.())
            this.slotCards.forEach(c => c.label?.destroy?.())
            this.slotCards.forEach(c => c.deleteBtn?.destroy?.())
            this.slotCards.forEach(c => c.exportBtn?.destroy?.())
            this.slotCards.length = 0
        }

        for (let i = 0; i < 5; i++) {
            const y = baseY + i * (cardH + 12)
            const slotData = this.worldSlots[i]

            const shadow = this.add.rectangle(centerX + 6, y + 6, cardW, cardH, 0x000000, 0.4).setScrollFactor(0)
            const card = this.add.rectangle(centerX, y, cardW, cardH, slotData ? 0x2a2a2a : 0x202020)
                .setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff)

            const label = this.add.text(centerX - cardW / 2 + 18, y, slotData ? slotData.name : '[ Emplacement Vide ]', {
                font: '22px Arial', fill: slotData ? '#ffffff' : '#999999'
            }).setOrigin(0, 0.5)

            let deleteBtn = null, exportBtn = null
            if (slotData) {
                deleteBtn = this.add.text(centerX + cardW / 2 - 100, y, 'Suppr', { font: '18px Arial', fill: '#ff6666' })
                    .setOrigin(0.5).setInteractive({ useHandCursor: true })
                exportBtn = this.add.text(centerX + cardW / 2 - 40, y, 'Export', { font: '18px Arial', fill: '#66aaff' })
                    .setOrigin(0.5).setInteractive({ useHandCursor: true })
                deleteBtn.on('pointerup', () => this.handleDeleteClick(i))
                exportBtn.on('pointerup', () => this.handleExportClick(i))
            }

            card.on('pointerover', () => {
                this.tweens.add({ targets: [card, label], duration: 120, scaleX: 1.02, scaleY: 1.06, ease: 'Sine.easeOut' })
                card.setFillStyle(0x333333)
            })
            card.on('pointerout', () => {
                this.tweens.add({ targets: [card, label], duration: 120, scaleX: 1, scaleY: 1, ease: 'Sine.easeOut' })
                card.setFillStyle(slotData ? 0x2a2a2a : 0x202020)
            })
            card.on('pointerup', () => this.handleSlotClick(i))

            uiGroup.addMultiple([shadow, card, label])
            if (deleteBtn) uiGroup.add(deleteBtn)
            if (exportBtn) uiGroup.add(exportBtn)

            this.slotCards.push({ shadow, card, label, deleteBtn, exportBtn, index: i, yBase: y, cardW, cardH })
        }

        // Boutons secondaires
        this.importButton?.destroy?.()
        this.joinButton?.destroy?.()

        this.importButton = this.add.text(this.cameras.main.width - 20, this.cameras.main.height - 20,
            'Importer un monde', { font: '24px Arial', fill: '#66ffaa' })
            .setOrigin(1, 1).setInteractive({ useHandCursor: true })
        this.importButton.on('pointerup', () => this.handleImportClick())
        uiGroup.add(this.importButton)

        const listBottom = baseY + (5 - 1) * (cardH + 12) + cardH / 2
        this.joinButton = this.add.text(centerX, listBottom + 30, 'Rejoindre un monde', {
            font: '24px Arial', fill: '#66aaff'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        this.joinButton.on('pointerup', () => this.handleJoinClick())
        uiGroup.add(this.joinButton)
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
                    serverAddress: serverAddress
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

    updateLayout() {
        if (!this.cameras || !this.cameras.main) return
        const cam = this.cameras.main
        const cx = cam.width / 2

        // Titre
        this.titleText?.setPosition(cx, 40)

        const cardH = 64
        const baseY = 160
        const gap = 12

        this.slotCards?.forEach((c, i) => {
            const y = baseY + i * (cardH + gap)
            const w = Phaser.Math.Clamp(Math.floor(cam.width * 0.6), 420, 700)
            c.shadow?.setPosition(cx + 6, y + 6).setSize?.(w, cardH)
            c.card?.setPosition(cx, y).setSize?.(w, cardH)
            c.label?.setPosition(cx - w / 2 + 18, y)
            c.deleteBtn?.setPosition(cx + w / 2 - 100, y)
            c.exportBtn?.setPosition(cx + w / 2 - 40, y)
        })

        const listBottom = baseY + (5 - 1) * (cardH + gap) + cardH / 2

        this.modeText?.setPosition(cx, listBottom + 30)
        this.joinButton?.setPosition(cx, listBottom + 60)
        this.playerLabel?.setPosition(cx, listBottom + 100)
        this.nameInput?.setPosition(cx - 50, listBottom + 140)
        this.saveNameButton?.setPosition(cx + 120, listBottom + 140)
        this.errorText?.setPosition(cx, listBottom + 180)

        // Boutons de coin toujours visibles
        this.backButton?.setOrigin(0, 1).setPosition(20, cam.height - 20)
        this.importButton?.setOrigin(1, 1).setPosition(cam.width - 20, cam.height - 20)
    }
}