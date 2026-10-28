// Modèle de bulletin « surMesure » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

// ─── Modèle « Sur-mesure » : éditeur visuel type Canva ─────────────────────
// Au lieu d'une mise en page figée dans le code (comme les 10 modèles
// ci-dessus), celui-ci lit un tableau de blocs positionnés librement
// (bulletinCanvasLayout, JSON sur le compte) et les imprime chacun à ses
// coordonnées exactes via `absolutePosition` de pdfmake. C'est le même
// système de coordonnées (points PDF, 1pt = 1/72") que l'éditeur affiche à
// l'écran : ce qui est glissé-déposé dans Paramètres est ce qui s'imprime,
// au point près — pas une conversion susceptible de diverger.
const CANVAS_PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, en points

// Catalogue des champs qu'un bloc texte peut afficher — sert à la fois de
// résolveur ici et de source pour le menu déroulant de l'éditeur (exporté
// plus bas), pour ne jamais avoir deux listes de champs à tenir à jour.
exports.CANVAS_CHAMPS_DISPONIBLES = [
    { cle: 'company.nom', libelle: "Nom de l'entreprise", groupe: 'Entreprise' },
    { cle: 'company.adresse', libelle: 'Adresse', groupe: 'Entreprise' },
    { cle: 'company.ville', libelle: 'Ville', groupe: 'Entreprise' },
    { cle: 'company.cnps', libelle: 'N° CNPS employeur', groupe: 'Entreprise' },
    { cle: 'company.contribuable', libelle: 'N° contribuable', groupe: 'Entreprise' },
    { cle: 'company.telephone', libelle: 'Téléphone', groupe: 'Entreprise' },
    { cle: 'company.email', libelle: 'E-mail', groupe: 'Entreprise' },
    { cle: 'titre.bulletin', libelle: 'Titre (« Bulletin de paie »)', groupe: 'Bulletin' },
    { cle: 'periode.texte', libelle: 'Période (« Août 2026 »)', groupe: 'Bulletin' },
    { cle: 'employee.nomComplet', libelle: 'Nom complet du salarié', groupe: 'Salarié' },
    { cle: 'employee.matricule', libelle: 'Matricule', groupe: 'Salarié' },
    { cle: 'employee.poste', libelle: 'Emploi', groupe: 'Salarié' },
    { cle: 'employee.categorie', libelle: 'Catégorie', groupe: 'Salarié' },
    { cle: 'employee.cnps', libelle: 'N° CNPS salarié', groupe: 'Salarié' },
    { cle: 'employee.dateEmbauche', libelle: "Date d'embauche", groupe: 'Salarié' },
    { cle: 'employee.anciennete', libelle: 'Ancienneté', groupe: 'Salarié' },
    { cle: 'employee.parts', libelle: 'Nombre de parts IGR', groupe: 'Salarié' },
    { cle: 'totaux.brut', libelle: 'Total brut', groupe: 'Totaux' },
    { cle: 'totaux.retenues', libelle: 'Total retenues salariales', groupe: 'Totaux' },
    { cle: 'totaux.chargesPatronales', libelle: 'Total charges patronales', groupe: 'Totaux' },
    { cle: 'totaux.netAPayer', libelle: 'Net à payer', groupe: 'Totaux' }
];

function resoudreChampCanvas(champ, ctx) {
    const { employee, calc, company, periode } = ctx;
    switch (champ) {
        case 'company.nom': return company.nom;
        case 'company.adresse': return company.adresse;
        case 'company.ville': return company.ville;
        case 'company.cnps': return company.cnps;
        case 'company.contribuable': return company.contribuable;
        case 'company.telephone': return company.telephone;
        case 'company.email': return company.email;
        case 'titre.bulletin': return employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE';
        case 'periode.texte': return periode;
        case 'employee.nomComplet': return `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`.trim();
        case 'employee.matricule': return employee.matricule || '';
        case 'employee.poste': return employee.poste || '';
        case 'employee.categorie': return employee.categorie || '';
        case 'employee.cnps': return employee.num_secu || employee.numero_cnps || '';
        case 'employee.dateEmbauche': return employee.date_embauche ? formatDate(employee.date_embauche) : '';
        case 'employee.anciennete': return calc.ancienneteTxt || '';
        case 'employee.parts': return calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0';
        case 'totaux.brut': return fcfa(calc.gainsTotaux) + ' F';
        case 'totaux.retenues': return fcfa(calc.salarial.total) + ' F';
        case 'totaux.chargesPatronales': return fcfa(ctx.totalPatronal) + ' F';
        case 'totaux.netAPayer': return fcfa(calc.netAPayer) + ' F';
        default: return '';
    }
}

