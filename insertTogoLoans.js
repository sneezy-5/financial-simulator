const fs = require('fs');
const path = require('path');

const tsv = `banque	produit	taux_min	taux_max	duree_max_mois	montant_max	frais_dossier_pct	frais_dossier_min	assurance_pct	apport_pct	taux_endettement_max	penalite_remplacement_pct	age_min	age_max	revenu_min	conditions
Ecobank Togo	Prêt personnel	9.0	12.0	60	5000000	1.5	50000	1.0	0	35	1.5	21	60	150000	CDI, domiciliation salaire, assurance décès-invalidité
Ecobank Togo	Prêt immobilier	7.0	10.0	240	150000000	1.5	50000	1.0	15	35	1.5	21	60	200000	Apport 10–20%, hypothèque, assurance multirisques
Ecobank Togo	Crédit auto	8.0	11.0	60	30000000	1.5	50000	1.0	10	35	1.5	21	60	150000	Facture proforma, assurance tous risques
Orabank Togo	Prêt personnel (Ora'Conso)	7.0	9.0	60	10000000	1.0	25000	1.0	0	33	1.5	21	65	200000	CDI, domiciliation salaire, assurance
Orabank Togo	Prêt immobilier	6.0	8.0	240	300000000	1.0	25000	1.0	10	33	1.5	21	65	200000	Apport 10%, hypothèque 1er rang, assurance
Orabank Togo	Crédit auto	7.5	9.5	60	40000000	1.0	25000	1.0	10	33	1.5	21	65	200000	Facture, assurance tous risques
Coris Bank Togo	Prêt personnel	8.0	10.0	48	5000000	1.5	30000	1.0	0	35	1.5	21	60	150000	CDI, domiciliation salaire
Coris Bank Togo	Prêt immobilier	7.0	9.0	180	100000000	1.5	30000	1.0	15	35	1.5	21	60	200000	Apport 15%, hypothèque, assurance
Coris Bank Togo	Crédit auto	8.5	10.5	60	25000000	1.5	30000	1.0	10	35	1.5	21	60	150000	Facture, assurance
BOA Togo	Prêt consommation	8.0	10.0	60	10000000	1.25	50000	1.0	0	33	1.5	21	60	200000	CDI, domiciliation salaire, assurance
BOA Togo	Prêt Ma Maison (immobilier)	6.5	8.5	300	200000000	1.25	50000	1.0	10	33	1.5	21	60	200000	Épargne préalable (36 mois), apport 10%
BOA Togo	Crédit auto	8.0	10.0	60	30000000	1.25	50000	1.0	10	33	1.5	21	60	200000	Facture, assurance
NSIA Banque Togo	Prêt personnel	7.5	9.5	60	10000000	1.5	50000	1.0	0	35	1.5	21	65	150000	CDI, domiciliation salaire
NSIA Banque Togo	Prêt immobilier	6.5	9.0	240	150000000	1.5	50000	1.0	15	35	1.5	21	65	200000	Apport 10–20%, hypothèque, assurance
NSIA Banque Togo	Crédit auto	8.0	10.0	60	30000000	1.5	50000	1.0	10	35	1.5	21	65	150000	Facture, assurance`;

const banks = {
  'Ecobank Togo': 201,
  'Orabank Togo': 202,
  'Coris Bank Togo': 204,
  'BOA Togo': 205, // Will be added
  'NSIA Banque Togo': 206 // Will be added
};

