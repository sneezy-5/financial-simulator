// ═══════════════════════════════════════════════════════
// TYPES DE DOCUMENTS
//
// Le type choisi dans les paramètres décide de tout : quelles variables sont
// attendues, comment lire le document (grille ou texte rédigé), et ce qu'il
// faut réclamer à l'utilisateur quand son modèle est trop pauvre.
//
// `variablesAttendues` n'est pas une contrainte technique mais un CONTRÔLE DE
// COMPLÉTUDE : si un bulletin ne fait apparaître ni net à payer ni salaire de
// base, ce n'est pas la détection qui a échoué — c'est que le modèle fourni est
// vide ou n'est pas un bulletin. Mieux vaut le dire que produire un gabarit
// inutilisable.
// ═══════════════════════════════════════════════════════

const TYPES_DOCUMENTS = {
    bulletin_paie: {
        libelle: 'Bulletin de paie',
        nature: 'grid',
        description: 'Grille de rubriques : gains, retenues, totaux.',
        variablesAttendues: [
            'salarie_nom', 'salaire_base_mensuel', 'total_gains_bruts',
            'total_retenues_salariales', 'net_a_payer'
        ],
        minimumAttendu: 3,
        conseil: "Fournissez un bulletin RENSEIGNÉ, avec de vrais montants. Un modèle vierge ne permet pas de savoir où placer les variables."
    },

    solde_tout_compte: {
        libelle: 'Solde de tout compte',
        nature: 'grid',
        description: 'Décompte des sommes dues à la sortie.',
        variablesAttendues: [
            'salarie_nom', 'salarie_date_embauche', 'conges_payes',
            'indemnite_depart', 'net_a_payer'
        ],
        minimumAttendu: 2,
        conseil: "Le document doit faire apparaître les rubriques de rupture : congés non pris, préavis, indemnité de licenciement."
    },

    contrat_travail: {
        libelle: 'Contrat de travail',
        nature: 'prose',
        description: 'Texte rédigé : parties, poste, rémunération, durée.',
        variablesAttendues: [
            'nomComplet', 'poste', 'dateEntree', 'salaireAff', 'entreprise'
        ],
        minimumAttendu: 3,
        conseil: "Fournissez un contrat COMPLET, avec le nom du salarié, son poste, sa rémunération et les dates. Un contrat à trous ne se laisse pas analyser."
    },

    attestation_travail: {
        libelle: 'Attestation de travail',
        nature: 'prose',
        description: 'Atteste qu\'un salarié est employé, depuis quelle date et à quel poste.',
        variablesAttendues: ['nomComplet', 'poste', 'dateEntree', 'entreprise'],
        minimumAttendu: 2,
        conseil: "L'attestation doit nommer le salarié, son poste et sa date d'embauche."
    },

    certificat_travail: {
        libelle: 'Certificat de travail',
        nature: 'prose',
        description: 'Atteste d\'une période d\'emploi révolue, avec date de début et de fin.',
        variablesAttendues: ['nomComplet', 'poste', 'dateEntree', 'dateSortie'],
        minimumAttendu: 2,
        conseil: "Le certificat doit porter la période d'emploi complète : date de début ET date de fin."
    },

    autre: {
        libelle: 'Autre document RH',
        nature: 'auto',
        description: 'Type non listé : la nature est déduite du contenu.',
        variablesAttendues: [],
        minimumAttendu: 0,
        conseil: "Renseignez le document avec de vraies valeurs : c'est ce qui permet de repérer les emplacements à paramétrer."
    }
};

/** Liste destinée au sélecteur de l'interface. */
function listerTypes() {
    return Object.entries(TYPES_DOCUMENTS).map(([code, t]) => ({
        code,
        libelle: t.libelle,
        nature: t.nature,
        description: t.description
    }));
}

function typeDocument(code) {
    return TYPES_DOCUMENTS[code] || TYPES_DOCUMENTS.autre;
}

/**
 * Le modèle fourni est-il suffisamment renseigné pour ce type de document ?
 *
 * @returns {{ suffisant, trouvees, manquantes, conseil }}
 */
function controlerCompletude(code, variablesTrouvees) {
    const type = typeDocument(code);
    const trouvees = type.variablesAttendues.filter(v => variablesTrouvees.includes(v));
    const manquantes = type.variablesAttendues.filter(v => !variablesTrouvees.includes(v));

    return {
        suffisant: trouvees.length >= type.minimumAttendu,
        attendues: type.variablesAttendues,
        trouvees,
        manquantes,
        conseil: type.conseil
    };
}

module.exports = { TYPES_DOCUMENTS, listerTypes, typeDocument, controlerCompletude };
