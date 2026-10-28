# Roadmap d'implémentation — ONDA Paie & RH

> **Cap produit :** passer d'un « outil de calcul de paie » à un **logiciel de paie de confiance** pour PME et cabinets en Côte d'Ivoire, puis zone UEMOA.
> **Cap perso :** chaque phase doit aussi servir de preuve pour le positionnement *tech financier / consultant en automatisation* (voir `ROADMAP_EDITORIAL.md`).

Tailles : **S** ≈ ½ journée · **M** ≈ 2-3 jours · **L** ≈ 1-2 semaines.

---

## Phase 0 — Sécurité (à faire avant tout nouveau client)

Un incident de fuite de données sur un outil de paie détruit la crédibilité. Ces points passent avant les fonctionnalités.

| # | Tâche | Pourquoi | Taille |
|---|---|---|---|
| 0.1 | Sortir `server/database.sqlite` de git (`git rm --cached`) — déjà dans `.gitignore` mais encore suivi | Base de prod/dev versionnée = données salariés dans l'historique | S |
| 0.2 | Sortir `uploads/` (25 fichiers PDF/xlsx) de git + l'ajouter au `.gitignore` | Probables bulletins / fichiers clients | S |
| 0.3 | Si 0.1/0.2 contiennent de vraies données : purger l'historique (`git filter-repo`) + rotation des secrets | Retirer de git ne supprime pas l'historique | M |
| 0.4 | `JWT_SECRET` obligatoire : le serveur refuse de démarrer sans (`server/server.js:88`) | Valeur par défaut connue = jetons admin falsifiables | S |
| 0.5 | Vérifier `VITE_ENTERPRISE_URL` au build de prod (fallback `localhost:5174` dans `AppHome.vue`, `HRPayroll.vue`) | Lien simulateur → outil pro cassé sinon | S |
| 0.6 | 2FA (OTP email) pour les comptes admin | Standard attendu par un DAF | M |

---

## Phase 1 — Fiabilité du moteur de paie ✅ (codée le 22/10/2026)

Objectif : qu'un RH puisse recalculer n'importe quel bulletin à la main et tomber juste.

| # | Tâche | Ce qui a été fait | Statut |
|---|---|---|---|
| 1.1 | **Bulletins de référence testés** | 12 cas vérifiés à la main dans `tests/paie/casReference.cjs` + `npm run test:paie` (référence, serveur = moteur, paramètres, congés) | ✅ |
| 1.2 | **Un seul moteur CI** | Source unique `server/moteur/paieCI.mjs`, lue par le simulateur ; copie CommonJS générée pour le serveur (`npm run moteur:sync`, le test échoue si elle est périmée). Ancien `ci.js` supprimé. Résultats serveur identiques à avant sur les 12 cas | ✅ |
| 1.3 | **Barèmes versionnés par date d'effet** | `BAREMES_CI` dans le moteur : une version par date d'effet, choisie selon le mois du bulletin. Changer un taux = ajouter une version. *Reste : écran d'administration si besoin* | ✅ (données dans le code) |
| 1.4 | **Zone transport sur la fiche salarié** | Champ « Zone de travail » (fiche + simulateur) → plafond 30 000 / 24 000 / 20 000. **Montants Bouaké et intérieur à confirmer sur le texte officiel** | ✅ à valider |
| 1.5 | **Aligner le calcul Net → Brut** | Réécrit par dichotomie sur le vrai moteur, et enfin branché : bouton « Je connais le net → calculer le brut » (il n'était appelé nulle part) | ✅ |
| 1.6 | **Bulletins passés transport > 30 000** | `node server/scripts/auditTransport.js [--detail]` (lecture seule) liste les bulletins « à vérifier ». Les contrats étant dans le navigateur des clients, c'est un repérage, pas une preuve. **À lancer sur la base de prod** | ✅ à exécuter |
| 1.7 | **Modèles Word/HTML clients** | Avertissement affiché après génération si un modèle client n'affiche pas l'excédent et qu'un salarié du lot en a un | ✅ |
| + | **Base de jours par entreprise** | Paramètres → « Base de calcul des absences » : 26 ouvrables (défaut) ou 30 calendaires, appliquée partout | ✅ |

Bugs trouvés et corrigés pendant cette phase :
- **PDF ≠ écran** : le simulateur envoyait 30 jours au serveur qui divisait par 26 → bulletin téléchargé à 115 % du salaire. Défauts alignés + jours payés plafonnés à la base.
- **Congés sur un bulletin normal** : « Prendre la totalité » était sélectionné par défaut → tous les congés acquis depuis l'embauche comptés comme pris. Nouveau choix « Aucun congé ce mois » par défaut.
- **Ancienneté du simulateur** : 3 % à 2 ans au lieu de 2 % (réglé par le moteur unique).
- **Bulletin individuel (pro)** : la fiche salarié enregistrée et les congés pris n'étaient jamais fusionnés (réassignation d'une constante avalée par un `catch`).

