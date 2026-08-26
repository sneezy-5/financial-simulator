const fs = require('fs');
const payrollService = require('./payrollService');

async function main() {
  const employee = {
    pays: 'CI', nom: 'TRAORE', prenom: 'Ibrahim', matricule: 'TCM-118',
    numero_cnps: '00077665', poste: 'Chauffeur Poids Lourd', categorie: '3A',
    departement: 'Transport', qualification: 'Chauffeur PL', niveau: 'III', coefficient: '150', indice: '215',
    salaire_base: 180000, prime_transport: 25000, prime_logement: 20000, mois: '8', annee: '2026',
    date_embauche: '2021-05-10', situation_matrimoniale: 'marie', nombre_enfants: 3,
    virement: true
  };
  const calc = payrollService.calculateSinglePayroll(employee);
  const companyInfo = {
    nom_entreprise: 'TCM LOGISTIC', adresse: 'Zone Industrielle Vridi', ville: 'Abidjan, Côte d\'Ivoire',
    numero_contribuable: 'CI-ABJ-9988776Z', numero_cnps: '044556 C'
  };

  const buf = await payrollService.generateSinglePdf(employee, calc, companyInfo, null, 'tcmLogistic');
  fs.writeFileSync(process.env.OUT_DIR + '/bulletin_tcm.pdf', buf);
  console.log('OK, PDF écrit,', buf.length, 'octets');
}

main().catch(e => { console.error('ECHEC:', e); process.exit(1); });
