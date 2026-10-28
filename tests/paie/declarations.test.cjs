// Tests des déclarations ITS / FDFP et des états annuels (DISA, livre, récap, régul FDFP).
//   node tests/paie/declarations.test.cjs
//
// 1. jeu de cohérence LOGIPAIE (10 salariés, brut 2 942 500) : montants officiels ;
// 2. une année complète générée par le moteur : les états annuels recoupent les bulletins ;
// 3. chaque type se rend en PDF, Excel et CSV.

const path = require('path');
const racine = path.join(__dirname, '..', '..');
const etats = require(path.join(racine, 'server', 'declarations', 'declarationsEtats.js'));
const { genererDeclaration, TYPES } = require(path.join(racine, 'server', 'declarations'));

let ko = 0;
const ok = (label, cond, detail) => {
  if (!cond) ko++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + label + (!cond && detail !== undefined ? '  → ' + detail : ''));
};
const bloc = (d, debutTitre) => d.blocs.find(b => b.titre.startsWith(debutTitre));

console.log('\n▸ Jeu de cohérence LOGIPAIE (10 salariés, brut 2 942 500)');
// Répartition arbitraire : seuls les totaux sont publiés par le classeur de référence.
const BRUTS = [294250, 294250, 294250, 294250, 294250, 294250, 294250, 294250, 294250, 294250];
const ITS = [22620, 22620, 22620, 22620, 22620, 22620, 22620, 22620, 22620, 22615];
const ref = BRUTS.map((b, i) => ({
  nom: 'SAL' + i, prenom: 'Test', numeroCnps: 'C' + i, brutTotal: b, brutImposable: b, its: ITS[i],
  statutSalarie: 'local', mois: 8, annee: 2025
}));
const periodeAout = { type: 'mensuel', libelle: 'Août 2025', code: '2025/08', mois: 8, annee: 2025, nbPeriodes: 1 };
const its = etats.declarationIts({ entreprise: {}, periode: periodeAout, lignes: ref });
const contrib = bloc(its, '03-2');
ok('Revenu net imposable = 2 354 000 (80 %)', bloc(its, '02').lignes[3][2] === 2354000, bloc(its, '02').lignes[3][2]);
ok('ITS retenu = 226 195', bloc(its, '03-1').lignes[0][2] === 226195, bloc(its, '03-1').lignes[0][2]);
ok('CN personnel local = 35 310 (1,5 % du net imposable)', contrib.lignes[2][5] === 35310, contrib.lignes[2][5]);
ok('CE personnel local = 0', contrib.lignes[0][5] === 0);
ok('Total à payer = 261 505', its.aPayer.montant === 261505, its.aPayer.montant);

const fdfp = etats.declarationFdfp({ entreprise: {}, periode: periodeAout, lignes: ref });
const taxes = bloc(fdfp, '2.2').lignes;
ok('TA = 11 770 (0,4 %)', taxes[0][3] === 11770, taxes[0][3]);
ok('TFC = 17 655 (0,6 %)', taxes[1][3] === 17655, taxes[1][3]);
ok('FDFP total = 29 425', fdfp.aPayer.montant === 29425, fdfp.aPayer.montant);

console.log('\n▸ Expatrié : CE 11,5 % du net imposable = 9,2 % du brut');
const expat = etats.declarationIts({ entreprise: {}, periode: periodeAout, lignes: [{ brutTotal: 1600000, brutImposable: 1600000, its: 0, statutSalarie: 'expatrie' }] });
ok('CE expatrié = 147 200', bloc(expat, '03-2').lignes[1][5] === 147200, bloc(expat, '03-2').lignes[1][5]);

console.log('\n▸ Données manquantes');
const partiel = etats.declarationIts({ entreprise: {}, periode: periodeAout, lignes: [...ref, { nom: 'ANCIEN', brutTotal: 300000, brutImposable: null, its: 20000 }] });
ok('Bulletin sans brut imposable → document partiel + avertissement', partiel.partielle && partiel.avertissements.length > 0);
ok('… exclu des bases, mais son ITS retenu reste compté', bloc(partiel, '02').lignes[2][2] === 2942500 && bloc(partiel, '03-1').lignes[0][2] === 246195);

