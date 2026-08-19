# ONDA — Site Édition Entreprise

Site vitrine autonome présentant l'offre "Édition Entreprise" (licence unique installable), avec achat en libre-service par Paystack. Projet Vite/Vue **indépendant** du reste du dépôt : build et déploiement séparés, backend partagé avec l'app principale via API.

## Développement

```bash
cd enterprise-site
npm install
cp .env.example .env   # renseigner VITE_API_URL, VITE_PAYSTACK_PUBLIC_KEY (backend local ou prod)
npm run dev
```

## Build & déploiement

```bash
npm run build
```

Le dossier `dist/` généré est autonome : à héberger sur n'importe quel hébergement statique (domaine séparé du SaaS principal). Le backend (`server/`) doit rester accessible en HTTPS avec CORS ouvert (déjà le cas) pour que l'achat en ligne fonctionne.

## Variables d'environnement

- `VITE_API_URL` — URL absolue de l'API backend ONDA (ex: `https://api.eonda.online/api`). Le paiement poste sur `${VITE_API_URL}/enterprise/licenses/verify-paystack`.
- `VITE_PAYSTACK_PUBLIC_KEY` — clé PUBLIQUE Paystack (jamais la clé secrète), propre à ce site puisqu'il est déployé séparément de l'app principale.
- `VITE_MAIN_APP_URL` — URL de l'application principale ONDA (lien "Retour à l'accueil").
- `VITE_DOWNLOAD_URL` — URL du fichier installeur. Le bouton "Télécharger" pointe toujours vers cette valeur — à renseigner avant le déploiement en production.

## Fonctionnement de l'achat

Paiement en ligne (Paystack) → vérification serveur du montant (`server/licenseService.js`, `ENTERPRISE_LICENSE_PRICE`) → génération automatique de la clé de licence → email automatique + affichage direct de la clé à l'écran. Aucune intervention admin nécessaire. Le webhook Paystack existant (`server/server.js`, route `/api/billing/paystack/webhook`) sert aussi de confirmation serveur-à-serveur pour ces achats (branchement sur `metadata.type === 'license'`).

L'admin garde la main pour les cas manuels (paiement reçu hors Paystack, transfert de licence vers un nouveau poste, révocation) via l'onglet "Licences Entreprise" du panneau admin.
