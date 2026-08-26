# Image de l'API ONDA (Express) uniquement. Le frontend Vite est construit et
# déployé séparément, directement sur l'hôte (`npm run build` dans
# deploy/deploy.sh) — nginx sert dist/ en statique et ne proxy que /api/ et
# /socket.io/ vers ce conteneur (voir DEPLOY.md et deploy/nginx.example.conf).
# server.js gère aussi une absence de ../dist sans planter (fallback 404
# propre), donc rien à builder ici pour que ce conteneur démarre seul.

FROM node:20-bookworm-slim

# Chromium système : templateEngine.js (server/templateEngine.js) cherche déjà
# /usr/bin/chromium en priorité (findChromeExecutable) avant de retomber sur
# le Chromium embarqué par Puppeteer. L'installer ici évite un téléchargement
# au premier démarrage et allège l'image (PUPPETEER_SKIP_DOWNLOAD ci-dessous).
# python3/make/g++ : @vscode/sqlite3 (server/package.json) n'a pas de binaire
# précompilé pour cette combinaison d'image et se rabat sur une compilation
# node-gyp, qui échoue sans ces outils sur une image "slim" minimale.
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
COPY server ./

EXPOSE 3002
CMD ["node", "server.js"]
