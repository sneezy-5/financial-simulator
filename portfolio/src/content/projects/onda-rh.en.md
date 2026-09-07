---
lang: en
key: onda-rh
title: ONDA RH
summary: >-
  Payroll and HR management software compliant with the labour law of Côte
  d’Ivoire, Benin and Togo. Web, desktop app and offline mode.
role: Product design, full-stack development, design, deployment
stack: [Vue 3, Node.js, Express, PostgreSQL, Socket.IO, Electron, PWA]
year: '2024 — present'
url: https://rh.eonda.online/
order: 1
featured: true
---

## The problem

In West African SMEs and accounting firms, payroll still largely runs on
spreadsheets: brackets copied by hand, social contributions recomputed every
month, filings re-keyed. It is slow, hard to audit, and a single wrong bracket
propagates across a whole year.

## What I built

A platform that covers the whole chain, from the contract to the filing:

- **Payroll** — compliant payslips from gross to net, social contributions,
  income tax on salaries (ITS), expatriate handling.
- **People management** — directory, contracts, paid leave, scheduling,
  automatic alerts before fixed-term contracts expire.
- **Filings** — CNPS, ITS and FDFP forms and nominative lists, generated from
  pay periods, as PDF or Excel.
- **Documents** — HR letters and certificates pre-filled from employee data.
- **Analytics** — payroll mass, employer cost, absenteeism, as charts.
- **Multi-country** — a separate rules engine per country (Côte d’Ivoire, Benin,
  Togo), updated on every reform.

Available as a web app, an installable desktop app (Windows), and a PWA with an
offline mode.

## Role & stack

Built solo, from domain analysis to deployment. Front end in **Vue 3**
(Composition API), back end in **Node.js / Express** on **PostgreSQL**
(Sequelize), real time via **Socket.IO**, document generation (PDF, Word,
Excel), online payment, authentication. Desktop build packaged with **Electron**.
Deployed on **Docker Swarm** behind **nginx**, automated TLS.

## Outcome

A tool used to produce real payslips and filings, replacing the spreadsheet
where it used to be the norm — and staying correct because the business rule
lives in code, auditable, not copied by hand.
