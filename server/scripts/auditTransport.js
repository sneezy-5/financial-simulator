// Audit LECTURE SEULE : bulletins enregistrés avant le plafonnement de la prime
// de transport (commit 05082d7) qui ont pu exonérer plus que la limite légale.
//
//   node server/scripts/auditTransport.js            → résumé par compte
//   node server/scripts/auditTransport.js --detail   → une ligne par bulletin
//
// Les contrats (et donc le montant exact du transport) vivent dans le navigateur
// des clients, pas sur le serveur. On repère donc les bulletins dont la part
// NON imposable (brut total − brut imposable) dépasse le plafond d'Abidjan :
// c'est le transport au-delà de 30 000… ou un logement / une prime non imposable
// légitime. Chaque ligne est donc « à vérifier » avec le client, pas une erreur avérée.

const { sequelize, pret, User, PayrollPeriod, PayslipRecord } = require('../database');
const { BAREMES_CI } = require('../moteur/paieCI.cjs');

const PLAFOND = BAREMES_CI[0].transportExonere.abidjan;
const detail = process.argv.includes('--detail');

(async () => {
  await pret;
  const records = await PayslipRecord.findAll({
    include: [{ model: PayrollPeriod, include: [{ model: User, attributes: ['id', 'email', 'companyName'] }] }]
  });

  const suspects = records
    .filter(r => r.brutImposable != null && (r.brutTotal - r.brutImposable) > PLAFOND)
    .map(r => ({
      compte: r.PayrollPeriod?.User?.email || '?',
      entreprise: r.PayrollPeriod?.User?.companyName || '',
      periode: `${String(r.PayrollPeriod?.mois).padStart(2, '0')}/${r.PayrollPeriod?.annee}`,
      salarie: `${r.prenom || ''} ${r.nom || ''}`.trim(),
      nonImposable: Math.round(r.brutTotal - r.brutImposable)
    }));

  const ignores = records.filter(r => r.brutImposable == null).length;
  console.log(`\n${records.length} bulletins enregistrés · ${suspects.length} à vérifier · ${ignores} anciens sans brut imposable (non analysables)\n`);

  if (detail) {
    console.table(suspects);
  } else {
    const parCompte = {};
    for (const s of suspects) {
      const k = `${s.compte} ${s.entreprise ? '(' + s.entreprise + ')' : ''}`;
      parCompte[k] = parCompte[k] || { bulletins: 0, salaries: new Set() };
      parCompte[k].bulletins++;
      parCompte[k].salaries.add(s.salarie);
    }
    console.table(Object.entries(parCompte).map(([compte, v]) => ({ compte, bulletins: v.bulletins, salaries: v.salaries.size })));
  }
  await sequelize.close();
})().catch(e => {
  console.error('Audit impossible :', e.message);
  process.exit(1);
});
