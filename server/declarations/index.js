// ═══════════════════════════════════════════════════════════════════════════
// DÉCLARATIONS — ORCHESTRATION
//
// Point d'entrée unique : à partir d'un type, d'un format, du profil entreprise
// et des périodes de paie (PayslipRecord[]), produit le fichier à télécharger.
// ═══════════════════════════════════════════════════════════════════════════

const service = require('./declarationsService');
const xlsx = require('./declarationsXlsx');
const pdf = require('./declarationsPdf');
const etats = require('./declarationsEtats');
const rendu = require('./declarationsRendu');
const compta = require('../compta/etatsComptables');

const TYPES = {
    'cnps': { calc: service.bordereauCnps, pdf: pdf.bordereauCnpsPdf, slug: 'bordereau_cnps' },
    'cnps-liste': { calc: service.listeNominativeCnps, pdf: pdf.listeNominativeCnpsPdf, slug: 'liste_nominative_cnps' },
    // Rendu générique (declarationsRendu) : mensuel…
    'its': { calc: etats.declarationIts, generique: true, slug: 'declaration_its' },
    'fdfp': { calc: etats.declarationFdfp, generique: true, slug: 'declaration_fdfp' },
    // … et annuel (toutes les périodes d'un exercice).
    'disa': { calc: etats.disa, generique: true, annuel: true, slug: 'disa' },
    'livre-annuel': { calc: etats.livrePaieAnnuel, generique: true, annuel: true, slug: 'livre_paie_annuel' },
    'recap-masse': { calc: etats.recapMasseSalariale, generique: true, annuel: true, slug: 'recap_masse_salariale' },
    'regul-fdfp': { calc: etats.regulFdfp, generique: true, annuel: true, slug: 'regul_annuelle_fdfp' },
    // Comptabilité (phase 4) : mensuels.
    'journal-paie': { calc: compta.journalPaie, generique: true, sage: compta.sageCsv, slug: 'journal_paie' },
    'provision-conges': { calc: compta.provisionConges, generique: true, sage: compta.sageCsv, slug: 'provision_conges' },
    'ordre-virement': { calc: compta.ordreVirement, generique: true, slug: 'ordre_virement' }
};

const MIME = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8',
    sage: 'text/csv; charset=utf-8'   // écritures pour l'assistant d'import Sage
};

/**
 * @param {object}   opts
 * @param {string} opts.type  cnps | cnps-liste | its | fdfp | disa | livre-annuel | recap-masse | regul-fdfp
 * @param {'pdf'|'xlsx'|'csv'}   opts.format
 * @param {object}   opts.entreprise
 * @param {{mois:number,annee:number}[]} opts.periodes
 * @param {object[]} opts.records  PayslipRecord[] de toutes les périodes
 * @returns {Promise<{buffer:Buffer, filename:string, mime:string, partielle:boolean, avertissements:string[]}>}
 */
async function genererDeclaration({ type, format, entreprise, periodes, records }) {
    const def = TYPES[type];
    if (!def) throw new Error(`Type de déclaration inconnu : ${type}`);
    if (!MIME[format]) throw new Error(`Format inconnu : ${format}`);
    if (format === 'sage' && !def.sage) throw new Error(`Le format Sage n'existe que pour les écritures comptables.`);
    if (!periodes || !periodes.length) throw new Error('Aucune période fournie.');

    if (def.annuel && new Set(periodes.map(p => p.annee)).size > 1) {
        throw new Error('Un état annuel porte sur un seul exercice.');
    }
    const periode = def.annuel ? etats.periodeAnnuelle(periodes[0].annee, periodes) : service.agregerPeriodes(periodes);
    const data = def.calc({ entreprise: entreprise || {}, periode, lignes: records || [] });

    let buffer;
    if (format === 'sage') {
        buffer = Buffer.from('\uFEFF' + def.sage(data), 'utf8');
    } else if (def.generique) {
        buffer = format === 'pdf' ? await rendu.documentPdf(data)
            : format === 'xlsx' ? rendu.documentXlsx(data)
            : Buffer.from('﻿' + rendu.documentCsv(data), 'utf8');
    } else if (format === 'pdf') {
        buffer = await def.pdf(data);
    } else if (format === 'xlsx') {
        buffer = type === 'cnps-liste' ? xlsx.listeNominativeCnpsXlsx(data) : xlsx.bordereauCnpsXlsx(data);
    } else {
        buffer = Buffer.from('﻿' + xlsx.csvDepuis(data, type), 'utf8'); // BOM pour Excel
    }

    const filename = format === 'sage'
        ? `${def.slug}_${periode.code.replace(/[\/]/g, '-')}_sage.csv`
        : `${def.slug}_${periode.code.replace(/[\/]/g, '-')}.${format}`;
    return { buffer, filename, mime: MIME[format], partielle: !!data.partielle, avertissements: data.avertissements || [] };
}

const TYPES_ANNUELS = Object.keys(TYPES).filter(t => TYPES[t].annuel);

module.exports = { genererDeclaration, TYPES: Object.keys(TYPES), TYPES_ANNUELS };
