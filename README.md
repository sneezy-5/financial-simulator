# 🏦 Simulateur de Prêt Bancaire - Financial Simulator

Une application web moderne et interactive pour simuler des prêts bancaires, évaluer l'éligibilité des emprunteurs et analyser leur capacité de remboursement selon les normes financières en vigueur (zone UEMOA).

## ✨ Fonctionnalités Principales

*   **Simulation Multi-Étapes Fluide** : Parcours utilisateur guidé en 3 étapes (Choix Banque/Prêt, Profil Emprunteur, Résultats).
*   **Sélection Dynamique des Offres** :
    *   Catalogue de banques et de types de prêts configurables.
    *   Affichage des conditions spécifiques (taux, durée, montant, âge, etc.).
*   **Calculs Financiers Précis** :
    *   Mensualités, coût total du crédit, part des intérêts.
    *   **Analyse de la Quotité** : Calcul automatique du taux d'endettement, de la quotité disponible et du reste à vivre.
    *   **Scoring Crédit** : Algorithme d'évaluation du profil emprunteur (basé sur l'âge, les revenus, la stabilité de l'emploi, etc.).
*   **Interface Utilisateur Premium** :
    *   Design responsive et esthétique.
    *   Retours visuels interactifs (Jauges de quotité, animations de score).
    *   Système de notifications (Toasts) pour la validation des données.
*   **Tableau d'Amortissement** : Visualisation détaillée de l'échéancier de remboursement.
*   **Administration & Analytics** :
    *   Backend Node.js/Express avec base de données SQLite.
    *   Suivi des visites et statistiques.
    *   **Accès Admin** : Tableau de bord caché accessible via le raccourci `Ctrl + Shift + A`.

## 🛠️ Stack Technique

*   **Framework** : [Vue.js 3](https://vuejs.org/) (Composition API, Script Setup).
*   **Build Tool** : [Vite](https://vitejs.dev/).
*   **Styling** : CSS natif avec design system personnalisé (variables CSS, flexbox/grid).
*   **Données** : Service de mock pour simuler une API backend (`src/services/mockData.js`).

## 🚀 Installation et Démarrage

Pré-requis : Node.js installé sur votre machine.

1.  **Cloner le projet** (ou télécharger les sources)
    ```bash
    git clone https://github.com/votre-repo/financial-simulator.git
    cd financial-simulator
    ```

2.  **Installer les dépendances**
    ```bash
    npm install
    ```

3.  **Lancer le serveur de développement**
    ```bash
    npm run dev
    ```

4.  **Accéder à l'application**
    Ouvrez votre navigateur sur `http://localhost:5173` (ou le port indiqué dans la console).

## 📂 Structure du Projet

```
src/
├── assets/          # Images et logos des banques
├── components/      # Composants Vue réutilisables
│   ├── steps/       # Composants spécifiques aux étapes du simulateur
│   └── ...
├── services/        # Services (ex: mockData.js pour les données)
├── App.vue          # Composant racine (Orchestration du simulateur)
├── style.css        # Styles globaux
└── main.js          # Point d'entrée
```

## 📝 Règles de Gestion (Simulation)

*   **Quotité Max** : 35% des revenus.
*   **Quotité Cessible** : 33.33% (Norme UEMOA).
*   **Reste à vivre** : Minimum vital calculé en fonction du nombre de personnes à charge.
*   **Scoring** : Système de points sur 100 basé sur la stabilité financière et personnelle.

## 👥 Auteur
**Développé par Narcisse Adingra (alias Sneezy) - Équipe Djeli**
Développé avec ❤️ pour simplifier l'accès à l'information financière.
