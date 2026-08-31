// ═══════════════════════════════════════════════════════════════════════════
// DÉCLARATIONS — ORCHESTRATION
//
// Point d'entrée unique : à partir d'un type, d'un format, du profil entreprise
// et des périodes de paie (PayslipRecord[]), produit le fichier à télécharger.
// ═══════════════════════════════════════════════════════════════════════════

const service = require('./declarationsService');
const xlsx = require('./declarationsXlsx');
const pdf = require('./declarationsPdf');

const TYPES = {
    'cnps': { calc: service.bordereauCnps, pdf: pdf.bordereauCnpsPdf, slug: 'bordereau_cnps' },
    'cnps-liste': { calc: service.listeNominativeCnps, pdf: pdf.listeNominativeCnpsPdf, slug: 'liste_nominative_cnps' }
};

const MIME = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8'
};

/**
 * @param {object}   opts
 * @param {'cnps'|'cnps-liste'} opts.type
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
    if (!periodes || !periodes.length) throw new Error('Aucune période fournie.');

    const periode = service.agregerPeriodes(periodes);
    const data = def.calc({ entreprise: entreprise || {}, periode, lignes: records || [] });

    let buffer;
    if (format === 'pdf') {
        buffer = await def.pdf(data);
    } else if (format === 'xlsx') {
        buffer = type === 'cnps-liste' ? xlsx.listeNominativeCnpsXlsx(data) : xlsx.bordereauCnpsXlsx(data);
    } else {
        buffer = Buffer.from('﻿' + xlsx.csvDepuis(data, type), 'utf8'); // BOM pour Excel
    }

    const filename = `${def.slug}_${periode.code.replace(/[\/]/g, '-')}.${format}`;
    return { buffer, filename, mime: MIME[format], partielle: !!data.partielle, avertissements: data.avertissements || [] };
}

module.exports = { genererDeclaration, TYPES: Object.keys(TYPES) };