// Disposition par défaut proposée à l'ouverture de l'éditeur (et utilisée
// telle quelle si le compte n'a encore rien personnalisé) — une mise en page
// simple et complète, pas un canevas vide, pour qu'il y ait toujours quelque
// chose à ajuster plutôt qu'à construire de zéro.
const CANVAS_LAYOUT_DEFAUT = [
    { id: 'logo', type: 'logo', x: 30, y: 30, w: 90, h: 48 },
    { id: 'nom-entreprise', type: 'text', x: 132, y: 30, w: 250, h: 16, champ: 'company.nom', fontSize: 12, bold: true, color: '#0f172a' },
    { id: 'adresse-entreprise', type: 'text', x: 132, y: 48, w: 250, h: 12, champ: 'company.adresse', fontSize: 7.5, color: '#475569' },
    { id: 'ville-entreprise', type: 'text', x: 132, y: 60, w: 250, h: 12, champ: 'company.ville', fontSize: 7.5, color: '#475569' },
    { id: 'titre', type: 'text', x: 395, y: 30, w: 170, h: 20, champ: 'titre.bulletin', fontSize: 13, bold: true, color: '#1e3a8a', align: 'right' },
    { id: 'periode', type: 'text', x: 395, y: 52, w: 170, h: 12, champ: 'periode.texte', fontSize: 8, color: '#475569', align: 'right' },
    { id: 'nom-salarie', type: 'text', x: 30, y: 100, w: 260, h: 14, champ: 'employee.nomComplet', fontSize: 10, bold: true },
    { id: 'poste-salarie', type: 'text', x: 30, y: 116, w: 260, h: 12, champ: 'employee.poste', fontSize: 7.5, color: '#475569' },
    { id: 'matricule-salarie', type: 'text', x: 300, y: 100, w: 130, h: 12, champ: 'employee.matricule', fontSize: 7.5, color: '#475569' },
    { id: 'cnps-salarie', type: 'text', x: 300, y: 116, w: 265, h: 12, champ: 'employee.cnps', fontSize: 7.5, color: '#475569' },
    { id: 'table', type: 'table', x: 30, y: 150, w: 535, h: 380, headerColor: '#1e3a8a', showPatronal: false, fontSize: 7.5 },
    { id: 'net-a-payer', type: 'netBox', x: 395, y: 545, w: 170, h: 50, backgroundColor: '#1e3a8a', textColor: '#ffffff', fontSize: 15 },
    { id: 'ligne-visa-employeur', type: 'line', x: 30, y: 660, w: 200, h: 1, color: '#000000' },
    { id: 'texte-visa-employeur', type: 'text', x: 30, y: 664, w: 200, h: 12, texte: "Cachet & signature de l'employeur", fontSize: 6.5, align: 'center', color: '#6b7280' },
    { id: 'ligne-visa-salarie', type: 'line', x: 365, y: 660, w: 200, h: 1, color: '#000000' },
    { id: 'texte-visa-salarie', type: 'text', x: 365, y: 664, w: 200, h: 12, texte: 'Signature du salarié', fontSize: 6.5, align: 'center', color: '#6b7280' }
];
exports.CANVAS_LAYOUT_DEFAUT = CANVAS_LAYOUT_DEFAUT;
exports.CANVAS_PAGE = CANVAS_PAGE;

