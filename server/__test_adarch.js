const fs = require('fs');
const payrollService = require('./payrollService');

async function main() {
  const employee = {
    pays: 'CI', nom: 'KONE', prenom: 'Fatoumata', matricule: 'AD-042',
    numero_cnps: '00099988', poste: 'Architecte', categorie: 'Cadre',
    departement: 'Études', service: 'Bureau d\'études', equipe: 'Équipe A',
    salaire_base: 450000, prime_transport: 30000, mois: '8', annee: '2026',
    date_embauche: '2023-03-15', situation_matrimoniale: 'marie', nombre_enfants: 2,
    virement: false
  };
  const calc = payrollService.calculateSinglePayroll(employee);
  const companyInfo = {
    nom_entreprise: 'A.D. ARCHITECTURE', adresse: 'Riviera Palmeraie', ville: 'Abidjan, Côte d\'Ivoire',
    numero_contribuable: 'CI-ABJ-7654321Y', numero_cnps: '011223 B'
  };

  const buf = await payrollService.generateSinglePdf(employee, calc, companyInfo, null, 'adArchitecture');
  fs.writeFileSync(process.env.OUT_DIR + '/bulletin_adarch.pdf', buf);
  console.log('OK, PDF écrit,', buf.length, 'octets');
}

main().catch(e => { console.error('ECHEC:', e); process.exit(1); });
