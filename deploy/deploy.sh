#!/usr/bin/env bash
# Déploiement ET mise à jour d'onda-server sur Docker Swarm — même script pour
# les deux : `docker stack deploy` est idempotent, la seule différence entre
# un premier déploiement et une mise à jour est que le service existe déjà.
#
# Usage (sur le serveur de prod, depuis n'importe où dans le dépôt) :
#   deploy/deploy.sh
#   ONDA_ENV_FILE=/chemin/vers/autre.env deploy/deploy.sh   # fichier d'env différent
#
# Par défaut, lit server/.env — le même fichier que PM2 charge déjà via
# dotenv. Rien à dupliquer : les secrets déjà en place (SMTP, Paystack...)
# sont repris tels quels ; il suffit d'y ajouter POSTGRES_PASSWORD et
# JWT_SECRET s'ils n'y sont pas encore.
#
# Ce que fait ce script, dans l'ordre :
#   1. Vérifie que docker et le fichier de secrets sont là.
#   2. Construit le frontend (npm run build, sur l'hôte — nginx sert dist/
#      directement, voir deploy/nginx.example.conf).
#   3. Construit l'image du backend, taguée avec le commit git (traçable,
#      jamais réutilisée par erreur) ET :latest.
#   4. Déploie/met à jour le stack avec cette image précise.
#   5. Force la recréation des tâches (filet de sécurité) et affiche l'état +
#      les derniers logs pour vérifier que ça a démarré correctement.

set -euo pipefail

STACK_NAME="ondarh"
SERVICE_NAME="ondarh-server"
IMAGE_NAME="ondarh-server"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STACK_FILE="$SCRIPT_DIR/stack.yml"
ENV_FILE="${ONDA_ENV_FILE:-$REPO_ROOT/server/.env}"

# ── 1. Pré-requis ────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker introuvable dans le PATH." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Fichier d'environnement introuvable : $ENV_FILE" >&2
  echo "   Créez-le à partir de server/.env.example, ou pointez ONDA_ENV_FILE dessus." >&2
  exit 1
fi

# Ne JAMAIS faire `source "$ENV_FILE"` : bash l'exécuterait comme du vrai
# script shell, et la moindre apostrophe non appariée dans une valeur (un nom
# d'expéditeur SMTP en français, par ex.) casse tout avec "unexpected EOF
# while looking for matching `'". Lecture ligne à ligne à la place : on ne
# coupe qu'au premier '=', le reste de la ligne (apostrophes, $, guillemets...)
# est pris tel quel, jamais réinterprété par bash.
while IFS= read -r ligne || [ -n "$ligne" ]; do
  ligne="${ligne%$'\r'}"                # au cas où le fichier a des fins de ligne Windows
  case "$ligne" in
    ''|'#'*) continue ;;                # ligne vide ou commentaire
  esac
  ligne="${ligne#export }"              # tolère un éventuel préfixe "export "
  cle="${ligne%%=*}"
  valeur="${ligne#*=}"
  [ -z "$cle" ] && continue
  # Guillemets ou apostrophes entourant toute la valeur : dotenv les retire,
  # on fait pareil pour rester cohérent avec ce que Node charge lui-même.
  if [[ "$valeur" == \"*\" && "$valeur" == *\" ]]; then
    valeur="${valeur%\"}"; valeur="${valeur#\"}"
  elif [[ "$valeur" == \'*\' && "$valeur" == *\' ]]; then
    valeur="${valeur%\'}"; valeur="${valeur#\'}"
  fi
  export "$cle=$valeur"
done < "$ENV_FILE"

manquantes=()
for var in POSTGRES_PASSWORD JWT_SECRET; do
  if [ -z "${!var:-}" ]; then
    manquantes+=("$var")
  fi
done
if [ "${#manquantes[@]}" -gt 0 ]; then
  echo "❌ Variable(s) requise(s) manquante(s) dans $ENV_FILE : ${manquantes[*]}" >&2
  exit 1
fi

# ── 2. Build frontend (sur l'hôte, nginx sert dist/ directement) ───────────
echo "→ Construction du frontend (npm run build)"
( cd "$REPO_ROOT" && npm ci --legacy-peer-deps && npm run build )

# ── 3. Build backend ─────────────────────────────────────────────────────
TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
echo "→ Construction de ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" -t "${IMAGE_NAME}:latest" "$REPO_ROOT"

# ── 4. Déploiement ────────────────────────────────────────────────────────
export ONDA_IMAGE="${IMAGE_NAME}:${TAG}"
echo "→ Déploiement du stack '${STACK_NAME}' avec l'image ${ONDA_IMAGE}"
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

# Filet de sécurité : force la recréation même si Swarm pensait déjà avoir
# cette image (ne devrait pas arriver, le tag est unique à chaque build, mais
# ne coûte rien de le garantir).
docker service update --force --quiet "${STACK_NAME}_${SERVICE_NAME}" >/dev/null 2>&1 || true

# ── 5. Vérification ───────────────────────────────────────────────────────
echo "→ Attente du démarrage (10s)..."
sleep 10
echo ""
echo "── État du service ──"
docker service ps "${STACK_NAME}_${SERVICE_NAME}" --no-trunc | head -5
echo ""
echo "── Derniers logs ──"
docker service logs --tail 30 "${STACK_NAME}_${SERVICE_NAME}" 2>&1 || true
echo ""
echo "✅ Déployé : ${ONDA_IMAGE}"
echo "   Vérifiez manuellement : curl -s http://localhost:3002/api/health"
