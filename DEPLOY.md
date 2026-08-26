# Déploiement en production — Docker Swarm

Migration depuis PM2 vers un service Swarm, dans le même stack que Postgres.
Fichiers concernés : [Dockerfile](Dockerfile), [.dockerignore](.dockerignore),
[deploy/stack.yml](deploy/stack.yml) (config réelle, prête à l'emploi),
[deploy/stack.example.yml](deploy/stack.example.yml) (modèle de référence),
[deploy/deploy.sh](deploy/deploy.sh) (script de déploiement/mise à jour),
[server/.env.example](server/.env.example).

Toutes les commandes ci-dessous s'exécutent **sur le serveur de prod**, en SSH.

## 0. Vérifier l'état actuel

```bash
docker node ls                    # combien de nœuds dans le swarm ? (1 = pas besoin de registre, voir étape 2)
docker stack ls                   # le stack qui contient Postgres
docker stack services <stack>     # nom exact du service Postgres
docker network ls --filter driver=overlay   # nom du réseau overlay à réutiliser
```

Notez le **nom du service Postgres** (ex: `paie_postgres`) et le **nom du réseau**
(ex: `paie_default`) — vous en aurez besoin à l'étape 4.

## 1. Récupérer le code

```bash
git clone <votre-repo> onda-app   # ou git pull si déjà cloné
cd onda-app
```

## 2. Construire l'image

Fait automatiquement par `deploy/deploy.sh` (étape 6) — inutile de le faire à
la main sauf en **swarm à plusieurs nœuds**, où il faut alors un registre pour
que les autres nœuds voient l'image (sans registre existant, le plus simple :
`docker service create --name registry --publish 5000:5000 registry:2`, puis
adapter `IMAGE_NAME` dans `deploy/deploy.sh` en `localhost:5000/ondarh-server`
et pousser après build).

Le build lit aussi `.env` **à la racine** (pas `server/.env`) pour les
variables `VITE_*` — Vite les compile dans le bundle frontend, contrairement à
`server/.env` qui n'est lu qu'au runtime du serveur. Les deux fichiers ne se
recouvrent plus depuis la séparation faite dans ce commit (`.env` racine =
uniquement `VITE_*`, tout le reste dans `server/.env`) : mettez à jour l'un ou
l'autre selon ce que vous changez, pas besoin de dupliquer.

## 3. Préparer les secrets

Ne jamais mettre les vraies valeurs dans stack.yml (il pourrait finir commit).
`deploy/deploy.sh` lit par défaut **`server/.env`** — le même fichier que PM2
charge déjà via `dotenv`, jamais copié dans l'image (voir `.dockerignore`).
Rien à dupliquer : les secrets déjà en place (SMTP, Paystack...) sont repris
tels quels. Complétez-le juste avec ce qui manque pour Postgres/l'auth :

```bash
nano server/.env
```

En vous basant sur [server/.env.example](server/.env.example) pour la liste
complète — les deux nouvelles, à ajouter si absentes :
```
POSTGRES_PASSWORD=<le mot de passe déjà utilisé par le service Postgres>
JWT_SECRET=<générez une valeur aléatoire longue, ex: openssl rand -hex 32>
```

`deploy/deploy.sh` (étape 6) charge ce fichier lui-même avant de déployer —
rien à faire à la main, sauf si vous préférez un fichier séparé
(`ONDA_ENV_FILE=/chemin/vers/autre.env deploy/deploy.sh`).

## 4. Adapter le stack.yml

