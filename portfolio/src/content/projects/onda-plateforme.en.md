---
lang: en
key: onda-plateforme
title: ONDA — the platform
summary: >-
  The ecosystem bringing payroll, credit, taxation and profitability together in
  one place, with its production infrastructure.
role: Product vision, architecture, DevOps, content
stack: [Astro, nginx, Docker Swarm, Paystack, Node.js]
year: '2023 — present'
url: https://eonda.online/
order: 3
featured: false
---

## The vision

ONDA is not a tool but a **family of tools**: each product solves one specific
financial problem, and they all speak the same data and the same local law. The
platform is the entry point that ties them together.

## What it covers

- **The portal** — a page presenting the tools already online and pointing
  straight to each one (HR workspace, simulators).
- **The infrastructure** — a shared Node.js backend, a PostgreSQL database,
  authentication, online payment (Paystack), transactional email.
- **Deployment** — migration from PM2 to **Docker Swarm**, nginx serving static
  files and reverse-proxying the API and WebSockets, automated TLS, an
  idempotent deploy script.
- **SEO** — metadata, Open Graph, structured data, sitemap; editorial content
  feeds visibility over time.

## Role

Defining the vision and architecture, setting up and operating the
infrastructure, writing the content.

## Outcome

Several products in production under one name, one infrastructure and one
compliance bar — ready to host the next ones (accounting, financial analysis).
