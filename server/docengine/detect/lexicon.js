// ═══════════════════════════════════════════════════════
// LEXIQUE MÉTIER — Afrique de l'Ouest / OHADA
//
// La détection de variables n'a pas besoin d'IA pour l'essentiel : dans un
// document RH, un libellé connu désigne toujours la même donnée, et la valeur
// se trouve à sa droite ou en dessous. Cette relation est géométrique, donc
// déterministe.
//
// C'est ici qu'on ajoute un pays, une convention collective ou un intitulé
// maison — sans toucher à une ligne du moteur.
// ═══════════════════════════════════════════════════════

/**
 * Un libellé se lit sans accents, sans casse et sans ponctuation, pour absorber
 * les variantes d'écriture (« Salaire de base », « SALAIRE DE BASE : », « Salaire
 * de Base »).
 */
function normalizeLabel(s) {
    return (s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9%]+/g, ' ')
        .trim();
}

/**
 * kind détermine le format attendu de la valeur, et sert de garde-fou :
 * un libellé « Salaire de base » suivi d'une date est une association douteuse.
 */
const KIND = { TEXT: 'text', AMOUNT: 'amount', DATE: 'date', RATE: 'rate', CODE: 'code' };

/**
 * Chaque entrée : les libellés qui la désignent, la variable produite et le type
 * attendu. `scope` limite l'entrée à une famille de documents.
 */
