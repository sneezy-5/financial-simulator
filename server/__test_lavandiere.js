const fs = require('fs');
const payrollService = require('./payrollService');

async function main() {
  const employee = {
    pays: 'CI', nom: 'BAH', prenom: 'Abdoulaye', matricule: '30178',
    numero_cnps: '00088877', poste: 'Commercial piste', categorie: '1 B (E)',
    departement: 'Commercial', salaire_base: 250000, sursalaire: 10000,
    prime_transport: 25000, mois: '8', annee: '2026',
    date_embauche: '2025-08-01', situation_matrimoniale: 'celibataire', nombre_enfants: 0,
    virement: true
  };
  const calc = payrollService.calculateSinglePayroll(employee);
  const companyInfo = {
    nom_entreprise: 'LA LAVANDIERE', adresse: '28 BP 304 Abidjan 28', ville: 'Cocody, Côte d\'Ivoire',
    numero_contribuable: 'CI-ABJ-1234567X', numero_cnps: '067964 A', telephone: '22 52 34 93'
  };

  const buf = await payrollService.generateSinglePdf(employee, calc, companyInfo, null, 'lavandiere');
  fs.writeFileSync(process.env.OUT_DIR + '/bulletin_lavandiere.pdf', buf);
  console.log('OK, PDF écrit,', buf.length, 'octets');
}

main().catch(e => { console.error('ECHEC:', e); process.exit(1); });
