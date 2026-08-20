import { ref } from 'vue';
import { connectSocket, disconnectSocket } from './socketService.js';

export const user = ref(null);
export const token = ref(localStorage.getItem('auth_token') || null);

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Callback appelé quand le serveur confirme un paiement via Socket.IO
const onPaymentSuccess = (data) => {
  if (user.value && data.subscriptionTier !== undefined) {
    Object.assign(user.value, {
      subscriptionTier: data.subscriptionTier,
      subscriptionExpiresAt: data.subscriptionExpiresAt,
      subscriptionIsTrial: data.subscriptionIsTrial,
      bulletinsUsed: data.bulletinsUsed
    });
  }
};

const setAuth = (newToken, userData) => {
    token.value = newToken;
    user.value = userData;
    if (newToken) {
        localStorage.setItem('auth_token', newToken);
    } else {
        localStorage.removeItem('auth_token');
    }
};

export const fetchMe = async () => {
    if (!token.value) return;
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token.value}` }
        });
        if (res.ok) {
            const data = await res.json();
            user.value = data.user;
            // Connecter le socket si on a un token valide
            connectSocket(token.value, onPaymentSuccess);
        } else {
            setAuth(null, null);
        }
    } catch (e) {
        console.error(e);
        setAuth(null, null);
    }
};

export const login = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
        setAuth(data.token, data.user);
        // Établir la connexion WebSocket après login réussi
        connectSocket(data.token, onPaymentSuccess);
        return true;
    }
    throw new Error(data.error || 'Erreur de connexion');
};

export const register = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
        setAuth(data.token, data.user);
        return true;
    }
    throw new Error(data.error || 'Erreur d\'inscription');
};

export const logout = () => {
    disconnectSocket();
    setAuth(null, null);
};

export const verifyPaystackPayment = async (reference, planCode) => {
    if (!token.value) throw new Error('Non connecté');
    const res = await fetch(`${API_URL}/billing/verify-paystack`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`
        },
        body: JSON.stringify({ reference, planCode })
    });
    const data = await res.json();
    if (res.ok) {
        if (user.value) {
            Object.assign(user.value, {
                subscriptionTier: data.subscriptionTier,
                subscriptionExpiresAt: data.subscriptionExpiresAt,
                subscriptionIsTrial: data.subscriptionIsTrial,
                bulletinsUsed: data.bulletinsUsed
            });
        }
        return data.message;
    }
    throw new Error(data.error || 'Erreur lors de la vérification du paiement');
};

export const updateProfile = async (profileData) => {
    if (!token.value) throw new Error('Non connecté');
    const res = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`
        },
        body: JSON.stringify(profileData)
    });
    const data = await res.json();
    if (res.ok) {
        user.value = data.user;
        return data.message;
    }
    throw new Error(data.error || 'Erreur lors de la mise à jour du profil');
};
