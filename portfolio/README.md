# Portfolio

Site vitrine personnel — bilingue (FR / EN), statique, orienté référencement.
Projet **indépendant** du reste du dépôt (build et déploiement séparés), sur le
modèle de `enterprise-site/`.

Stack : [Astro 5](https://astro.build/), sans framework front, zéro JS hors
bascule de thème.

## Développement

```bash
cd portfolio
npm install
npm run dev          # http://localhost:4321
```

## Ce qu'il faut renseigner avant la mise en ligne

| Fichier | À remplir |
|---|---|
| `src/consts.ts` | `SITE.url` (domaine), `SITE.author` (nom), `LINKS` (LinkedIn, GitHub, e-mail, WhatsApp), chemins des CV |
| `src/data/about.ts` | biographie, compétences, timeline |
| `src/content/projects/*.md` | fiches projets (une par langue : `<slug>.fr.md`, `<slug>.en.md`) |
| `src/content/posts/*.md` | articles de blog |
| `src/assets/portrait.jpg` | **ta photo** (format portrait ~4:5). Un placeholder est généré par `node scripts/make-portrait.mjs "Ton Nom"` — remplace le fichier par ta vraie photo, même nom |
| `public/` | `favicon.svg`, `cv-fr.pdf`, `cv-en.pdf` |
| `og-default.png` | `node scripts/make-og.mjs "Ton Nom" "Ton titre"` régénère l'image de partage |

**Réseaux sociaux** : renseigne `LINKS.linkedin` dans `src/consts.ts` avec ton URL
complète (`https://www.linkedin.com/in/prenom-nom`). Tant qu'un lien vaut un
placeholder, il n'apparaît pas — une fois rempli, LinkedIn s'affiche en évidence
(bouton coloré) dans le hero, la page Parcours, le contact et le pied de page.

Le `sitemap-index.xml` et `robots.txt` sont générés à partir de `SITE.url` — rien
à éditer à la main une fois le domaine renseigné.

## Contenu

- **Projets** : `src/content/projects/`. Frontmatter clé : `lang`, `key` (slug
  logique partagé entre langues), `title`, `summary`, `role`, `stack[]`, `year`,
  `url`, `order`, `featured`, `draft`.
- **Articles** : `src/content/posts/`. Frontmatter : `lang`, `key`, `title`,
  `description`, `published`, `updated?`, `tags[]`, `draft`.
- Pour qu'un projet/article apparaisse dans les deux langues, créer les deux
  fichiers avec la **même `key`** — le lien `hreflang` se fait automatiquement.

## Build & déploiement

```bash
npm run build        # -> dist/
```

Site 100 % statique : `dist/` est servi tel quel par nginx.

- `nginx.example.conf` — bloc server à adapter (`server_name`, `root`).
- `deploy.sh` — `npm ci && npm run build` sur le serveur.

Après mise en ligne : Google Search Console (soumettre `sitemap-index.xml`),
test de l'aperçu social via le LinkedIn Post Inspector.

## Vérifications

```bash
npm run build && npm run preview
```

- parcourir les pages FR **et** `/en/...`, tester la bascule de langue et de thème
- `view-source` : `title`, `description`, `canonical`, `hreflang` (fr + en +
  x-default), `og:*`, JSON-LD présents
- Lighthouse mobile ≥ 95 (Perf / SEO / A11y / Best-practices)