function generatePdfDefinitionSurMesure(employee, calc, companyInfo = {}) {
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const ctx = { employee, calc, company, periode, totalPatronal };
    const layoutBrut = Array.isArray(companyInfo.bulletinCanvasLayout) && companyInfo.bulletinCanvasLayout.length
        ? companyInfo.bulletinCanvasLayout
        : CANVAS_LAYOUT_DEFAUT;

    // Le nombre de lignes du tableau des rubriques dépend du salarié réel
    // (heures sup, primes libres, RICF...), pas seulement du style — une
    // disposition conçue (à la main ou par l'IA) pour un salarié « simple »
    // sous-estime souvent la hauteur réelle du tableau pour un salarié avec
    // plus de rubriques, et les blocs placés dessous (encart Net à payer,
    // signature...) chevauchaient alors le bas du tableau. On calcule donc la
    // hauteur RÉELLE ici et on repousse vers le bas tout bloc positionné à ou
    // sous le bas déclaré du tableau, de la différence — jamais de chevauchement,
    // quel que soit ce que la disposition enregistrée avait prévu.
    const hauteurReelleTable = (bloc) => {
        const fsTable = bloc.fontSize || 7;
        const ROW_H = Math.max(13, fsTable * 2.3), HEADER_H = Math.max(17, fsTable * 2.6);
        let nbLignes = gains.length + 1 /* total brut */ + retenues.length + 1 /* total retenues */;
        if (bloc.showPatronal) nbLignes += patronal.length;
        return HEADER_H + nbLignes * ROW_H;
    };
    const blocTable = layoutBrut.find(b => b.type === 'table' && b.visible !== false);
    let layout = layoutBrut;
    if (blocTable) {
        const hauteurReelle = hauteurReelleTable(blocTable);
        const hauteurDeclaree = blocTable.h || 0;
        if (hauteurReelle > hauteurDeclaree) {
            const decalage = hauteurReelle - hauteurDeclaree;
            const seuil = blocTable.y + hauteurDeclaree;
            layout = layoutBrut.map(b => (b.id !== blocTable.id && b.type !== 'watermark' && (b.y || 0) >= seuil - 1)
                ? { ...b, y: b.y + decalage }
                : b);
        }
    }

    // Rendu du tableau des rubriques en lignes `columns` empilées, chacune sa
    // propre `absolutePosition`, PAS en un unique `table` multi-colonnes.
    //
    // Raison, vérifiée empiriquement (pas une supposition) : dans pdfmake, une
    // cellule `alignment: 'right'` à l'intérieur d'un `table` dont la largeur
    // déclarée est INFÉRIEURE à la largeur de page calcule sa position par
    // rapport à la largeur de page entière, pas par rapport à sa propre
    // colonne — les montants débordaient donc hors du bloc, jusqu'au bord de
    // la page, dès que le tableau ne faisait pas toute la largeur (exactement
    // le cas ici, où l'utilisateur choisit lui-même la largeur du bloc). Avec
    // `columns` (chaque colonne portant sa propre `width` déclarée), le même
    // alignement se calcule correctement — confirmé par un test isolé avant
    // d'écrire ce code, pas une intuition non vérifiée.
    const blocATableauPdf = (bloc) => {
        const showPatronal = !!bloc.showPatronal;
        const fs = bloc.fontSize || 7;
        const headerColor = bloc.headerColor || '#1e3a8a';
        const partsPct = showPatronal ? [6, 28, 11, 9, 12, 12, 9, 13] : [7, 38, 15, 10, 15, 15];
        const colWidths = partsPct.map(p => (p / 100) * bloc.w);
        const entetes = showPatronal
            ? ['N°', 'Désignation', 'Base', 'Taux', 'Gains', 'Retenues', 'Taux P.', 'Charges P.']
            : ['N°', 'Désignation', 'Base', 'Taux', 'Gains', 'Retenues'];
        const aligns = showPatronal
            ? ['left', 'left', 'right', 'center', 'right', 'right', 'center', 'right']
            : ['left', 'left', 'right', 'center', 'right', 'right'];

        const ligneColonnes = (valeurs, opts = {}) => valeurs.map((v, i) => ({
            width: colWidths[i], text: v === null || v === undefined ? '' : v.toString(),
            fontSize: opts.fontSize || fs, bold: !!opts.bold, alignment: aligns[i], color: opts.color || '#000000'
        }));

        // Hauteur de ligne proportionnelle à la taille de police choisie : un
        // intitulé long (ex. « Impôt sur les Traitements et Salaires (ITS) »)
        // dans une colonne Désignation étroite passe sur 2 lignes — à hauteur
        // fixe, la 2e ligne chevauchait le texte de la ligne suivante dès que
        // fontSize dépassait ~8. Avec de la marge (×2.3), une ligne repliée sur
        // 2 tient sans empiéter sur la ligne d'après.
        const ROW_H = Math.max(13, fs * 2.3), HEADER_H = Math.max(17, fs * 2.6);
        let y = bloc.y;
        const items = [];
        const fondDeRangee = (hauteur, couleur) => items.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: bloc.w, h: hauteur, color: couleur }], absolutePosition: { x: bloc.x, y } });
        const traitBas = (hauteur) => items.push({ canvas: [{ type: 'line', x1: 0, y1: hauteur, x2: bloc.w, y2: hauteur, lineWidth: 0.5, lineColor: '#cbd5e1' }], absolutePosition: { x: bloc.x, y } });
        const rangee = (valeurs, opts = {}) => items.push({ columns: ligneColonnes(valeurs, opts), absolutePosition: { x: bloc.x, y: y + 3 }, columnGap: 0 });

        fondDeRangee(HEADER_H, headerColor);
        rangee(entetes, { bold: true, color: 'white' });
        y += HEADER_H;

        const ligneMontant = (r, colGains, colRetenues) => {
            const valeurs = new Array(entetes.length).fill('');
            valeurs[0] = r.code || ''; valeurs[1] = r.label + (r.info ? ' (info.)' : '');
            valeurs[2] = r.base !== undefined && r.base !== null ? fcfa(r.base) : '';
            valeurs[3] = r.taux || '';
            if (colGains !== undefined) valeurs[4] = fcfa(r.montant);
            if (colRetenues !== undefined && !r.info) valeurs[5] = fcfa(r.montant);
            rangee(valeurs);
            traitBas(ROW_H);
            y += ROW_H;
        };
        gains.forEach(r => ligneMontant(r, true));

        fondDeRangee(ROW_H, '#e2e8f0');
        const totalBrut = new Array(entetes.length).fill('');
        totalBrut[1] = 'TOTAL BRUT'; totalBrut[4] = fcfa(calc.gainsTotaux);
        rangee(totalBrut, { bold: true });
        y += ROW_H;

        retenues.forEach(r => ligneMontant(r, undefined, true));

        if (showPatronal) {
            patronal.forEach(r => {
                const valeurs = ['', '', '', '', '', '', '', ''];
                valeurs[0] = r.code || ''; valeurs[1] = r.label; valeurs[6] = r.taux || ''; valeurs[7] = fcfa(r.montant);
                rangee(valeurs); traitBas(ROW_H); y += ROW_H;
            });
        }

        fondDeRangee(ROW_H, '#e2e8f0');
        const totalRet = new Array(entetes.length).fill('');
        totalRet[1] = 'TOTAL RETENUES'; totalRet[5] = fcfa(calc.salarial.total);
        if (showPatronal) totalRet[7] = fcfa(totalPatronal);
        rangee(totalRet, { bold: true });
        y += ROW_H;

        return items;
    };

    const content = layout.filter(b => b.visible !== false).flatMap(bloc => {
        switch (bloc.type) {
            case 'logo':
                return company.logo
                    ? { image: company.logo, fit: [bloc.w, bloc.h], absolutePosition: { x: bloc.x, y: bloc.y } }
                    : null;
            case 'text': {
                // Un `text` avec `alignment` sous `absolutePosition` s'aligne sur la
                // PAGE entière, pas sur son `width` local (comportement pdfmake) —
                // un titre aligné à droite débordait donc jusqu'au bord de la page
                // au lieu de rester dans son bloc. Le contenir dans une table à une
                // cellule d'une largeur déclarée force l'alignement à respecter le
                // bloc, pas la page.
                const texte = bloc.champ ? resoudreChampCanvas(bloc.champ, ctx) : (bloc.texte || '');
                return {
                    absolutePosition: { x: bloc.x, y: bloc.y },
                    table: { widths: [bloc.w], body: [[{ text: texte, fontSize: bloc.fontSize || 8, bold: !!bloc.bold, italics: !!bloc.italics, color: bloc.color || '#000000', alignment: bloc.align || 'left', border: [false, false, false, false], margin: [0, 0, 0, 0] }]] },
                    layout: 'noBorders'
                };
            }
            case 'table':
                return blocATableauPdf(bloc);
            case 'netBox':
                return {
                    absolutePosition: { x: bloc.x, y: bloc.y },
                    table: { widths: [bloc.w], body: [[{ text: 'NET À PAYER', fontSize: (bloc.fontSize || 15) * 0.5, bold: true, alignment: 'center', color: bloc.textColor || '#ffffff' }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: bloc.fontSize || 15, bold: true, alignment: 'center', color: bloc.textColor || '#ffffff' }]] },
                    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: bloc.backgroundColor || '#1e3a8a', paddingTop: () => 4, paddingBottom: () => 6 }
                };
            case 'line':
                return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: bloc.w, y2: 0, lineWidth: bloc.thickness || 0.75, lineColor: bloc.color || '#000000' }], absolutePosition: { x: bloc.x, y: bloc.y } };
            case 'rect':
                return { canvas: [{ type: 'rect', x: 0, y: 0, w: bloc.w, h: bloc.h, color: bloc.backgroundColor || '#f1f5f9', lineColor: bloc.borderColor || null }], absolutePosition: { x: bloc.x, y: bloc.y } };
            case 'watermark':
                // `angle` (rotation) n'a de sens que sur un texte, pas dans une
                // cellule de table — contrairement aux autres blocs, celui-ci reste
                // un `text` brut ; sa largeur par défaut (page entière) évite qu'un
                // centrage mal borné ne se voie.
                return { text: bloc.texte || company.nom, fontSize: bloc.fontSize || 74, color: bloc.color || '#f1f5f9', bold: true, alignment: 'center', angle: bloc.angle !== undefined ? bloc.angle : 30, absolutePosition: { x: 0, y: bloc.y }, width: CANVAS_PAGE.width };
            default:
                return null;
        }
    }).filter(Boolean);

    return {
        pageSize: 'A4', pageMargins: [0, 0, 0, 0],
        content,
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionSurMesure });
