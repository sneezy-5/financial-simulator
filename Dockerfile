# Image unique pour ONDA (frontend Vite + API Express) — remplace le
# déploiement PM2 direct sur l'hôte. server.js sert le frontend construit
# depuis ../dist (voir server.js: path.join(__dirname, '../dist')) : les deux
# doivent donc rester dans la même image, à la même position relative.

# ── Étape 1 : build du frontend Vite ─────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app

# python3/make/g++ : @vscode/sqlite3 (dépendance du projet racine — utilisée
# par le build Electron/exe, pas par ce build web, mais `npm ci` installe
# quand même tout l'arbre) n'a pas de binaire précompilé pour cette
# combinaison d'image et se rabat sur une compilation node-gyp, qui échoue
# sans ces outils sur une image "slim" minimale.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# --legacy-peer-deps : vite-plugin-pwa@0.20.x plafonne son peer vite à ^5,
# alors que le projet est sur vite@^7 (déclaré ainsi dans package.json — pas
# une erreur d'ici). `npm ci` est strict sur les peer deps par défaut depuis
# npm 7+ et refuse sinon de résoudre ; en local le node_modules déjà installé
# masquait le conflit. Idéalement, il faudrait faire monter vite-plugin-pwa
# vers une version qui supporte vite 7 pour se passer de ce flag.
RUN npm ci --legacy-peer-deps
COPY index.html vite.config.mjs ./
COPY src ./src
COPY public ./public
# Variables VITE_* (voir .env, racine) : Vite les lit à la compilation et les
# bake dans le bundle statique — sans ce COPY, le build tournait avec des
# valeurs vides/par défaut (VITE_APP_MODE, VITE_PAYSTACK_PUBLIC_KEY...), pas
# celles réellement configurées.
COPY .env ./
RUN npm run build

# ── Étape 2 : image d'exécution (API + frontend statique) ──────────────────
FROM node:20-bookworm-slim AS runtime

# Chromium système : templateEngine.js (server/templateEngine.js) cherche déjà
# /usr/bin/chromium en priorité (findChromeExecutable) avant de retomber sur
# le Chromium embarqué par Puppeteer. L'installer ici évite un téléchargement
# au premier démarrage et allège l'image (PUPPETEER_SKIP_DOWNLOAD ci-dessous).
# python3/make/g++ : même besoin qu'au stage frontend-build, pour compiler
# @vscode/sqlite3 (server/package.json) faute de binaire précompilé disponible.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Code serveur, puis frontend déjà construit à la racine de l'image (../dist
# vu depuis /app/server, comme en local).
COPY server ./
COPY --from=frontend-build /app/dist /app/dist

EXPOSE 3002
CMD ["node", "server.js"]
