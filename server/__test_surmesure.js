const fs = require('fs');
const payrollService = require('./payrollService');

async function main() {
  const employee = {
    pays: 'CI', nom: 'YAO', prenom: 'Kouadio', matricule: 'EMP-001',
    numero_cnps: '00011223344', poste: 'Développeur', categorie: 'M2',
    salaire_base: 250000, sursalaire: 50000, prime_transport: 30000, mois: '8', annee: '2026',
    date_embauche: '2022-03-01', situation_matrimoniale: 'marie', nombre_enfants: 2,
    primes: [{ libelle: 'Prime de responsabilité', montant: 40000 }],
    virement: true
  };
  const calc = payrollService.calculateSinglePayroll(employee);
  const companyInfo = {
    nom_entreprise: 'VOTRE ENTREPRISE', adresse: 'Plateau', ville: "Abidjan, Côte d'Ivoire"
  };

  const buf = await payrollService.generateSinglePdf(employee, calc, companyInfo, null, 'surMesure');
  fs.writeFileSync(process.env.OUT_DIR + '/bulletin_surmesure.pdf', buf);
  console.log('OK, PDF écrit,', buf.length, 'octets');
}

main().catch(e => { console.error('ECHEC:', e); process.exit(1); });
