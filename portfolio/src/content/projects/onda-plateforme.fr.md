---
lang: fr
key: onda-plateforme
title: ONDA — la plateforme
summary: >-
  L’écosystème qui réunit paie, crédit, fiscalité et rentabilité au même
  endroit, avec son infrastructure de production.
role: Vision produit, architecture, DevOps, contenu
stack: [Astro, nginx, Docker Swarm, Paystack, Node.js]
year: '2023 — aujourd’hui'
url: https://eonda.online/
order: 3
featured: false
---

## La vision

ONDA n’est pas un outil mais une **famille d’outils** : chaque produit résout un
problème financier précis, et tous parlent la même donnée et le même droit local.
La plateforme est le point d’entrée qui les relie.

## Ce que ça recouvre

- **Le portail** — une page qui présente les outils déjà en ligne et pointe
  directement vers chacun (Espace RH, simulateurs).
- **L’infrastructure** — un backend Node.js partagé, une base PostgreSQL,
  l’authentification, le paiement en ligne (Paystack), les e-mails
  transactionnels.
- **Le déploiement** — migration de PM2 vers **Docker Swarm**, nginx qui sert le
  statique et fait le reverse-proxy de l’API et des WebSockets, TLS automatisé,
  un script de déploiement idempotent.
- **Le référencement** — métadonnées, Open Graph, données structurées, plan de
  site ; le contenu éditorial (articles) alimente la visibilité dans la durée.

## Rôle

Définition de la vision et de l’architecture, mise en place et exploitation de
l’infrastructure, rédaction du contenu.

## Résultat

Plusieurs produits en production sous un même nom, une même infra et une même
exigence de conformité — prêts à accueillir les suivants (comptabilité, analyse
financière).
