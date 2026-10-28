// Modèle de bulletin « scaso » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Dixième modèle par défaut, réplique fidèle d'un bulletin réel (SCASO) :
 * bandeau « PÉRIODE DE PAIE » pleine largeur, bloc DIRECTION/VILLE/FONCTION/
 * DATE DE NAISSANCE/DATE D'ENTRÉE, colonne NBRE/TAUX fusionnée, et pied
 * « CACHET ET SIGNATURE » (grand encart vide) à côté du résumé GAINS/
 * RETENUES/NET À PAYER — sans doubles colonnes P.S/P.P, contrairement aux
 * modèles précédents.
 *
 * Contrairement aux autres modèles ONDA, celui-ci reste volontairement en
 * noir et blanc (traits fins, aucun bandeau coloré) : c'est la mise en page
 * réelle du bulletin d'origine, sobre, avec un simple filigrane du nom de
 * l'entreprise en fond de page — pas un choix de « pas assez de couleur »
 * comme sur les modèles précédents, juste fidèle à la source.
 */
function generatePdfDefinitionScaso(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${annee}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;
    const MOIS_NOMS = ['', 'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
    const dateEntree = (() => {
        if (!employee.date_embauche) return '';
        const d = new Date(employee.date_embauche);
        if (isNaN(d.getTime())) return formatDate(employee.date_embauche);
        return `${MOIS_NOMS[d.getMonth() + 1]} ${d.getFullYear()}`;
    })();

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.8, bold: true, width: opts.labelWidth || 95 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.8, width: '*' }], margin: [0, 1.5] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.8, bold: opts.bold || false, alignment: opts.align || 'left',
        margin: opts.margin || [2, 2, 2, 2]
    });
    const headerCell = (text) => cell(text, { bold: true, align: 'center', fontSize: 7 });

    const ligne = (code, label, base, nbreTaux, gain, retenue) => [
        cell(code || ''), cell(label),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(nbreTaux || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenue !== undefined && retenue !== null ? fcfa(retenue) : '', { align: 'right' })
    ];
    // Bandeau de sous-total sobre (gras + trait, pas de fond coloré) : fidèle
    // à l'original, qui insère « Total Brut » / « Total Retenues — Salaire
    // Net » comme de simples lignes en gras dans le même tableau.
    const bandRow = (labelGains, labelRetenues, gain, retenue) => [
        cell(''), cell(''), cell(''), cell(labelRetenues || '', { bold: true }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true }),
        cell(retenue !== undefined ? fcfa(retenue) : '', { align: 'right', bold: true })
    ];
    void bandRow;

    const body = [[headerCell('CODE'), headerCell('RUBRIQUE'), headerCell('BASE'), headerCell('NBRE/TAUX'), headerCell('GAINS'), headerCell('RETENUES')]];
    const jTravScaso = calc.joursTrav !== undefined ? calc.joursTrav : (employee.jours_travailles || 30);
    body.push(ligne(codes.salaireBase, 'Salaire de base', calc.salaireBaseMensuel, jTravScaso.toFixed(2), calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', employee.sursalaire, '100%', calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, "Prime d'ancienneté", null, `${calc.ansAnciennete},00`, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || "Prime d'incitation", null, null, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, null, null, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label}`, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité Transport non Imposable', null, `${jTravScaso.toFixed(2)}`, calc.primeTransport));
    if (calc.primeTransportImposable > 0) body.push(ligne(codes.primeTransportImposable, 'Indemnité Transport (excédent imposable)', null, null, calc.primeTransportImposable));
    if (calc.primeLogement > 0) body.push(ligne(codes.primeLogement, 'Prime de logement', null, null, calc.primeLogement));
    body.push([cell(''), cell('Total Brut', { bold: true }), cell(''), cell(''), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true }), cell('')]);

    body.push(ligne(codes.its, 'Impôt sur Traitements et Salaires (ITS)', calc.brutImposable, null, null, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'CNPS Régime général', calc.baseCNPS, '6,30', null, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', calc.totalPersonnesCMU * 1000, null, null, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont RICF (réduction charge de famille)', null, null, null, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', null, null, null, calc.salarial.acompte));
    body.push([cell(''), cell('Total Retenues — Salaire Net', { bold: true }), cell(''), cell(''), cell(fcfa(calc.netAPayer), { align: 'right', bold: true }), cell(fcfa(calc.salarial.total), { align: 'right', bold: true })]);

    return {
        pageSize: 'A4', pageMargins: [30, 28, 30, 28],
        // Filigrane discret du nom de l'entreprise, comme le logo circulaire en
        // fond de page du bulletin d'origine.
        background: (currentPage, pageSize) => ({
            text: company.nom, fontSize: 74, color: '#f1f5f9', bold: true,
            alignment: 'center', angle: 30,
            absolutePosition: { x: 0, y: pageSize.height / 2 - 60 }, width: pageSize.width
        }),
        content: [
            {
                columns: [
                    { width: '55%', ...box([
                        company.logo ? { image: company.logo, fit: [80, 36], margin: [0, 0, 0, 4] } : null,
                        { text: company.nom, fontSize: 11, bold: true },
                        { text: company.adresse, fontSize: 7 },
                        { text: company.ville, fontSize: 7 }
                    ].filter(Boolean)) },
                    { width: '2%', text: '' },
                    { width: '43%', ...box([{ text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 11.5, bold: true, alignment: 'center', margin: [0, 8] }]) }
                ]
            },
            {
                table: { widths: ['*'], body: [[{ text: `PÉRIODE DE PAIE DU ${periodeDebut} AU ${periodeFin}`, fontSize: 7.5, alignment: 'center', margin: [0, 4] }]] },
                layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
            },
            { text: '', margin: [0, 4] },
            {
                columns: [
                    { width: '55%', ...box([
                        kv('DIRECTION', employee.departement || ''),
                        kv('VILLE', company.ville),
                        kv('FONCTION', employee.poste || ''),
                        kv('DATE DE NAISS.', employee.date_naissance ? formatDate(employee.date_naissance) : ''),
                        kv('DATE ENTREE', dateEntree),
                        kv('CONGÉS (ACQ/PRIS/RESTE)', `${congesAcquis || 0}j / ${congesPris || 0}j / ${congesReste || 0}j`)
                    ]) },
                    { width: '2%', text: '' },
                    { width: '43%', ...box([
                        { text: 'NOM ET ADRESSE DU SALARIÉ', fontSize: 6.6, bold: true, alignment: 'center' },
                        { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 10, bold: true, alignment: 'center', margin: [0, 10, 0, 0] }
                    ], { margin: [6, 14] }) }
                ]
            },
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 1, widths: ['7%', '33%', '13%', '12%', '17%', '18%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
            },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    {
                        width: '58%',
                        table: { widths: ['*'], body: [[{ text: 'CACHET ET SIGNATURE', fontSize: 7, bold: true, alignment: 'center', margin: [0, 4] }], [{ text: '', margin: [0, 30] }]] },
                        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
                    },
                    { width: '2%', text: '' },
                    {
                        width: '40%',
                        table: {
                            widths: ['*', 'auto'],
                            body: [
                                [cell('GAINS', { bold: true }), cell(fcfa(calc.gainsTotaux) + 'F', { align: 'right', bold: true })],
                                [cell('RETENUES', { bold: true }), cell(fcfa(calc.salarial.total) + 'F', { align: 'right', bold: true })],
                                [cell('NET A PAYER', { bold: true, fontSize: 8 }), cell(fcfa(calc.netAPayer) + 'F', { align: 'right', bold: true, fontSize: 8 })]
                            ]
                        },
                        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER, paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 3 }
                    }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionScaso });
