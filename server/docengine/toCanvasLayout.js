// ═══════════════════════════════════════════════════════
// IR → bulletinCanvasLayout
//
// Convertit le résultat déterministe de buildTemplate() (voir index.js) en
// disposition « Sur-mesure » (le même format JSON que payrollService.js
// imprime via absolutePosition, et que l'éditeur conversationnel avec l'IA
// ajuste ensuite). Objectif : la POSITION des champs importants (identité
// salarié, entreprise, tableau des rubriques, net à payer) est reprise du
// vrai PDF, exacte — pas devinée par un modèle de vision. Ce que le lexique
// n'a pas reconnu reste absent plutôt qu'inventé ; l'utilisateur complète
// ensuite en le demandant à l'IA, pas en espérant qu'elle ait bien deviné.
//
// Champ volontairement restreint aux données qui ont un sens dans le schéma
// de blocs ONDA (voir CANVAS_CHAMPS_DISPONIBLES côté payrollService.js) :
// convertir CHAQUE fragment de texte détecté en bloc individuel produirait
// des dizaines de blocs minuscules, invérifiables et pénibles à ajuster
// ensuite en conversation. Seuls l'identité, le titre, la période, le
// tableau des rubriques et le net à payer sont repris ; le reste (mentions
// légales, cadres décoratifs...) se rajoute à la demande, dans le chat.
// ═══════════════════════════════════════════════════════

const KIND_AMOUNT = 'amount';

// docengine → CANVAS_CHAMPS_DISPONIBLES. Deux jeux de noms couvrent les
// variables : le référentiel CI (catalogCI.js, préfixé salarie_/employeur_,
// prioritaire) et le lexique générique (lexicon.js) qu'une cellule de
// tableau retombe parfois dessus quand aucun rôle de colonne CI ne
// correspond — les deux sont mappés pour ne rien perdre selon le chemin de
// détection réellement emprunté.
const CHAMP_PAR_VARIABLE = {
    salarie_matricule: 'employee.matricule', matricule: 'employee.matricule',
    salarie_emploi: 'employee.poste', poste: 'employee.poste',
    salarie_categorie: 'employee.categorie', categorie: 'employee.categorie',
    salarie_date_embauche: 'employee.dateEmbauche', date_embauche: 'employee.dateEmbauche',
    salarie_numero_cnps: 'employee.cnps', num_cnps: 'employee.cnps',
    nombre_parts_fiscales: 'employee.parts',
    employeur_nom: 'company.nom', employeur_raison_sociale: 'company.nom', nom_entreprise: 'company.nom',
    employeur_adresse: 'company.adresse', adresse: 'company.adresse',
    employeur_numero_cnps: 'company.cnps',
    employeur_numero_contribuable: 'company.contribuable',
    mois_paie: 'periode.texte', periode: 'periode.texte'
};
const VARIABLES_NOM = new Set(['salarie_nom', 'nom']);
const VARIABLES_PRENOM = new Set(['salarie_prenoms', 'prenom']);
const VARIABLES_NET_A_PAYER = new Set(['net_a_payer', 'netAPayer']);

/**
 * @param {object} buildResult  retour de docEngine.buildTemplate(buffer, {...}), avec ok:true
 * @param {object} page         dimensions de page en points {width, height} (CANVAS_PAGE)
 * @returns {{ layout: Array, stats: { reconnus: number, tableauDetecte: boolean, showPatronal: boolean } }}
 */
