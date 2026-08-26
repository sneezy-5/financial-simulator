const fs = require('fs');
const payrollService = require('./payrollService');

async function main() {
  const employee = {
    pays: 'CI', nom: 'KONE', prenom: 'Al-Moustapha', matricule: 'SC-011',
    numero_cnps: '00033221', poste: 'Vendeur Commercial', categorie: 'Employé',
    departement: 'Commerciale', salaire_base: 120000, prime_transport: 10000, mois: '8', annee: '2024',
    date_embauche: '2024-04-05', situation_matrimoniale: 'celibataire', nombre_enfants: 0,
    primes: [{ libelle: "Prime d'incitation", montant: 15000 }],
    virement: true
  };
  const calc = payrollService.calculateSinglePayroll(employee);
  const companyInfo = {
    nom_entreprise: 'SCASO', adresse: 'Cocody les II Plateaux', ville: "Côte d'Ivoire"
  };

  const buf = await payrollService.generateSinglePdf(employee, calc, companyInfo, null, 'scaso');
  fs.writeFileSync(process.env.OUT_DIR + '/bulletin_scaso.pdf', buf);
  console.log('OK, PDF écrit,', buf.length, 'octets');
}

main().catch(e => { console.error('ECHEC:', e); process.exit(1); });