---

## Phase 2 — Déclarations ✅ en grande partie (codée le 22/10/2026)

Lots 0-2 faits avant (rubriques patronales, snapshot `PayslipRecord`, CNPS mensuel/trimestriel).

| # | Tâche | Ce qui a été fait | Statut |
|---|---|---|---|
| 2.1 | **Lot 3 — ITS mensuel + FDFP** | Déclaration ITS (assiette, ITS retenu, CE/CN local/expatrié sur 80 % du brut) et FDFP (TA 0,4 % + TFC 0,6 %). Recoupe le jeu LOGIPAIE : ITS 226 195, CN 35 310, total DGI 261 505, FDFP 29 425 | ✅ |
| 2.2 | **Lot 4 — Annuel** | DISA (par salarié : brut, durée, assiettes PF/AT et retraite), livre de paie annuel (cumuls + coût employeur), récap masse salariale (mois en colonnes) | ✅ |
| 2.3 | **Lot 5** | Régularisation annuelle FDFP (TFC 1,2 % − 0,6 % versés − engagements) ✅ · **État 301 : reste à faire** | ½ |
| 2.4 | Calendrier des échéances + rappel email | **Reste à faire** — dates légales à confirmer avant de les afficher | ⏳ |

Tous les documents en PDF / Excel / CSV via un rendu commun (`server/declarations/declarationsRendu.js`) : une nouvelle déclaration = sa logique seule. Tests : `node tests/paie/declarations.test.cjs`. Nouveau champ entreprise : « Service d'assiette des impôts ».

Limites connues : le livre et le récap n'ont que les colonnes reconstituables depuis l'historique (salaire, HS, autres éléments imposables regroupés, non imposables, retenues, net, charges). Détailler primes / transport / congés demanderait d'enrichir l'instantané `PayslipRecord` (comme le lot 1).

---

## Phase 3 — Gouvernance de la paie

Ce qui fait passer d'un « outil » à un **logiciel** à qui un cabinet confie sa paie (concepts inspirés des outils de crédit bancaire : workflow, historisation, habilitations).

| # | Tâche | Ce qui a été fait (22/10/2026) | Statut |
|---|---|---|---|
| 3.1 | **Cycle de paie avec statuts** | Brouillon → Validée → **Clôturée** (`server/paie/cyclePaie.js`). Générer crée un brouillon ; régénérer une période validée la repasse en brouillon ; une période clôturée refuse régénération par lot ET bulletin individuel sur ce mois (409, vérifié avant le quota). Réouverture avec motif obligatoire. Module « Cycle de paie » | ✅ |
| 3.2 | **Journal d'audit** | Table `AuditLog` (`server/paie/audit.js`) : générations, validations, clôtures, réouvertures (motif), fiches salarié (création / modification avec avant → après / suppression), paramètres entreprise. Onglet « Journal d'audit » filtrable | ✅ |
| 3.3 | **Rôles fins** | Gestionnaire paie / Valideur (DRH) / Comptable (lecture + exports) / Salarié (son bulletin). **Prérequis : plusieurs utilisateurs par entreprise** (voir 3.4). `AuditLog.auteurId` est déjà séparé du compte | ⏳ décision d'architecture |
| 3.4 | **Multi-entreprises pour cabinets** | Un compte cabinet → N entreprises clientes, bascule rapide, facturation par dossier | ⏳ décision d'architecture |
| 3.5 | **Contrôles avant clôture** | Bloquants : période vide, net négatif, salarié en double. Alertes : net ±20 % vs M-1, sans n° CNPS, sous le SMIG sur un mois complet. Infos : entrées / sorties. Valider et clôturer exigent zéro bloquant | ✅ |

