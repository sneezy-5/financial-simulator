<script setup>
import { ref, onMounted } from 'vue'

const stats = ref(null)
const loading = ref(true)
const error = ref(null)

const fetchStats = async () => {
    try {
        loading.value = true
        const res = await fetch('/api/stats') // Appel au backend via le proxy
        if (!res.ok) throw new Error('Erreur connexion serveur')
        stats.value = await res.json()
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }
}

const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('fr-FR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    })
}

onMounted(fetchStats)
</script>

<template>
  <div class="admin-container">
    <div class="header">
      <h1>📊 Tableau de Bord Admin</h1>
      <button @click="fetchStats" class="refresh-btn">🔄 Actualiser</button>
    </div>

    <div v-if="loading" class="loading">Chargement des données...</div>
    
    <div v-else-if="error" class="error-msg">
      ⚠️ Impossible de joindre le serveur analytique.<br>
      <small>{{ error }}</small>
    </div>

    <div v-else class="content">
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">{{ stats.totalVisits }}</div>
          <div class="kpi-label">Visiteurs Uniques</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ stats.totalHits }}</div>
          <div class="kpi-label">Vues Totales</div>
        </div>
      </div>

      <!-- Tableau des visites récentes -->
      <div class="table-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">Activités Récentes</h3>
          <span style="font-size: 0.8rem; color: #64748b;">Dernières 50 actions</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur (ID)</th>
              <th>IP</th>
              <th>Page</th>
              <th>Appareil / Navigateur</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="visit in stats.recentVisits" :key="visit.id">
              <td style="white-space: nowrap;">{{ formatDate(visit.timestamp || visit.createdAt) }}</td>
              <td>
                <code style="font-size: 0.7rem; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; color: #475569;">
                  {{ visit.clientId ? visit.clientId.substring(0, 8) + '...' : 'Inconnu' }}
                </code>
              </td>
              <td style="font-family: monospace; font-size: 0.8rem;">{{ visit.ip }}</td>
              <td>
                <span :class="'badge-' + (visit.page || 'home')" class="page-badge">
                  {{ visit.page || 'home' }}
                </span>
              </td>
              <td class="text-xs" :title="visit.userAgent">{{ visit.userAgent?.substring(0, 40) }}...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-container {
    max-width: 1000px;
    margin: 2rem auto;
    padding: 1rem;
    font-family: 'Inter', sans-serif;
    color: #1e293b;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}

.refresh-btn {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.kpi-card {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    text-align: center;
}

.kpi-value {
    font-size: 2.5rem;
    font-weight: 800;
    color: #2563eb;
}

.kpi-label {
    color: #64748b;
    font-weight: 500;
}

.table-card {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
}

th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
}

th {
    background: #f8fafc;
    font-weight: 600;
    color: #475569;
}

.text-xs { font-size: 0.75rem; color: #64748b; }

.error-msg {
    padding: 2rem;
    background: #fee2e2;
    color: #dc2626;
    border-radius: 8px;
    text-align: center;
}

.page-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
}

.badge-home { background: #e0f2fe; color: #0369a1; }
.badge-tax { background: #fef3c7; color: #92400e; }
.badge-hr { background: #dcfce7; color: #166534; }
.badge-loan { background: #f3e8ff; color: #6b21a8; }
.badge-outils_pro { background: #f1f5f9; color: #475569; }
</style>
