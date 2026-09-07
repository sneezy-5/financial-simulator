---
lang: fr
key: onda-rh
title: ONDA RH
summary: >-
  Logiciel de paie et de gestion RH conforme au droit du travail de la Côte
  d’Ivoire, du Bénin et du Togo. Web, application de bureau et mode hors-ligne.
role: Conception produit, développement full-stack, design, déploiement
stack: [Vue 3, Node.js, Express, PostgreSQL, Socket.IO, Electron, PWA]
year: '2024 — aujourd’hui'
url: https://rh.eonda.online/
order: 1
featured: true
---

## Le problème

Dans les PME et les cabinets de gestion d’Afrique de l’Ouest, la paie se fait
encore largement sur tableur : barèmes recopiés à la main, cotisations CNPS/CNSS
recalculées chaque mois, déclarations ressaisies. C’est lent, difficile à
vérifier, et une erreur de barème se propage sur toute une année.

## Ce que j’ai construit

Une plateforme qui couvre toute la chaîne, du contrat à la déclaration :

- **Paie** — bulletins conformes du brut au net, cotisations sociales, impôt sur
  les traitements et salaires (ITS), traitement des expatriés.
- **Gestion du personnel** — annuaire, contrats, congés payés, planning, alertes
  automatiques avant l’échéance des CDD.
- **Déclarations** — bordereaux et listes nominatives CNPS, ITS et FDFP, générés
  depuis les périodes de paie, en PDF ou Excel.
- **Documents** — attestations, certificats et courriers RH pré-remplis depuis
  les données salariés.
- **Pilotage** — masse salariale, coût employeur, absentéisme, en graphiques.
- **Multi-pays** — un moteur de règles distinct par pays (Côte d’Ivoire, Bénin,
  Togo), mis à jour à chaque réforme.

Disponible en application web, en application de bureau installable (Windows) et
en PWA avec un mode hors-ligne.

## Rôle & stack

Projet mené seul, de l’analyse métier au déploiement. Front en **Vue 3**
(Composition API), back **Node.js / Express** sur **PostgreSQL** (Sequelize),
temps réel via **Socket.IO**, génération documentaire (PDF, Word, Excel),
paiement en ligne, authentification. Version bureau packagée avec **Electron**.
Déploiement en **Docker Swarm** derrière **nginx**, TLS automatisé.

## Résultat

Un outil utilisé pour produire des bulletins et des déclarations réels, qui
remplace le tableur là où il était la norme — et qui reste juste parce que la
règle métier est dans le code, vérifiable, pas recopiée à la main.