const ENTRIES = [
    // ── Identité du salarié ──
    { variable: 'nom',            kind: KIND.TEXT,   labels: ['nom', 'nom du salarie', 'nom et prenoms', 'nom prenoms', 'salarie', 'employe'] },
    { variable: 'prenom',         kind: KIND.TEXT,   labels: ['prenom', 'prenoms'] },
    { variable: 'matricule',      kind: KIND.CODE,   labels: ['matricule', 'n matricule', 'numero matricule', 'mle'] },
    { variable: 'poste',          kind: KIND.TEXT,   labels: ['poste', 'emploi', 'fonction', 'poste occupe'] },
    // Distincte du poste : un bulletin ivoirien porte les deux (« Emploi :
    // Développeur » et « Qualification : Ingénieur »). Les confondre faisait
    // écraser l'un par l'autre.
    { variable: 'qualification',  kind: KIND.TEXT,   labels: ['qualification', 'niveau', 'classification professionnelle'] },
    { variable: 'categorie',      kind: KIND.CODE,   labels: ['categorie', 'cat', 'classification', 'echelon'] },
    { variable: 'date_embauche',  kind: KIND.DATE,   labels: ['date embauche', 'date d embauche', 'date entree', 'date d entree', 'anciennete depuis', 'embauche le'] },
    { variable: 'num_cnps',       kind: KIND.CODE,   labels: ['n cnps', 'numero cnps', 'cnps salarie', 'n cnss', 'numero cnss', 'n securite sociale'] },

    // ── Employeur ──
    { variable: 'nom_entreprise', kind: KIND.TEXT,   labels: ['employeur', 'raison sociale', 'entreprise', 'societe', 'denomination'] },
    { variable: 'adresse',        kind: KIND.TEXT,   labels: ['adresse', 'siege social', 'siege'] },

    // ── Période ──
    { variable: 'periode',        kind: KIND.TEXT,   labels: ['periode', 'periode de paie', 'mois', 'mois de'] },
    { variable: 'date_jour',      kind: KIND.DATE,   labels: ['date', 'fait le', 'etabli le', 'date d edition', 'le'] },

    // ── Éléments de rémunération ──
    { variable: 'salaire_base',        kind: KIND.AMOUNT, labels: ['salaire de base', 'salaire base', 'salaire de base mensuel', 'salaire categoriel'] },
    { variable: 'sursalaire',          kind: KIND.AMOUNT, labels: ['sursalaire', 'sur salaire', 'complement de salaire'] },
    { variable: 'prime_anciennete',    kind: KIND.AMOUNT, labels: ['prime d anciennete', 'prime anciennete', 'anciennete'] },
    { variable: 'prime_transport',     kind: KIND.AMOUNT, labels: ['prime de transport', 'indemnite de transport', 'transport'] },
    { variable: 'indemnite_logement',  kind: KIND.AMOUNT, labels: ['indemnite de logement', 'prime de logement', 'logement'] },
    { variable: 'prime_fonction',      kind: KIND.AMOUNT, labels: ['prime de fonction', 'indemnite de fonction', 'prime de responsabilite'] },
    { variable: 'heures_sup',          kind: KIND.AMOUNT, labels: ['heures supplementaires', 'heures sup', 'h sup', 'majoration heures'] },
    { variable: 'prime_rendement',     kind: KIND.AMOUNT, labels: ['prime de rendement', 'prime de performance', 'bonus'] },
    { variable: 'brut',                kind: KIND.AMOUNT, labels: ['salaire brut', 'total brut', 'brut', 'brut mensuel', 'remuneration brute', 'total salaire brut', 'total des gains', 'total gains'] },
    { variable: 'net_imposable',       kind: KIND.AMOUNT, labels: ['net imposable', 'base imposable', 'salaire imposable'] },

    // ── Retenues salariales ──
    { variable: 'salarial.its',   kind: KIND.AMOUNT, labels: ['its', 'impot sur salaire', 'impot sur traitements et salaires', 'irpp'] },
    { variable: 'salarial.cn',    kind: KIND.AMOUNT, labels: ['cn', 'contribution nationale', 'contribution nat'] },
    { variable: 'salarial.cnps',  kind: KIND.AMOUNT, labels: ['cnps', 'cnps salarie', 'retraite salarie', 'cnss', 'cotisation retraite', 'cnss part salariale', 'cnps part salariale'] },
    { variable: 'salarial.total', kind: KIND.AMOUNT, labels: ['total retenues', 'total des retenues', 'retenues salariales', 'total salarial', 'total des retenues legales'] },

    // ── Charges patronales ──
    { variable: 'patronal.cnps',                  kind: KIND.AMOUNT, labels: ['cnps employeur', 'cnps patronal', 'retraite employeur', 'cnss employeur'] },
    { variable: 'patronal.prestations_familiales', kind: KIND.AMOUNT, labels: ['prestations familiales', 'pf', 'allocations familiales'] },
    { variable: 'patronal.accident_travail',      kind: KIND.AMOUNT, labels: ['accident du travail', 'accidents de travail', 'at', 'risque professionnel'] },
    { variable: 'patronal.total',                 kind: KIND.AMOUNT, labels: ['total patronal', 'charges patronales', 'total charges employeur'] },

    // ── Résultat ──
    { variable: 'netAPayer',      kind: KIND.AMOUNT, labels: ['net a payer', 'net paye', 'net a percevoir', 'salaire net', 'net'] },

    // Rubriques telles qu'elles apparaissent sur les bulletins ivoiriens.
    // Le côté (salarial ou patronal) n'est pas dans l'intitulé mais dans la
    // colonne : « CNPS - RETRAITE » porte une retenue salariale ET une
    // charge patronale sur la même ligne.
    { variable: 'salaire_base',   kind: KIND.AMOUNT, labels: ['salaire categoriel', 'salaire de categorie'] },
    { variable: 'brut_imposable', kind: KIND.AMOUNT, labels: ['brut imposable', 'total brut imposable'] },
    { variable: 'salarial.cnps',  kind: KIND.AMOUNT, labels: ['cnps retraite', 'cnss retraite'] },
    { variable: 'patronal.prestations_familiales', kind: KIND.AMOUNT, labels: ['cnps prestations familiales'] },
    { variable: 'patronal.accident_travail',       kind: KIND.AMOUNT, labels: ['cnps accident du travail', 'accident du travail'] },
    { variable: 'patronal.maternite',              kind: KIND.AMOUNT, labels: ['cnps assurance maternite', 'assurance maternite'] },
    { variable: 'salarial.cmu',   kind: KIND.AMOUNT, labels: ['cmu', 'cmu assurance maladie', 'assurance maladie'] },
    { variable: 'salarial.its',   kind: KIND.AMOUNT, labels: ['its impot unique', 'impot unique'] },
    { variable: 'salarial.ricf',  kind: KIND.AMOUNT, labels: ['dont r i c f', 'ricf', 'r i c f'] },
    { variable: 'patronal.impot', kind: KIND.AMOUNT, labels: ['t a s p impot employeur', 't a s p', 'impot employeur'] },
    { variable: 'patronal.fdfp_ta',  kind: KIND.AMOUNT, labels: ['fdfp taxe apprentissage', 'taxe apprentissage'] },
    { variable: 'patronal.fdfp_fpc', kind: KIND.AMOUNT, labels: ['fdfp formation continue', 'formation continue'] },
    { variable: 'jours_travailles',  kind: KIND.AMOUNT, labels: ['nombre de jours', 'jours travailles'] },
    { variable: 'parts_igr',      kind: KIND.AMOUNT, labels: ['parts igr', 'nombre de parts'] },

    // ── Documents rédigés ──
    { variable: 'signataireNom',   kind: KIND.TEXT, labels: ['le soussigne', 'je soussigne', 'signataire', 'represente par'], scope: 'prose' },
    { variable: 'signatairePoste', kind: KIND.TEXT, labels: ['en qualite de', 'agissant en qualite de'], scope: 'prose' },
    { variable: 'lieu',            kind: KIND.TEXT, labels: ['fait a', 'lieu'], scope: 'prose' }
];

const { ENTRIES_CI } = require('./catalogCI');

/**
 * Le référentiel ivoirien est chargé APRÈS les entrées historiques : à libellé
 * égal, il prime. C'est lui qui fait foi pour la Côte d'Ivoire, les entrées
 * génériques ne servant plus que de repli pour ce qu'il ne couvre pas encore.
 */
const ALL_ENTRIES = [...ENTRIES, ...ENTRIES_CI];

