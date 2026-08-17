import { ref } from 'vue';

export const adminUser = ref(null);
export const adminToken = ref(localStorage.getItem('onda_admin_token') || null);

const API_URL = import.meta.env.VITE_API_URL || '/api';

const setAdminAuth = (newToken, adminData) => {
    adminToken.value = newToken;
    adminUser.value = adminData;
    if (newToken) {
        localStorage.setItem('onda_admin_token', newToken);
    } else {
        localStorage.removeItem('onda_admin_token');
    }
};

export const fetchAdminMe = async () => {
    if (!adminToken.value) return;
    try {
        const res = await fetch(`${API_URL}/admin/auth/me`, {
            headers: { 'Authorization': `Bearer ${adminToken.value}` }
        });
        if (res.ok) {
            const data = await res.json();
            adminUser.value = data.admin;
        } else {
            setAdminAuth(null, null);
        }
    } catch (e) {
        console.error("Erreur vérification session admin:", e);
        setAdminAuth(null, null);
    }
};

export const adminLogin = async (email, password) => {
    const res = await fetch(`${API_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
        setAdminAuth(data.token, data.admin);
        return true;
    }
    throw new Error(data.error || 'Identifiants administrateur incorrects');
};

export const adminLogout = () => {
    setAdminAuth(null, null);
};