const lines = tsv.trim().split('\n').slice(1);
const loans = lines.map((line, i) => {
  const parts = line.split('\t');
  if (parts.length < 15) return null;
  const bName = parts[0].trim();
  const nom = parts[1].trim();
  let type = "consommation";
  if (nom.toLowerCase().includes("immo") || nom.toLowerCase().includes("maison")) type = "immobilier";
  if (nom.toLowerCase().includes("auto")) type = "automobile";

  return {
    id: 1000 + i,
    banque_id: banks[bName],
    nom: nom,
    type: type,
    taux: parseFloat(parts[2]),
    taux_max: parseFloat(parts[3]), 
    montant_min: 500000, 
    montant_max: parseInt(parts[5]),
    duree_min: 12,
    duree_max: parseInt(parts[4]),
    frais_dossier: parseFloat(parts[6]),
    frais_dossier_min: parseInt(parts[7]),
    assurance: parseFloat(parts[8]),
    description: "Financement " + type + " proposé par " + bName + " pour vos projets.",
    avantages: [parts[15]],
    conditions: {
      age_min: parseInt(parts[12]),
      age_max: parseInt(parts[13]),
      anciennete_min: 12,
      revenus_min: parseInt(parts[14]),
      types_contrat: ["cdi", "fonctionnaire"],
      garantie_requise: type === "immobilier" || type === "automobile",
      types_garantie_acceptes: type === "immobilier" ? ["hypotheque"] : type === "automobile" ? ["gage_vehicule"] : ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: parseInt(parts[9] || 0)
    }
  };
}).filter(Boolean);

// Create the js code block for loans
const loansJsCode = loans.map(l => {
  return `  {
    id: ${l.id},
    banque_id: ${l.banque_id},
    nom: ${JSON.stringify(l.nom)},
    type: ${JSON.stringify(l.type)},
    taux: ${l.taux},
    montant_min: ${l.montant_min},
    montant_max: ${l.montant_max},
    duree_min: ${l.duree_min},
    duree_max: ${l.duree_max},
    frais_dossier: ${l.frais_dossier},
    frais_dossier_min: ${l.frais_dossier_min},
    assurance: ${l.assurance},
    description: ${JSON.stringify(l.description)},
    avantages: ${JSON.stringify(l.avantages)},
    conditions: {
      age_min: ${l.conditions.age_min},
      age_max: ${l.conditions.age_max},
      anciennete_min: ${l.conditions.anciennete_min},
      revenus_min: ${l.conditions.revenus_min},
      types_contrat: ["cdi", "fonctionnaire"],
      garantie_requise: ${l.conditions.garantie_requise},
      types_garantie_acceptes: ${JSON.stringify(l.conditions.types_garantie_acceptes)},
      domiciliation_obligatoire: true,
      apport_personnel: ${l.conditions.apport_personnel}
    }
  }`;
}).join(',\n\n');

// Update mockData.js
const mockDataPath = path.join(__dirname, 'src/services/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

// Add missing banks (BOA Togo, NSIA Banque Togo)
if (!content.includes('BOA Togo')) {
  content = content.replace(
    /\{ id: 204, nom: "Coris Bank Togo", pays: "TG"[^}]+\},/,
    \`$&
  { id: 205, nom: "BOA Togo", pays: "TG", logo: autreBanqueLogo, description: "Bank of Africa Togo" },
  { id: 206, nom: "NSIA Banque Togo", pays: "TG", logo: nsiaLogo, description: "NSIA Banque Togo" },\`
  );
}

// Update BANQUE_QUOTITE_MAP for 205 and 206
if (!content.includes('205: "standard"')) {
  content = content.replace(
    /99: "standard"\s*\/\/\s*Autre/,
    \`99: "standard", // Autre
  201: "standard",
  202: "standard",
  203: "standard",
  204: "standard",
  205: "standard",
  206: "standard"\`
  );
}

// Append new loans to TYPES_PRETS
if (!content.includes('PRETS TOGO (Générés)')) {
  content = content.replace(
    /];\s*\/\/\s*Labels pour affichage/m,
    \`,\n\n  // ═══════════════════════════════════════════════════════════════\n  // PRETS TOGO (Générés)\n\${loansJsCode}\n];\n\n// Labels pour affichage\`
  );
}

fs.writeFileSync(mockDataPath, content);
console.log('Successfully updated mockData.js with Togo loans!');
