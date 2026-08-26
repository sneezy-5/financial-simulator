// ═══════════════════════════════════════════════════════
// LECTURE DU CLASSEUR D'IMPORT
//
// Le client remplit rarement le modèle à la lettre : il renomme une colonne,
// met une majuscule, ajoute un accent. On normalise donc les intitulés avant de
// les reconnaître, plutôt que d'exiger une correspondance exacte.
//
// Ce qui n'est PAS toléré en revanche : deviner une valeur absente. Une colonne
// manquante laisse le champ vide, elle ne le fabrique pas.
// ═══════════════════════════════════════════════════════

/** « Salaire de Base (FCFA) » → « salaire_de_base_fcfa » */
function normaliser(intitule) {
    return String(intitule || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * Synonymes acceptés pour chaque champ. Le premier terme est le nom du modèle ;
 * les suivants sont les formes rencontrées dans les classeurs des clients.
 */
const SYNONYMES = {
    // Entreprise
    raison_sociale: ['raison_sociale', 'nom_entreprise', 'entreprise', 'societe', 'employeur'],
    adresse: ['adresse', 'siege', 'siege_social', 'adresse_entreprise'],
    telephone: ['telephone', 'tel', 'contact', 'portable', 'mobile', 'numero_telephone'],
    email: ['email', 'mail', 'courriel'],
    numero_cnps_employeur: ['numero_cnps_employeur', 'cnps_employeur', 'numero_employeur'],
    numero_contribuable: ['numero_contribuable', 'contribuable', 'nif', 'numero_fiscal'],
    signataire_nom: ['signataire_nom', 'signataire', 'nom_signataire', 'representant'],
    signataire_fonction: ['signataire_fonction', 'fonction_signataire', 'qualite_signataire'],
    ville: ['ville', 'lieu'],

    // Employé
    matricule: ['matricule', 'id_employe', 'identifiant', 'numero_salarie', 'code'],
    nom: ['nom', 'nom_salarie', 'nom_de_famille'],
    prenom: ['prenom', 'prenoms', 'prenom_s'],
    poste: ['poste', 'fonction', 'emploi'],
    categorie: ['categorie', 'classification', 'categorie_professionnelle'],
    date_embauche: ['date_embauche', 'date_entree', 'embauche', 'date_de_recrutement'],
    numero_cnps: ['numero_cnps', 'cnps', 'numero_cnps_salarie', 'matricule_cnps'],
    situation_matrimoniale: ['situation_matrimoniale', 'statut_matrimonial', 'situation_familiale', 'etat_civil'],
    nombre_enfants: ['nombre_enfants', 'nb_enfants', 'enfants', 'enfants_a_charge'],
    expatrie: ['expatrie', 'statut_salarie', 'expatriation', 'statut_expatrie'],
    salaire_net: ['salaire_net', 'net', 'net_a_payer', 'salaire_net_mensuel'],

    // Contrat
    type: ['type', 'type_contrat', 'nature_contrat'],
    date_debut: ['date_debut', 'debut', 'date_de_debut', 'prise_effet'],
    date_fin: ['date_fin', 'fin', 'date_de_fin', 'echeance'],
    salaire_base: ['salaire_base', 'salaire_de_base', 'base', 'salaire_categoriel'],
    sursalaire: ['sursalaire', 'sur_salaire']
};

/**
 * Mots de liaison sans valeur distinctive : « nom du salarié » et « nom_salarie »
 * désignent la même colonne. On les retire pour une seconde tentative, jamais
 * pour la première — sans quoi « nom de l'entreprise » se réduirait à « nom ».
 */
const LIAISONS = new Set(['du', 'de', 'des', 'd', 'la', 'le', 'les', 'l', 'a', 'au', 'aux', 'en', 'par', 'pour']);

function sansLiaisons(cle) {
    return String(cle).split('_').filter(m => m && !LIAISONS.has(m)).join('_');
}

/** Table intitulé normalisé → champ canonique, construite une fois. */
const PAR_INTITULE = new Map();
const PAR_INTITULE_ALLEGE = new Map();
for (const [champ, formes] of Object.entries(SYNONYMES)) {
    for (const forme of formes) {
        if (!PAR_INTITULE.has(forme)) PAR_INTITULE.set(forme, champ);
        const allege = sansLiaisons(forme);
        if (allege && !PAR_INTITULE_ALLEGE.has(allege)) PAR_INTITULE_ALLEGE.set(allege, champ);
    }
}

/** Champ canonique d'un intitulé : correspondance exacte, puis allégée. */
function champPour(cle) {
    return PAR_INTITULE.get(cle) || PAR_INTITULE_ALLEGE.get(sansLiaisons(cle)) || cle;
}

/** Rapproche les colonnes d'une ligne brute des champs canoniques. */
function canoniser(ligne) {
    const sortie = {};
    for (const [intitule, valeur] of Object.entries(ligne || {})) {
        const cle = normaliser(intitule);
        const champ = champPour(cle);
        // La première colonne reconnue gagne : une feuille qui porte deux fois
        // « nom » ne doit pas voir la seconde écraser la première.
        if (sortie[champ] === undefined || sortie[champ] === '') sortie[champ] = valeur;
    }
    return sortie;
}

const texte = (v) => (v === undefined || v === null) ? '' : String(v).trim();

const nombre = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

/** Une date Excel peut arriver en numéro de série ; on rend toujours AAAA-MM-JJ. */
function date(v) {
    if (v === undefined || v === null || v === '') return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
        // Sérialisation Excel : jours depuis le 30/12/1899
        const ms = Math.round((v - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    const jjmmaaaa = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (jjmmaaaa) {
        const [, j, m, a] = jjmmaaaa;
        return a + '-' + m.padStart(2, '0') + '-' + j.padStart(2, '0');
    }
    return s;
}

/** « oui », « vrai », 1 → true ; « non », « faux », 0 → false ; vide → défaut. */
function booleen(v, defaut = true) {
    const s = normaliser(v);
    if (!s) return defaut;
    if (['oui', 'o', 'vrai', 'true', '1', 'yes', 'y'].includes(s)) return true;
    if (['non', 'n', 'faux', 'false', '0', 'no'].includes(s)) return false;
    return defaut;
}

/**
 * La colonne « expatrie » du modèle attend oui/non, mais un classeur qui
 * réutilise directement le vocabulaire interne (colonne « statut_salarie »,
 * valeurs « local »/« expatrie ») est tout aussi légitime — les deux sont
 * reconnus plutôt que de forcer une seule convention.
 */
function statutSalarieDepuis(v) {
    const s = normaliser(v);
    if (['expatrie', 'expat', 'oui', 'o', 'vrai', 'true', '1', 'yes', 'y'].includes(s)) return 'expatrie';
    return 'local';
}

/** Les primes sont réparties sur des colonnes numérotées : on les recompose. */
function extrairePrimes(ligne) {
    const primes = [];
    for (let i = 1; i <= 10; i++) {
        const libelle = texte(ligne['prime_' + i + '_libelle']);
        const montant = nombre(ligne['prime_' + i + '_montant']);
        if (!libelle && montant === null) continue;
        primes.push({
            libelle: libelle || ('Prime ' + i),
            montant: montant ?? 0,
            imposable: booleen(ligne['prime_' + i + '_imposable'], true)
        });
    }
    // Colonnes nommées directement, telles qu'on les trouve souvent
    for (const [cle, libelle] of [['prime_transport', 'Prime de transport'], ['prime_logement', 'Prime de logement']]) {
        const montant = nombre(ligne[cle]);
        if (montant !== null && !primes.some(p => normaliser(p.libelle) === normaliser(libelle))) {
            primes.push({ libelle, montant, imposable: cle !== 'prime_transport' });
        }
    }
    return primes;
}

function lireFeuille(XLSX, classeur, noms) {
    const cible = classeur.SheetNames.find(n => noms.includes(normaliser(n)));
    if (!cible) return null;
    return XLSX.utils.sheet_to_json(classeur.Sheets[cible], { defval: '' }).map(canoniser);
}

/**
 * Lit le classeur d'import.
 *
 * @returns {{entreprise, employes, contrats, feuillesLues, avertissements}}
 */
function lireClasseur(XLSX, classeur) {
    const avertissements = [];
    const feuillesLues = [];

    const brutEntreprise = lireFeuille(XLSX, classeur, ['entreprise', 'informations_entreprise', 'societe']);
    const brutEmployes = lireFeuille(XLSX, classeur, ['employes', 'employe', 'salaries', 'personnel']);
    const brutContrats = lireFeuille(XLSX, classeur, ['contrats', 'contrat']);

    let entreprise = null;
    if (brutEntreprise && brutEntreprise.length) {
        feuillesLues.push('ENTREPRISE');
        const e = brutEntreprise[0];
        entreprise = {
            raisonSociale: texte(e.raison_sociale),
            adresse: texte(e.adresse),
            telephone: texte(e.telephone),
            email: texte(e.email),
            numeroCnpsEmployeur: texte(e.numero_cnps_employeur),
            numeroContribuable: texte(e.numero_contribuable),
            signataireNom: texte(e.signataire_nom),
            signataireFonction: texte(e.signataire_fonction),
            ville: texte(e.ville)
        };
    }

    const employes = [];
    if (brutEmployes) {
        feuillesLues.push('EMPLOYES');
        for (const ligne of brutEmployes) {
            if (!texte(ligne.nom) && !texte(ligne.matricule)) continue;
            employes.push({
                matricule: texte(ligne.matricule),
                nom: texte(ligne.nom),
                prenom: texte(ligne.prenom),
                poste: texte(ligne.poste),
                categorie: texte(ligne.categorie),
                telephone: texte(ligne.telephone),
                date_embauche: date(ligne.date_embauche),
                numero_cnps: texte(ligne.numero_cnps),
                situation_matrimoniale: normaliser(ligne.situation_matrimoniale),
                nombre_enfants: nombre(ligne.nombre_enfants) ?? 0,
                statut_salarie: statutSalarieDepuis(ligne.expatrie),
                salaire_net: nombre(ligne.salaire_net)
            });
        }
    }

    const contrats = [];
    if (brutContrats) {
        feuillesLues.push('CONTRATS');
        for (const ligne of brutContrats) {
            const matricule = texte(ligne.matricule);
            if (!matricule) continue;
            contrats.push({
                matricule,
                type: (texte(ligne.type) || 'CDI').toUpperCase(),
                dateDebut: date(ligne.date_debut),
                dateFin: date(ligne.date_fin),
                poste: texte(ligne.poste),
                salaireDeBase: nombre(ligne.salaire_base) ?? 0,
                sursalaire: nombre(ligne.sursalaire) ?? 0,
                primes: extrairePrimes(ligne)
            });
        }
    }

    // Un contrat qui ne désigne aucun salarié connu ne peut pas être rattaché :
    // on le signale plutôt que de le ranger sous un matricule inventé.
    const matricules = new Set(employes.map(e => e.matricule).filter(Boolean));
    const orphelins = contrats.filter(c => matricules.size && !matricules.has(c.matricule));
    if (orphelins.length) {
        avertissements.push(
            orphelins.length + ' contrat(s) portent un matricule absent de la feuille EMPLOYES : ' +
            orphelins.slice(0, 5).map(c => c.matricule).join(', ')
        );
    }
    const sansContrat = employes.filter(e => e.matricule && !contrats.some(c => c.matricule === e.matricule));
    if (contrats.length && sansContrat.length) {
        avertissements.push(
            sansContrat.length + ' salarié(s) sans contrat : leur rémunération ne pourra pas être calculée.'
        );
    }

    return { entreprise, employes, contrats, feuillesLues, avertissements };
}

module.exports = { lireClasseur, normaliser, canoniser, date, nombre, booleen };
