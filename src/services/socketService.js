/**
 * socketService.js
 * Service de connexion Socket.IO pour les notifications temps réel.
 * Gère la connexion/déconnexion automatique selon l'état d'authentification.
 */

import { ref } from 'vue';

// État réactif de la connexion
export const socketConnected = ref(false);
export const lastPaymentNotification = ref(null);

let socket = null;

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_SOCKET_URL
  : '/';

/**
 * Connecte le socket avec le token JWT de l'utilisateur.
 * Utilise un import dynamique pour charger socket.io-client à la demande.
 */
export const connectSocket = async (token, onPaymentSuccess) => {
  // Éviter les connexions multiples
  if (socket && socket.connected) {
    console.log('⚡ Socket déjà connecté');
    return;
  }

  try {
    // Import dynamique de socket.io-client
    const { io } = await import('socket.io-client');

    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      socketConnected.value = true;
      console.log('✅ Socket.IO connecté :', socket.id);
    });

    socket.on('disconnect', (reason) => {
      socketConnected.value = false;
      console.log('🔌 Socket.IO déconnecté :', reason);
    });

    socket.on('connect_error', (err) => {
      socketConnected.value = false;
      // Erreur silencieuse – ne pas bloquer l'app si le socket échoue
      console.warn('⚠️ Socket.IO erreur de connexion :', err.message);
    });

    // Écouter les notifications de paiement réussies
    socket.on('payment_success', (data) => {
      console.log('💳 Paiement confirmé via Socket.IO :', data);
      lastPaymentNotification.value = data;
      if (typeof onPaymentSuccess === 'function') {
        onPaymentSuccess(data);
      }
    });

  } catch (e) {
    console.warn('⚠️ socket.io-client non disponible :', e.message);
  }
};

/**
 * Déconnecte le socket proprement (à appeler lors du logout).
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketConnected.value = false;
    lastPaymentNotification.value = null;
    console.log('🔌 Socket.IO déconnecté manuellement');
  }
};

/**
 * Retourne l'instance socket courante (pour usage avancé).
 */
export const getSocket = () => socket;
