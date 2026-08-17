// ══════════════════════════════════════════════════════════════════════════
// SERVICE BASE DE DONNÉES LOCALE (IndexedDB / Offline-First) - ONDA RH
// Permet à chaque client d'avoir sa propre BD locale sécurisée et confidentielle
// ══════════════════════════════════════════════════════════════════════════

const DB_NAME = 'OndaRhClientDb';
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Table des Employés du client
      if (!db.objectStoreNames.contains('employees')) {
        const empStore = db.createObjectStore('employees', { keyPath: 'id', autoIncrement: true });
        empStore.createIndex('matricule', 'matricule', { unique: false });
        empStore.createIndex('nom', 'nom', { unique: false });
      }

      // Table des Historiques de Paie / Extractions RH
      if (!db.objectStoreNames.contains('payrollRuns')) {
        const runStore = db.createObjectStore('payrollRuns', { keyPath: 'id', autoIncrement: true });
        runStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Table des Modèles PDF personnalisés
      if (!db.objectStoreNames.contains('templates')) {
        const templateStore = db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        templateStore.createIndex('isDefault', 'isDefault', { unique: false });
      }

      // Table des Paramètres généraux (Planification, etc.)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export const localDb = {
  // 👥 EMPLOYÉS LOCAUX
  async getEmployees() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('employees', 'readonly');
      const store = tx.objectStore('employees');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async saveEmployee(employee) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('employees', 'readwrite');
      const store = tx.objectStore('employees');
      const data = { ...employee, updatedAt: new Date().toISOString() };
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteEmployee(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('employees', 'readwrite');
      const store = tx.objectStore('employees');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  // 📄 HISTORIQUE DE PAIE LOCAL
  async getPayrollRuns() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('payrollRuns', 'readonly');
      const store = tx.objectStore('payrollRuns');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).reverse());
      req.onerror = () => reject(req.error);
    });
  },

  async savePayrollRun(payrollData) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('payrollRuns', 'readwrite');
      const store = tx.objectStore('payrollRuns');
      const record = {
        ...payrollData,
        createdAt: new Date().toISOString()
      };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // 📊 STATISTIQUES LOCALES CLIENT (Calculées 100% en local)
  async getLocalStats(countryCode = 'CI') {
    const employees = await this.getEmployees();
    const runs = await this.getPayrollRuns();

    let totalMasseSalariale = 0;
    let totalCNPS = 0;
    let totalImpots = 0;
    let totalBulletins = 0;
    let totalImpotsCountry = 0;

    runs.forEach(run => {
      totalMasseSalariale += (parseFloat(run.totalMasseSalariale) || parseFloat(run.brutTotal) || 0);
      totalCNPS += (parseFloat(run.totalCnps) || 0);
      totalImpots += (parseFloat(run.totalImpots) || 0);
      totalBulletins += (parseInt(run.employeeCount) || (run.employees ? run.employees.length : 1));
      
      // Si le pays de la paie correspond à countryCode (ou s'il est vide et qu'on cherche la Côte d'Ivoire par défaut)
      if (run.country === countryCode || (!run.country && countryCode === 'CI')) {
        totalImpotsCountry += (parseFloat(run.totalImpots) || 0);
      }
    });

    return {
      employeeCount: employees.length,
      runsCount: runs.length,
      totalBulletins,
      totalMasseSalariale,
      totalCNPS,
      totalImpots,
      totalImpotsCountry
    };
  },

  // 📦 SAUVEGARDE & EXPORTATION LOCALE
  async exportBackup() {
    const employees = await this.getEmployees();
    const payrollRuns = await this.getPayrollRuns();
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      app: 'ONDA RH & Paie',
      data: {
        employees,
        payrollRuns
      }
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onda_rh_backup_local_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async importBackup(jsonString) {
    const backup = JSON.parse(jsonString);
    if (!backup.data) throw new Error("Fichier de sauvegarde invalide");

    const db = await openDb();
    if (backup.data.employees && Array.isArray(backup.data.employees)) {
      const tx = db.transaction('employees', 'readwrite');
      const store = tx.objectStore('employees');
      for (const emp of backup.data.employees) {
        delete emp.id;
        store.put(emp);
      }
    }
    if (backup.data.payrollRuns && Array.isArray(backup.data.payrollRuns)) {
      const tx = db.transaction('payrollRuns', 'readwrite');
      const store = tx.objectStore('payrollRuns');
      for (const run of backup.data.payrollRuns) {
        delete run.id;
        store.add(run);
      }
    }
    return true;
  },

  // 📄 MODÈLES PDF (TEMPLATES)
  async getTemplates() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('templates', 'readonly');
      const store = tx.objectStore('templates');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async saveTemplate(templateData) {
    const db = await openDb();
    // Si isDefault est true, on désactive les autres par défaut du même type
    if (templateData.isDefault) {
      await this.clearDefaultTemplates(templateData.type || 'payslip');
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('templates', 'readwrite');
      const store = tx.objectStore('templates');
      const req = store.put({ ...templateData, updatedAt: new Date().toISOString() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteTemplate(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('templates', 'readwrite');
      const store = tx.objectStore('templates');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async clearDefaultTemplates(type = 'payslip') {
    const templates = await this.getTemplates();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('templates', 'readwrite');
      const store = tx.objectStore('templates');
      templates.forEach(t => {
        const tType = t.type || 'payslip';
        if (t.isDefault && tType === type) {
          t.isDefault = false;
          store.put(t);
        }
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  // ⚙️ PARAMÈTRES (SETTINGS)
  async getSettings() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.getAll();
      req.onsuccess = () => {
        const settings = {};
        if (req.result) {
          req.result.forEach(r => settings[r.key] = r.value);
        }
        resolve(settings);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getSetting(key, defaultValue = null) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => reject(req.error);
    });
  },

  async saveSetting(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value, updatedAt: new Date().toISOString() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
};
