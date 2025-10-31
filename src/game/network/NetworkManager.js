// Fichier entièrement réécrit pour Socket.IO

// Cette bibliothèque est chargée via le <script> dans index.html
// Nous n'avons pas besoin de l'importer ici, `io` sera une variable globale.

export const NetworkManager = {
    socket: null,
    handleData: null, // Le callback de GameScene

    // Pour l'hôte : demande au processus principal de démarrer le serveur
    host: function(onReady) {
        if (window.electronAPI.removeAllListeners) {
            window.electronAPI.removeAllListeners('server-started');
        }
        window.electronAPI.send('start-server');
        window.electronAPI.on('server-started', ({ ip, port }) => {
            this.join(`${ip}:${port}`, (socketId) => {
                onReady && onReady(ip, port, socketId);
            });
        });
    },

    // Pour le client : se connecte à l'adresse du serveur de l'hôte
    join: function(serverAddress, onReady) {
        this.disconnectAll();
        if (!serverAddress.startsWith('http')) serverAddress = `http://${serverAddress}`;
        this.socket = io(serverAddress)

        this.socket.on('connect', () => {
            console.log(`Connecté au serveur ! Mon ID de socket est ${this.socket.id}`);
            onReady && onReady(this.socket.id);
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('Déconnecté du serveur:', reason);
            this.handleData && this.handleData({ type: 'host-disconnected' });
        });

        this.socket.on('game-update', (data) => {
            this.handleData && this.handleData(data)
        });

        this.socket.on('connect_error', (err) => {
            console.error("Erreur de connexion Socket.IO:", err.message);
        });
    },

    // Envoie un événement au serveur
    send: function(data) {
        if (this.socket) this.socket.emit('game-event', data)
    },

    // La diffusion est maintenant gérée côté serveur, cette fonction n'est plus nécessaire
    // broadcast: function() {},

    disconnectAll: function() {
        if (this.socket) {
            this.socket.removeAllListeners()
            this.socket.disconnect()
            this.socket = null
        }
    }
}