console.log('\n▸ Année complète générée par le moteur');
const log = console.log; console.log = () => {};
const payroll = require(path.join(racine, 'server', 'payrollService.js'));
console.log = log;
const salaries = [
  { nom: 'KONE', prenom: 'Awa', matricule: 'M1', numero_cnps: '111', salaire_base: 400000, prime_transport: 50000, situation_matrimoniale: 'celibataire', date_embauche: '2020-01-06', date_naissance: '1990-05-01' },
  { nom: 'YAO', prenom: 'Koffi', matricule: 'M2', numero_cnps: '222', salaire_base: 1500000, prime_transport: 30000, situation_matrimoniale: 'marie', nombre_enfants: 2, statut_salarie: 'expatrie', date_embauche: '2023-03-01', date_naissance: '1985-02-10' },
  { nom: 'DIABY', prenom: 'Moussa', matricule: 'M3', numero_cnps: '333', salaire_base: 75000, prime_transport: 30000, situation_matrimoniale: 'celibataire', acompte: 10000, date_embauche: '2026-04-01', date_naissance: '2000-07-07' }
];
const annee = [];
const calculs = [];
for (let mois = 1; mois <= 12; mois++) {
  for (const s of salaries) {
    if (s.matricule === 'M3' && mois < 4) continue; // embauché en avril
    const emp = { ...s, mois, annee: 2026 };
    const c = payroll.calculateSinglePayroll(emp);
    calculs.push(c);
    annee.push({ ...payroll.buildPayslipSnapshot(emp, c), mois, annee: 2026 });
  }
}
const periodeAn = etats.periodeAnnuelle(2026, Array.from({ length: 12 }, (_, i) => ({ mois: i + 1, annee: 2026 })));
const somme = (champ) => calculs.reduce((s, c) => s + champ(c), 0);

const d = etats.disa({ entreprise: {}, periode: periodeAn, lignes: annee });
const lignesDisa = d.blocs[0].lignes;
ok('DISA : 3 salariés', lignesDisa.length === 3, lignesDisa.length);
ok('DISA : Moussa a 9 mois d\'activité', lignesDisa.find(l => l[1] === 'DIABY')[9] === 9);
ok('DISA : brut annuel = somme des bruts imposables', d.blocs[0].total[8] === somme(c => c.brutImposable), d.blocs[0].total[8]);
ok('DISA : assiette retraite = somme des bases CNPS', d.blocs[0].total[11] === somme(c => c.baseCNPS));
ok('DISA complète (aucun champ manquant)', !d.partielle, d.avertissements.join(' | '));

const livre = etats.livrePaieAnnuel({ entreprise: {}, periode: periodeAn, lignes: annee });
const colonnes = livre.blocs[0].colonnes.map(c => c.libelle);
const totalLivre = (lib) => livre.blocs[0].total[colonnes.indexOf(lib)];
ok('Livre : net annuel = somme des nets', totalLivre('Net à payer') === somme(c => c.netAPayer), totalLivre('Net à payer'));
ok('Livre : total gains = somme des gains', totalLivre('Total gains') === somme(c => c.gainsTotaux));
ok('Livre : acomptes retrouvés (9 × 10 000)', totalLivre('Acomptes et autres') === 90000, totalLivre('Acomptes et autres'));
ok('Livre : coût employeur = gains + charges patronales', totalLivre('Coût employeur') === somme(c => c.gainsTotaux + c.patronal.grandTotal), totalLivre('Coût employeur'));

const recap = etats.recapMasseSalariale({ entreprise: {}, periode: periodeAn, lignes: annee });
const ligneRecap = (lib) => recap.blocs[0].lignes.find(l => l[0] === lib);
ok('Récap : effectif janvier 2, décembre 3', ligneRecap('Effectif')[1] === 2 && ligneRecap('Effectif')[12] === 3);
ok('Récap : ITS annuel = somme des ITS', ligneRecap('ITS')[13] === somme(c => c.salarial.its));

const regul = etats.regulFdfp({ entreprise: {}, periode: periodeAn, lignes: annee });
const masse = somme(c => c.brutImposable);
ok('Régul FDFP : solde = 1,2 % − 0,6 % de la masse', regul.aPayer.montant === Math.round(masse * 0.012) - Math.round(masse * 0.006), regul.aPayer.montant);

console.log('\n▸ Rendu de chaque type (PDF, Excel, CSV)');
(async () => {
  const entreprise = { raisonSociale: 'ONDA TEST', numeroContribuable: '1212170 D', serviceAssiette: 'CME Saint Jean', ville: 'Abidjan' };
  const periodesAn = Array.from({ length: 12 }, (_, i) => ({ mois: i + 1, annee: 2026 }));
  for (const type of TYPES) {
    for (const format of ['pdf', 'xlsx', 'csv']) {
      try {
        const annuel = ['disa', 'livre-annuel', 'recap-masse', 'regul-fdfp'].includes(type);
        const out = await genererDeclaration({
          type, format, entreprise,
          periodes: annuel ? periodesAn : [{ mois: 10, annee: 2026 }],
          records: annuel ? annee : annee.filter(r => r.mois === 10)
        });
        const signature = format === 'pdf' ? out.buffer.slice(0, 4).toString() === '%PDF'
          : format === 'xlsx' ? out.buffer.slice(0, 2).toString() === 'PK' : out.buffer.length > 50;
        ok(`${type} · ${format} (${out.filename})`, signature);
      } catch (e) {
        ok(`${type} · ${format}`, false, e.message);
      }
    }
  }
  console.log(ko ? `\n✗ ${ko} échec(s)\n` : '\n✓ Tout est vert.\n');
  process.exit(ko ? 1 : 0);
})();
