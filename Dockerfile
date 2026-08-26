# Image unique pour ONDA (frontend Vite + API Express) — remplace le
# déploiement PM2 direct sur l'hôte. server.js sert le frontend construit
# depuis ../dist (voir server.js: path.join(__dirname, '../dist')) : les deux
# doivent donc rester dans la même image, à la même position relative.

# ── Étape 1 : build du frontend Vite ─────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.mjs ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Étape 2 : image d'exécution (API + frontend statique) ──────────────────
FROM node:20-bookworm-slim AS runtime

# Chromium système : templateEngine.js (server/templateEngine.js) cherche déjà
# /usr/bin/chromium en priorité (findChromeExecutable) avant de retomber sur
# le Chromium embarqué par Puppeteer. L'installer ici évite un téléchargement
# au premier démarrage et allège l'image (PUPPETEER_SKIP_DOWNLOAD ci-dessous).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Code serveur, puis frontend déjà construit à la racine de l'image (../dist
# vu depuis /app/server, comme en local).
COPY server ./
COPY --from=frontend-build /app/dist /app/dist

EXPOSE 3002
CMD ["node", "server.js"]
