---
lang: fr
key: onda-simulateurs
title: ONDA Simulateurs
summary: >-
  Une suite d’outils financiers gratuits et sans compte : crédit bancaire,
  bulletin de paie, fiscalité PME, rentabilité.
role: Conception, développement, moteurs de calcul
stack: [Vue 3, Vite, moteurs de règles, PWA]
year: '2023 — aujourd’hui'
url: https://simulateur.eonda.online/
order: 2
featured: true
---

## L’idée

Rendre concrets des calculs que la plupart des gens subissent sans les
comprendre : le coût réel d’un crédit, ce que cachent les lignes d’un bulletin,
l’impôt selon le régime fiscal, le seuil à partir duquel une activité est
rentable.

## Les outils

- **Simulateur de prêt bancaire** — mensualité, coût total, part des intérêts,
  taux nominal vs TEG, capacité d’emprunt et taux d’endettement, quotité
  cessible (règles UEMOA / BCEAO), tableau d’amortissement, scoring du profil
  emprunteur.
- **Simulateur de bulletin de paie** — décomposition brut → imposable → net,
  cotisations CNPS/CNSS, ITS, par pays.
- **Comparateur de fiscalité PME** — estimation de l’impôt entreprise et aide au
  choix de régime (synthétique / réel).
- **Outils de rentabilité** — prix de vente, marge brute et taux de marge, point
  mort.

Tout est gratuit, sans compte, utilisable depuis le navigateur.

## Rôle & stack

Conception des parcours et des **moteurs de calcul** (le cœur du travail : des
règles fiscales et bancaires traduites en code testable), interface en **Vue 3 /
Vite**, installable en PWA.

## Résultat

Des outils pédagogiques qui servent aussi de porte d’entrée vers l’écosystème
ONDA : on comprend d’abord, on outille ensuite.