/** Index libellé normalisé → entrée, construit une fois. */
const BY_LABEL = new Map();
for (const entry of ALL_ENTRIES) {
    for (const label of entry.labels) {
        const key = normalizeLabel(label);
        // Le libellé le plus spécifique gagne : « cnps employeur » ne doit pas
        // être écrasé par « cnps ».
        BY_LABEL.set(key, { ...entry, matchedLabel: label });
    }
}

/**
 * Cherche l'entrée correspondant à un texte de libellé.
 *
 * On tente d'abord l'égalité exacte, puis le préfixe : « Salaire de base (30 j) »
 * doit matcher « salaire de base », mais « base » seul ne doit pas remonter
 * « salaire de base ».
 */
/**
 * Retire la numérotation de rubrique en tête de libellé.
 *
 * Les bulletins réels numérotent presque toujours leurs lignes (« 1. Salaire de
 * base », « 2) Prime de Transport »). Sans ce nettoyage, aucune de ces rubriques
 * ne correspondait au lexique et tous les montants d'un bulletin passaient à
 * travers la détection.
 */
function stripOrdinal(key) {
    return key.replace(/^\d{1,3}\s+/, '').trim();
}

function lookup(text, nature = 'grid') {
    let key = normalizeLabel(text);
    if (!key) return null;
    // normalizeLabel a déjà transformé « 1. » en « 1 »
    const stripped = stripOrdinal(key);
    if (stripped && stripped !== key && !BY_LABEL.has(key)) key = stripped;

    let hit = BY_LABEL.get(key);
    if (!hit) {
        // Le libellé le plus long qui préfixe le texte
        let best = null;
        for (const [k, entry] of BY_LABEL) {
            if (k.length < 3) continue;
            if (key === k || key.startsWith(k + ' ')) {
                if (!best || k.length > best.key.length) best = { key: k, entry };
            }
        }
        hit = best?.entry;
    }
    if (!hit) return null;
    if (hit.scope && hit.scope !== nature) return null;
    return hit;
}

/**
 * Mots qui composent les titres et mentions imprimés en dur. Un texte entièrement
 * fait de ces mots est du décor, jamais une donnée du dossier — sans quoi
 * « BULLETIN DE PAIE », en capitales, passait pour un nom propre.
 */
const TITLE_WORDS = new Set([
    'bulletin', 'de', 'la', 'le', 'les', 'du', 'des', 'et', 'a', 'au', 'aux', 'en', 'pour',
    'paie', 'salaire', 'contrat', 'travail', 'attestation', 'certificat', 'lettre',
    'solde', 'tout', 'compte', 'recu', 'facture', 'note', 'fiche', 'presence',
    'duree', 'indeterminee', 'determinee', 'cdi', 'cdd', 'avenant', 'demande',
    'employeur', 'salarie', 'entreprise', 'societe', 'original', 'copie', 'duplicata',
    'rubrique', 'montant', 'base', 'taux', 'nombre', 'gains', 'retenues', 'total'
]);

/** Le texte n'est-il fait que de mots de titre ? */
function isTitleOnly(text) {
    const key = normalizeLabel(text);
    if (!key) return false;
    const words = key.split(' ').filter(Boolean);
    return words.length > 0 && words.every(w => TITLE_WORDS.has(w));
}

/**
 * Préfixe des variables PROVISOIRES, nommées d'après leur propre libellé.
 *
 * Le lexique ne peut pas connaître toutes les rubriques de tous les pays et de
 * toutes les conventions collectives. Plutôt que de laisser une valeur en texte
 * fixe parce qu'on ne sait pas la nommer — ce qui rendait le gabarit inutilisable
 * hors des libellés prévus — on crée un emplacement identifié par son intitulé.
 * Le document reste donc entièrement paramétrable, et l'interface peut proposer
 * à l'utilisateur d'y rattacher la donnée de son choix.
 */
const PROVISIONAL_PREFIX = 'champ_';

/** Un libellé de rubrique → un nom de variable stable et lisible. */
function slugify(label) {
    const key = stripOrdinal(normalizeLabel(label))
        // Le nom doit rester un identifiant : normalizeLabel conserve « % »,
        // qui n'a rien à faire dans une variable de gabarit.
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48);
    return key ? PROVISIONAL_PREFIX + key : null;
}

function isProvisional(variable) {
    return typeof variable === 'string' && variable.startsWith(PROVISIONAL_PREFIX);
}

/**
 * Un texte peut-il servir d'intitulé de rubrique ?
 * Il doit contenir des lettres, rester court, et ne pas être un simple décor.
 */
function looksLikeRubric(text) {
    const t = (text || '').trim();
    if (t.length < 3 || t.length > 60) return false;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(t)) return false;
    if (isTitleOnly(t)) return false;
    return true;
}

/** Retire le préfixe de côté d'une variable : « salarial.cnps » → « cnps ». */
function stripSide(variable) {
    return String(variable || '').replace(/^(salarial|patronal)\./, '');
}

module.exports = {
    normalizeLabel, lookup, isTitleOnly, stripOrdinal, stripSide, ALL_ENTRIES,
    slugify, isProvisional, looksLikeRubric,
    PROVISIONAL_PREFIX, ENTRIES, KIND, TITLE_WORDS
};
