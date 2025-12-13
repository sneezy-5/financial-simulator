# Guide de Déploiement (Backend Node.js + SQLite)

Ce backend utilise **Node.js** et une base de données **SQLite** (fichier local). Cela signifie qu'il a besoin d'un système de fichiers persistant (disque).

## 1. Choix du Serveur

Il est recommandé d'utiliser un **VPS (Virtual Private Server)** pour héberger cette application afin de garantir la persistance des données (SQLite) et des uploads.
- **Fournisseurs recommandés** : DigitalOcean (Droplet), OVH, Hetzner, AWS Lightsail.
- **OS recommandé** : Ubuntu 20.04 ou 22.04 LTS.

> ⚠️ **Attention aux PaaS (Heroku, Vercel, Netlify)** :
> Ce backend NE PEUT PAS être hébergé sur Vercel ou Netlify (qui sont pour le frontend/serverless).
> Si vous utilisez Render ou Railway, vous **DEVEZ** configurer un "Persistent Disk" (Volume) monté sur le dossier du projet, sinon vous perdrez votre base de données et les fichiers uploadés à chaque redémarrage.

---

## 2. Installation sur un VPS (Ubuntu)

Connectez-vous à votre serveur en SSH.

### Étape 1 : Installer Node.js 18+
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Étape 2 : Installer PM2 (Gestionnaire de Processus)
PM2 permet de garder votre application en ligne 24/7 et de la redémarrer automatiquement en cas de crash.
```bash
sudo npm install -g pm2
```

### Étape 3 : Récupérer le code
Clonez votre repo (ou envoyez les fichiers `server/`). Assurez-vous d'être dans le dossier `server`.
```bash
git clone https://github.com/votre-repo/financial-simulator.git
cd financial-simulator/server
```

### Étape 4 : Installer les dépendances
```bash
npm install
```

### Étape 5 : Démarrer l'application
```bash
pm2 start server.js --name "rh-backend"
pm2 save
pm2 startup
```

L'application tourne maintenant sur le port **3001** (ou celui défini dans `server.js`).

---

## 3. Configuration Nginx (Reverse Proxy)

Pour rendre l'API accessible via un domaine (ex: `api.votre-domaine.com`) et sécuriser avec HTTPS, utilisez Nginx.

1.  **Installer Nginx** : `sudo apt install nginx`
2.  **Créer la config** : `sudo nano /etc/nginx/sites-available/rh-backend`

```nginx
server {
    server_name api.votre-domaine.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3.  **Activer le site** :
    ```bash
    sudo ln -s /etc/nginx/sites-available/rh-backend /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

4.  **HTTPS (SSL) avec Certbot (Gratuit)** :
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d api.votre-domaine.com
    ```

---

## 4. Maintenance & Logs

- **Voir les logs en temps réel** : `pm2 logs rh-backend`
- **Redémarrer le serveur** : `pm2 restart rh-backend`
- **Mettre à jour le code** :
    1. `git pull`
    2. `npm install` (si nouvelles dépendances)
    3. `pm2 restart rh-backend`

## 5. Sauvegardes (Important !)

Comme tout est stocké dans des fichiers locaux, pensez à sauvegarder régulièrement :
- `server/database.sqlite` (Base de données)
- `server/uploads/` (Fichiers générés)
