#!/usr/bin/env bash
# Déploiement du portfolio — site statique servi par nginx.
# À lancer sur le serveur de prod, depuis le dossier portfolio/.
#
#   ./deploy.sh
#
# Prérequis : Node.js installé nativement (comme pour le build frontend d'ONDA),
# un bloc server nginx pointant sur portfolio/dist/ (voir nginx.example.conf).
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Dépendances"
npm ci

echo "→ Build"
npm run build

echo "✓ dist/ prêt : $(pwd)/dist"
echo "  nginx sert ce dossier — rien d'autre à faire, recharge éventuelle : sudo nginx -s reload"
