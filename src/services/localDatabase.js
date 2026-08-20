// ══════════════════════════════════════════════════════════════════════════
// SERVICE BASE DE DONNÉES CENTRALISÉE - ONDA RH
// Anciennement IndexedDB, maintenant connecté à l'API backend (/api/hr)
// ══════════════════════════════════════════════════════════════════════════

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const localDb = {
  // 👥 EMPLOYÉS
  async getEmployees() {
    const res = await fetch(`${API_URL}/hr/employees`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Erreur chargement employés');
    const data = await res.json();
    return data.employees || [];
  },

  async saveEmployee(employee) {
    const isUpdate = !!employee.id;
    const url = isUpdate ? `${API_URL}/hr/employees/${employee.id}` : `${API_URL}/hr/employees`;
    const method = isUpdate ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(employee)
    });
    if (!res.ok) throw new Error('Erreur sauvegarde employé');
    const data = await res.json();
    return data.employee;
  },

  async deleteEmployee(id) {
    const res = await fetch(`${API_URL}/hr/employees/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erreur suppression employé');
    return true;
  },

  // 🏖️ ABSENCES / CONGÉS
  async getAbsences() {
    const res = await fetch(`${API_URL}/hr/absences`, { headers: getHeaders() });
    if (!res.ok) return JSON.parse(localStorage.getItem('onda_conges') || '[]');
    const data = await res.json();
    return data.absences || [];
  },

  async saveAbsence(absence) {
    const isUpdate = !!absence.id && typeof absence.id !== 'number'; // Les IDs locaux sont souvent des timestamps numériques
    const url = isUpdate ? `${API_URL}/hr/absences/${absence.id}` : `${API_URL}/hr/absences`;
    const method = isUpdate ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(absence)
    });
    if (!res.ok) {
       const local = JSON.parse(localStorage.getItem('onda_conges') || '[]');
       if (!isUpdate) {
         absence.id = Date.now();
         local.push(absence);
       } else {
         const idx = local.findIndex(a => a.id === absence.id);
         if (idx !== -1) local[idx] = absence;
       }
       localStorage.setItem('onda_conges', JSON.stringify(local));
       return absence;
    }
    const data = await res.json();
    return data.absence;
  },

  async deleteAbsence(id) {
    const res = await fetch(`${API_URL}/hr/absences/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
       const local = JSON.parse(localStorage.getItem('onda_conges') || '[]');
       localStorage.setItem('onda_conges', JSON.stringify(local.filter(a => a.id !== id)));
       return true;
    }
    return true;
  },

  // 🎓 FORMATIONS
  async getFormations() {
    const res = await fetch(`${API_URL}/hr/formations`, { headers: getHeaders() });
    if (!res.ok) return JSON.parse(localStorage.getItem('onda_formations') || '[]');
    const data = await res.json();
    return data.formations || [];
  },

  async saveFormation(formation) {
    const isUpdate = !!formation.id && typeof formation.id !== 'number';
    const url = isUpdate ? `${API_URL}/hr/formations/${formation.id}` : `${API_URL}/hr/formations`;
    const method = isUpdate ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(formation)
    });
    if (!res.ok) {
       const local = JSON.parse(localStorage.getItem('onda_formations') || '[]');
       if (!isUpdate) {
         formation.id = Date.now();
         local.push(formation);
       } else {
         const idx = local.findIndex(f => f.id === formation.id);
         if (idx !== -1) local[idx] = formation;
       }
       localStorage.setItem('onda_formations', JSON.stringify(local));
       return formation;
    }
    const data = await res.json();
    return data.formation;
  },

  async deleteFormation(id) {
    const res = await fetch(`${API_URL}/hr/formations/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
       const local = JSON.parse(localStorage.getItem('onda_formations') || '[]');
       localStorage.setItem('onda_formations', JSON.stringify(local.filter(f => f.id !== id)));
       return true;
    }
    return true;
  },

  // 📝 EVALUATIONS
  async getEvaluations() {
    const res = await fetch(`${API_URL}/hr/evaluations`, { headers: getHeaders() });
    if (!res.ok) return JSON.parse(localStorage.getItem('onda_evaluations') || '[]');
    const data = await res.json();
    return data.evaluations || [];
  },

  async saveEvaluation(evaluation) {
    const isUpdate = !!evaluation.id && typeof evaluation.id !== 'number';
    const url = isUpdate ? `${API_URL}/hr/evaluations/${evaluation.id}` : `${API_URL}/hr/evaluations`;
    const method = isUpdate ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(evaluation)
    });
    if (!res.ok) {
       const local = JSON.parse(localStorage.getItem('onda_evaluations') || '[]');
       if (!isUpdate) {
         evaluation.id = Date.now();
         local.push(evaluation);
       } else {
         const idx = local.findIndex(e => e.id === evaluation.id);
         if (idx !== -1) local[idx] = evaluation;
       }
       localStorage.setItem('onda_evaluations', JSON.stringify(local));
       return evaluation;
    }
    const data = await res.json();
    return data.evaluation;
  },

  async deleteEvaluation(id) {
    const res = await fetch(`${API_URL}/hr/evaluations/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
       const local = JSON.parse(localStorage.getItem('onda_evaluations') || '[]');
       localStorage.setItem('onda_evaluations', JSON.stringify(local.filter(e => e.id !== id)));
       return true;
    }
    return true;
  },

  // 📄 HISTORIQUE DE PAIE
  // Garde-fou: si on n'a pas encore fait le backend paie, fallback local
  async getPayrollRuns() {
    try {
      const res = await fetch(`${API_URL}/payroll/history`, { headers: getHeaders() });
      if (!res.ok) return JSON.parse(localStorage.getItem('onda_payroll_runs') || '[]');
      const data = await res.json();
      return data.history || [];
    } catch {
      return JSON.parse(localStorage.getItem('onda_payroll_runs') || '[]');
    }
  },

  async savePayrollRun(payrollData) {
    try {
      const res = await fetch(`${API_URL}/payroll/save-run`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payrollData)
      });
      if (!res.ok) throw new Error('API non dispo');
      return await res.json();
    } catch {
      const runs = JSON.parse(localStorage.getItem('onda_payroll_runs') || '[]');
      runs.push({ ...payrollData, id: Date.now(), createdAt: new Date().toISOString() });
      localStorage.setItem('onda_payroll_runs', JSON.stringify(runs));
      return true;
    }
  },

  // 📊 STATISTIQUES LOCALES CLIENT
  async getLocalStats(countryCode = 'CI') {
    const employees = await this.getEmployees().catch(() => []);
    const runs = await this.getPayrollRuns().catch(() => []);

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
      data: { employees, payrollRuns }
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onda_rh_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async importBackup(jsonString) {
    const backup = JSON.parse(jsonString);
    if (!backup.data) throw new Error("Fichier de sauvegarde invalide");

    if (backup.data.employees && Array.isArray(backup.data.employees)) {
      for (const emp of backup.data.employees) {
        delete emp.id;
        await this.saveEmployee(emp).catch(console.error);
      }
    }
    return true;
  },

  // 📄 MODÈLES PDF (TEMPLATES)
  async getTemplates() {
    return JSON.parse(localStorage.getItem('onda_templates') || '[]');
  },

  async saveTemplate(template) {
    const temps = JSON.parse(localStorage.getItem('onda_templates') || '[]');
    if (template.id) {
      const idx = temps.findIndex(t => t.id === template.id);
      if (idx !== -1) temps[idx] = template;
      else temps.push(template);
    } else {
      template.id = Date.now();
      temps.push(template);
    }
    localStorage.setItem('onda_templates', JSON.stringify(temps));
    return template;
  },

  async deleteTemplate(id) {
    let temps = JSON.parse(localStorage.getItem('onda_templates') || '[]');
    temps = temps.filter(t => t.id !== id);
    localStorage.setItem('onda_templates', JSON.stringify(temps));
    return true;
  },

  async clearDefaultTemplates(type = 'payslip') {
    const templates = await this.getTemplates();
    templates.forEach(t => {
      if (t.isDefault && (t.type || 'payslip') === type) {
        t.isDefault = false;
      }
    });
    localStorage.setItem('onda_templates', JSON.stringify(templates));
    return true;
  },

  // ⚙️ PARAMÈTRES (SETTINGS)
  async getSettings() {
    return JSON.parse(localStorage.getItem('onda_settings') || '{}');
  },

  async getSetting(key, defaultValue = null) {
    const settings = await this.getSettings();
    return settings[key] !== undefined ? settings[key] : defaultValue;
  },

  async saveSetting(key, value) {
    const settings = await this.getSettings();
    settings[key] = value;
    localStorage.setItem('onda_settings', JSON.stringify(settings));
    return true;
  }
};