Tests : `node tests/paie/cycle.test.cjs` (statuts, contrôles, différences d'audit) + parcours complet vérifié sur serveur de test.

Changement de comportement : jusqu'ici une période était « validée » dès sa génération. Désormais elle naît **brouillon** ; les périodes déjà en base gardent leur statut « validée ».

---

## Phase 4 — Pont comptable ✅ (codée le 22/10/2026)

Le point de rencontre entre la formation compta et le produit : la meilleure preuve du positionnement *tech financier*.

| # | Tâche | Ce qui a été fait | Statut |
|---|---|---|---|
| 4.0 | **Détail de paie figé** | Nouvelle colonne `PayslipRecord.detailPaie` (JSON) : gains et retenues par rubrique, congés acquis, mode de paiement / banque / RIB. Sa somme retombe exactement sur les gains et le net | ✅ |
| 4.1 | **Journal de paie SYSCOHADA** | Journal de paie + journal des OD (ITS, FDFP, CNPS, CMU), schéma LOGIPAIE feuille 28. Recoupe le jeu LOGIPAIE au franc près (661100 2 520 000 … 422000 3 270 927 ; CNPS 431000 470 075). Plan de comptes et codes journaux modifiables dans **Paramètres › Comptabilité** | ✅ |
| 4.2 | **Exports comptables** | PDF / Excel / CSV + CSV « Sage » (journal, date JJMMAA, compte, libellé, débit, crédit, pièce) pour l'assistant d'import | ✅ |
| 4.3 | **Ordre de virement des salaires** | Par banque, RIB, récap par banque, payés en espèces / chèque à part, alerte RIB manquant. Nouveaux champs fiche salarié : mode de paiement, banque, RIB | ✅ |
| 4.4 | **Provision congés payés** | Méthode simplifiée (LOGIPAIE 37) : jours acquis non pris × salaire de référence / 30 + charges sociales et fiscales, écriture 661300/428200, 664100/438200, 641300/448600 | ✅ |

Tests : `node tests/paie/compta.test.cjs` + parcours API vérifié sur serveur de test.

Limites : les bulletins générés avant la phase 4 n'ont pas de détail → comptes regroupés (document marqué partiel), pas de RIB ni de droits à congés ; **régénérer** les périodes ouvertes suffit. Le compte bancaire de l'entreprise sur l'ordre de virement est à compléter à la main. La provision donne le stock du mois : l'extourne du mois précédent reste à passer. Compte CMU patronale (664800) : convention à faire valider par l'expert-comptable.

---

## Phase 5 — Le simulateur comme aimant ✅ (codée le 23/10/2026)

Le simulateur sert à vulgariser et à attirer. **Décision : il reste 100 % libre** (pas de capture d'email / WhatsApp) ; la conversion passe par des ponts vers le Pro, dont l'inscription est gratuite.

| # | Tâche | Ce qui a été fait | Statut |
|---|---|---|---|
| 5.1 | ~~Capture de contacts~~ | Abandonné : le PDF reste libre | ✖ |
| 5.2 | **Explication ligne par ligne** | Panneau « Votre bulletin expliqué » : chaque ligne → « Pourquoi ? » avec les chiffres saisis (ITS tranche par tranche, réduction familiale, plafond transport, CNPS plafonnée, CMU, coût employeur) et la règle. Généré depuis le barème du moteur. Erreur corrigée : la CMU était annoncée à 1 000 F par personne au lieu de 500 F | ✅ |
| 5.3 | **Simulateur côté employeur** | Module gratuit « Coût Employeur » : coût réel d'un poste (× effectif, annuel), effet d'une augmentation (net gagné vs coût), salaire possible pour un budget. Lien direct `/?module=hr&type=cout_employeur` | ✅ |
| 5.4 | **Pages thématiques** | `npm run guides` génère `public/guides/` : prime de transport, calcul de l'ITS, coût d'un salarié + index. Chiffres calculés par le moteur, liens vers le simulateur prérempli. `SITE_URL=… npm run guides` ajoute sitemap.xml, robots.txt et URL canoniques | ✅ |
| 5.5 | **Mesure de l'entonnoir** | Événements anonymes (simulation, PDF, net→brut, explication, partage, simulateur employeur, guide lu, clic Pro) ; carte « Entonnoir simulateur → Pro » dans le tableau de bord admin | ✅ |
| 5.6 | **Pont vers l'outil Pro** | Encart « Vous gérez plusieurs salariés ? » sous le bulletin et dans le simulateur employeur, lien `?source=…` suivi | ✅ |

Corrigé au passage : `GET /api/stats` était public et exposait les 50 dernières visites (IP, navigateur) — réservé aux admins.

Reste : fixer le domaine public du simulateur (`SITE_URL`) puis relancer `npm run guides` ; publier un guide par post LinkedIn ; enregistrer `?source=` à l'inscription Pro pour attribuer les comptes au simulateur.

---

## Phase 6 — Dette technique ✅ en grande partie (23/10/2026)

Méthode : rien ne change de comportement, et c'est prouvé — empreinte des bulletins et liste des routes enregistrées avant / après, vérificateur de portée (TypeScript) sur chaque fichier déplacé, parcours complets sur serveur de test.

| Tâche | Ce qui a été fait | Statut |
|---|---|---|
| **Modèles de bulletin** | `payrollService.js` 4 043 → 944 lignes : un fichier par modèle dans `server/bulletins/` (+ `outils.js`), moteurs Bénin / Togo dans `server/moteur/`. Les 15 modèles produisent une définition PDF identique à l'octet près | ✅ |
| **Routeurs** | `server.js` 3 868 → 2 015 lignes : `server/routes/` auth, admin, paieGouvernance, rhDonnees, documents, ia. Mêmes 99 routes, ordre conservé par préfixe | ✅ |
| **Routes en double** | 9 routes déclarées deux fois (formules, licences, plans) : les copies mortes, jamais atteintes, retirées | ✅ |
| **Nettoyage de la racine** | 27 scripts ponctuels supprimés (dont `patch_payroll.js`, qui réécrivait payrollService.js), `HelloWorld.vue`, doublons `.js` ; `dev-dist/` et le classeur LOGIPAIE ne sont plus suivis par git (gardés en local) | ✅ |
| **Outils** | `scripts/apercu-bulletins.cjs` (remplace les 9 `__test_*`, + empreinte), `scripts/lister-routes.cjs` | ✅ |
| **README** | Réécrit : produit, commandes, architecture, règles | ✅ |
| **Composants Vue géants** | `HRPayroll.vue` (5 100 lignes) et `PayslipSimulator.vue` (4 000) : à découper avec un test dans le navigateur à chaque étape (catalogue des modules, onglets du simulateur) | ⏳ |

Bug trouvé par l'empreinte : le modèle de bulletin « personnalisé » plantait à chaque génération depuis le 26/08/2026 (`opts is not defined`) — corrigé.

---

## Ordre recommandé

```
Semaine 1      Phase 0 (sécurité)  +  déployer la phase 1, lancer l'audit transport en prod
Semaines 2-3   2.1 lot 3 (ITS + FDFP)
Mois 2         3.1 clôture + 3.2 audit + 3.5 contrôles   ←  argument de vente n°1
Mois 2-3       4.1 / 4.2 journal et exports comptables   ←  en parallèle de la formation compta
Mois 3         2.2 DISA (avant la campagne annuelle)  +  5.1 / 5.5 capture et mesure
Ensuite        3.3 rôles, 3.4 multi-entreprises, reste de la phase 5
```

Chaque livraison = un post LinkedIn de la série *« Je construis un outil pour ça »*.
