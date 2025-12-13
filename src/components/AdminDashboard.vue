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
          <div class="kpi-label">Visites Totales</div>
        </div>
        <!-- On pourra ajouter d'autres KPIs ici (ex: Simulations complétées) -->
      </div>

      <!-- Tableau des visites récentes -->
      <div class="table-card">
        <h3>Dernières Visites</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>IP</th>
              <th>Navigateur / OS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="visit in stats.recentVisits" :key="visit.id">
              <td>{{ formatDate(visit.timestamp || visit.createdAt) }}</td>
              <td>{{ visit.ip }}</td>
              <td class="text-xs">{{ visit.userAgent }}</td>
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
</style>