Déjà fait dans `deploy/stack.yml` (réseau `whatsapp-network`, service Postgres
`infra_pgbouncer:6432`, volume `onda_uploads`) — à rouvrir seulement si votre
infra change (nouveau réseau, changement d'utilisateur/base Postgres...).

## 5. Couper PM2

**Avant** de déployer, pas après : PM2 occupe déjà le port 3002 en écoute sur
l'hôte, exactement le port que le conteneur Swarm va demander
(`deploy/stack.yml`, `ports: "3002:3002"`) — les deux ne peuvent pas le tenir
en même temps. Sans cette étape d'abord, le déploiement échoue avec "port is
already allocated".

```bash
pm2 stop <nom-du-process-onda>
pm2 delete <nom-du-process-onda>
pm2 save
```

Ça implique une courte coupure entre l'arrêt de PM2 et le moment où le nouveau
conteneur devient sain (étape 7) — comptez large la première fois, le temps de
vérifier que tout démarre bien avant d'annoncer que c'est fait.

Ne désinstallez PM2 nulle part : gardez-le disponible quelques jours.
`pm2 start <ancien-process>` reste le filet de sécurité le plus rapide en cas
de souci imprévu côté Swarm — pensez juste à `docker service rm onda_onda-server`
avant, pour libérer le port 3002 côté Swarm et éviter un nouveau conflit.

## 6. Déployer (et mettre à jour)

```bash
deploy/deploy.sh
```

Un seul script pour le premier déploiement et pour toutes les mises à jour
suivantes — `docker stack deploy` est idempotent, la seule différence entre
les deux est que le service existe déjà. Ce qu'il fait, dans l'ordre :

1. Vérifie que `docker` est là et que `server/.env` contient au minimum
   `POSTGRES_PASSWORD` et `JWT_SECRET`.
2. Construit l'image, taguée avec le commit git courant **et** `:latest` — le
   tag unique garantit que Swarm détecte toujours la nouvelle version (pas
   besoin de compter sur `docker service update --force`, fait quand même en
   filet de sécurité).
3. Déploie/mets à jour le stack `onda` avec cette image précise.
4. Affiche l'état du service et les 30 dernières lignes de log.

Pour cibler un autre fichier de secrets : `ONDA_ENV_FILE=/chemin/vers/onda.env deploy/deploy.sh`.

## 7. Vérifier

Le script affiche déjà l'état et les logs à la fin. En cas de doute :

```bash
docker service ps onda_onda-server --no-trunc   # état "Running" ?
docker service logs -f onda_onda-server         # logs en direct — cherchez
                                                 # "✅ Base de données synchronisée"
                                                 # et "🚀 Serveur Backend lancé"
curl http://localhost:3002/api/health           # doit répondre {"status":"ok",...}
```

Si le service redémarre en boucle (`docker service ps` montre plusieurs
tentatives), c'est presque toujours `DATABASE_URL` mal formé ou le réseau qui
ne correspond pas à celui de Postgres/PgBouncer — revoir `deploy/stack.yml`.
Si le conteneur ne démarre pas du tout à cause du port, c'est que l'étape 5 a
été sautée (PM2 tient encore le 3002).

## 7bis. Pointer nginx dessus

Le conteneur publie le port 3002 sur l'hôte — nginx, installé nativement sur
le serveur, fait juste un reverse proxy classique vers `127.0.0.1:3002`.
Modèle prêt à l'emploi : [deploy/nginx.example.conf](deploy/nginx.example.conf).

Deux points qui cassent silencieusement si on les oublie :
- **WebSocket** (Socket.IO, temps réel) — sans `proxy_set_header Upgrade`/
  `Connection "upgrade"`, l'app retombe en polling HTTP sans erreur visible.
- **Taille d'upload** — le défaut nginx (1 Mo) rejette les imports Excel/PDF
  avant même qu'ils atteignent l'app ; `client_max_body_size 25m` dans
  l'exemple.

Si nginx pointait déjà vers `127.0.0.1:3002` pour PM2, il n'y a rien à changer
côté nginx du tout — le nouveau conteneur reprend le même port.

## 8. Mises à jour futures

```bash
git pull
deploy/deploy.sh
```

C'est tout — même script qu'à l'étape 6. Pas besoin de retoucher PM2 (déjà
coupé) ni nginx (pointe déjà sur le port 3002).