function irToCanvasLayout(buildResult, page) {
    const doc = buildResult.ir;
    const pageIr = doc && doc.pages && doc.pages[0];
    const variables = (doc && doc.variables) || [];
    const tablesIr = (pageIr && pageIr.tables) || [];
    let compteurId = 0;
    const nouvelId = (prefixe) => `${prefixe}-${Date.now()}-${compteurId++}`;

    const layout = [];

    // ── Tableau des rubriques : docengine détecte TOUTE grille (le tableau
    // de rubriques, mais aussi un petit encart identité en 2 colonnes, ou un
    // mini-tableau de cumuls) sous la même structure `tables[]`. Peu de leurs
    // cellules deviennent des « variables » nommées (un montant de ligne de
    // paie n'a pas de nom de champ fixe, contrairement à un matricule) — on
    // ne peut donc pas se fier aux variables détectées pour repérer LA bonne
    // grille. Le tableau des rubriques est en revanche systématiquement le
    // plus grand (le plus de cellules) : c'est ce critère qui tranche.
    const tableRubriques = tablesIr.length
        ? tablesIr.reduce((plusGrand, t) => ((t.cells?.length || 0) > (plusGrand.cells?.length || 0) ? t : plusGrand))
        : null;
    const indexTableRubriques = tableRubriques ? tablesIr.indexOf(tableRubriques) : -1;

    // 8 colonnes ou plus évoque un P.S/P.P scindé (comme generatePdfDefinitionGrilleNumerotee) ;
    // en dessous, une seule colonne Retenues suffit.
    const showPatronal = (tableRubriques?.colEdges?.length || 0) >= 8;

    const tableauDetecte = !!tableRubriques;
    const blocTable = {
        id: nouvelId('table'), type: 'table', visible: true,
        x: Math.max(0, tableRubriques ? tableRubriques.x - 6 : 30),
        y: Math.max(0, tableRubriques ? tableRubriques.y - 6 : 150),
        w: Math.min(page.width - 20, tableRubriques ? tableRubriques.w + 12 : 505),
        h: Math.min(page.height - 200, tableRubriques ? tableRubriques.h + 12 : 350),
        headerColor: '#1e3a8a', showPatronal, fontSize: 7
    };
    layout.push(blocTable);

    // ── Champs d'identité / entreprise / période : toute variable nommée
    // reconnue, SAUF celles qui appartiennent au tableau de rubriques choisi
    // ci-dessus (un encart identité dans une AUTRE grille du document, comme
    // matricule/date d'embauche, doit au contraire être repris ici).
    const dejaAjoute = new Set();
    let nomTrouve = false;
    variables.forEach(v => {
        if (!v.variable) return;
        if (typeof v.x !== 'number' || typeof v.y !== 'number') return;
        if (v.origin === 'table' && v.tableIndex === indexTableRubriques) return;
        if (VARIABLES_NET_A_PAYER.has(v.variable)) return; // traité à part, en encart

        let champ = null;
        if (VARIABLES_NOM.has(v.variable)) { champ = 'employee.nomComplet'; nomTrouve = true; }
        else if (VARIABLES_PRENOM.has(v.variable)) { if (nomTrouve || dejaAjoute.has('employee.nomComplet')) return; champ = 'employee.nomComplet'; }
        else champ = CHAMP_PAR_VARIABLE[v.variable] || null;
        if (!champ || dejaAjoute.has(champ)) return;
        dejaAjoute.add(champ);

        const bloc = pageIr?.blocks?.find(b => b.id === v.blockId);
        layout.push({
            id: nouvelId('text'), type: 'text', visible: true,
            x: v.x, y: v.y, w: Math.max(v.w || 120, 60), h: Math.max(v.h || 14, 10),
            champ, texte: '',
            fontSize: bloc?.fontSize ? Math.round(bloc.fontSize) : 8,
            bold: !!bloc?.bold, italics: !!bloc?.italic,
            color: bloc?.color || '#000000',
            align: bloc?.align === 'center' || bloc?.align === 'right' ? bloc.align : 'left'
        });
    });

    // ── Net à payer : encart mis en évidence plutôt qu'un texte plat, même
    // traitement visuel que les modèles ONDA codés en dur.
    const netVar = variables.find(v => VARIABLES_NET_A_PAYER.has(v.variable) && typeof v.x === 'number');
    layout.push({
        id: nouvelId('net'), type: 'netBox', visible: true,
        x: netVar ? netVar.x : Math.max(30, page.width - 200),
        y: netVar ? netVar.y : blocTable.y + blocTable.h + 15,
        w: Math.max(netVar?.w || 170, 140), h: Math.max(netVar?.h || 40, 40),
        backgroundColor: '#1e3a8a', textColor: '#ffffff', fontSize: 14
    });

    // ── Titre du bulletin, si un intitulé « Bulletin de paie » a été repéré
    // dans les blocs de texte fixes (pas dans les variables : c'est un
    // libellé, pas une donnée).
    const blocTitre = pageIr?.blocks?.find(b => /bulletin\s*(de|d')?\s*paie/i.test(b.text || ''));
    if (blocTitre) {
        layout.push({
            id: nouvelId('titre'), type: 'text', visible: true,
            x: blocTitre.x, y: blocTitre.y, w: Math.max(blocTitre.w, 150), h: Math.max(blocTitre.h, 16),
            champ: 'titre.bulletin', texte: '',
            fontSize: blocTitre.fontSize ? Math.round(blocTitre.fontSize) : 13,
            bold: true, italics: false, color: blocTitre.color || '#000000',
            align: blocTitre.align === 'center' || blocTitre.align === 'right' ? blocTitre.align : 'left'
        });
    }

    // ── Logo : reprend l'EMPLACEMENT de la première image du PDF d'origine ;
    // le bloc affiche toujours le logo du compte (Paramètres > Profil
    // entreprise), jamais l'image du fichier importé.
    const image = pageIr?.images && pageIr.images[0];
    if (image) {
        layout.push({ id: nouvelId('logo'), type: 'logo', visible: true, x: image.x, y: image.y, w: Math.max(image.w, 40), h: Math.max(image.h, 24) });
    }

    return { layout, stats: { reconnus: dejaAjoute.size, tableauDetecte, showPatronal } };
}

module.exports = { irToCanvasLayout };
