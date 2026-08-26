// Aller-retour du classeur d'import : on le construit, on le relit.
const path = require('path');
const RACINE = process.cwd();
const XLSX = require(path.join(RACINE, 'server/node_modules/xlsx'));
const { construireClasseur } = require(path.join(RACINE, 'server/import/classeurModele.js'));
const { lireClasseur } = require(path.join(RACINE, 'server/import/classeurLecture.js'));

let ko = 0;
const ok = (label, cond, detail) => { if (!cond) ko++; console.log('  ' + (cond ? 'ok  ' : 'KO  ') + label + (!cond && detail ? '  -> ' + detail : '')); };

const wb = construireClasseur(XLSX);
console.log('Feuilles :', wb.SheetNames.join(', '));

const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const relu = XLSX.read(buffer, { type: 'buffer', cellDates: true });
const lu = lireClasseur(XLSX, relu);

ok('les trois feuilles sont lues', lu.feuillesLues.length === 3, lu.feuillesLues.join(','));
ok("l'entreprise est reprise", lu.entreprise && lu.entreprise.raisonSociale === 'MA SOCIETE SARL', JSON.stringify(lu.entreprise));
ok('le signataire est repris', lu.entreprise && lu.entreprise.signataireFonction === 'Directrice generale' || lu.entreprise.signataireFonction.length > 3);
ok('un salarie est lu', lu.employes.length === 1, JSON.stringify(lu.employes));
ok('le salaire NET est sur la fiche', lu.employes[0] && lu.employes[0].salaire_net === 385000, JSON.stringify(lu.employes[0]));
ok('la fiche ne porte PAS le salaire de base', lu.employes[0] && lu.employes[0].salaire_base === undefined);
ok('la situation matrimoniale est lue', lu.employes[0] && lu.employes[0].situation_matrimoniale === 'marie');
ok('les enfants a charge sont lus', lu.employes[0] && lu.employes[0].nombre_enfants === 2);
ok('un contrat est lu', lu.contrats.length === 1);
ok('le contrat porte le salaire de base', lu.contrats[0] && lu.contrats[0].salaireDeBase === 350000, JSON.stringify(lu.contrats[0]));
ok('les primes du contrat sont recomposees', lu.contrats[0] && lu.contrats[0].primes.length === 2, JSON.stringify(lu.contrats[0] && lu.contrats[0].primes));
ok('le transport est marque non imposable', lu.contrats[0] && lu.contrats[0].primes[0].imposable === false);
ok('contrat et fiche partagent le matricule', lu.contrats[0] && lu.contrats[0].matricule === lu.employes[0].matricule);
ok('aucun avertissement sur le modele', lu.avertissements.length === 0, lu.avertissements.join(' | '));

// Un classeur mal intitule doit quand meme etre compris.
const perso = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(perso, XLSX.utils.json_to_sheet([{
    'Matricule': 'E-9', 'Nom du salarié': 'YAO', 'Prénoms': 'Kouassi',
    'Situation Familiale': 'Célibataire', 'Enfants à charge': 3, 'Net à payer': '412 500 FCFA'
}]), 'Employés');
XLSX.utils.book_append_sheet(perso, XLSX.utils.json_to_sheet([{
    'Matricule': 'E-9', 'Type contrat': 'cdd', 'Début': '01/09/2026', 'Fin': '31/08/2027',
    'Salaire de base': '480 000', 'Sur salaire': 20000
}]), 'Contrat');
const lu2 = lireClasseur(XLSX, perso);
console.log('\n  -- classeur aux intitules libres --');
ok('les intitules accentues sont reconnus', lu2.employes[0] && lu2.employes[0].nom === 'YAO', JSON.stringify(lu2.employes[0]));
ok('« Net à payer » est reconnu comme salaire net', lu2.employes[0] && lu2.employes[0].salaire_net === 412500, JSON.stringify(lu2.employes[0]));
ok('« Enfants à charge » est reconnu', lu2.employes[0] && lu2.employes[0].nombre_enfants === 3);
ok('le type de contrat est normalise', lu2.contrats[0] && lu2.contrats[0].type === 'CDD');
ok('les dates JJ/MM/AAAA sont converties', lu2.contrats[0] && lu2.contrats[0].dateDebut === '2026-09-01', lu2.contrats[0] && lu2.contrats[0].dateDebut);
ok('un montant espace est lu', lu2.contrats[0] && lu2.contrats[0].salaireDeBase === 480000);

// Un contrat orphelin doit etre signale, pas rattache au hasard.
const bancal = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(bancal, XLSX.utils.json_to_sheet([{ matricule: 'A', nom: 'UN' }]), 'EMPLOYES');
XLSX.utils.book_append_sheet(bancal, XLSX.utils.json_to_sheet([{ matricule: 'Z', type: 'CDI' }]), 'CONTRATS');
const lu3 = lireClasseur(XLSX, bancal);
console.log('\n  -- coherence --');
ok('un contrat orphelin est signale', lu3.avertissements.some(a => a.includes('absent')), lu3.avertissements.join(' | '));
ok('un salarie sans contrat est signale', lu3.avertissements.some(a => a.includes('sans contrat')), lu3.avertissements.join(' | '));

console.log('\n' + (ko ? ko + ' echec(s)' : 'Classeur d import : vert') + '\n');
process.exit(ko ? 1 : 0);
