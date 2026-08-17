# Intégration de l'API de Paiement Paystack

Ce plan détaille la mise en place de la passerelle de paiement **Paystack** pour permettre aux utilisateurs d'acheter des packs de crédits en argent réel (Mobile Money FCFA, Wave, Cartes bancaires, etc.).

---

## User Review Required

> [!IMPORTANT]
> **Clés d'API Paystack**
> 
> Pour que les paiements fonctionnent, vous devrez créer un compte sur [Paystack](https://paystack.com/) et récupérer vos clés d'API (Public Key & Secret Key).
> Nous utiliserons les clés de test pour le développement, mais il faudra insérer vos vraies clés dans le fichier `.env` de production :
> - `PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxx` (utilisé côté Frontend)
> - `PAYSTACK_SECRET_KEY=sk_test_xxxxxxxx` (utilisé côté Backend)
> 
> **Le montant est-il toujours en FCFA (XOF) ?** Le système sera configuré par défaut en XOF.

---

## Proposed Changes

### 1. Base de Données (`server/database.js`)
#### [MODIFY] [database.js](file:///c:/Users/HP/.gemini/antigravity/scratch/financial-simulator/server/database.js)
- Création d'un nouveau modèle `Transaction` pour stocker l'historique des paiements :
  - `reference` (String, unique, fournie par Paystack)
  - `amount` (Integer)
  - `credits` (Integer, nombre de crédits achetés)
  - `status` (String, ex: 'success', 'failed', 'pending')
  - `userId` (Clé étrangère vers l'utilisateur)

### 2. Backend API (`server/server.js`)
#### [MODIFY] [server.js](file:///c:/Users/HP/.gemini/antigravity/scratch/financial-simulator/server/server.js)
- Remplacement de l'ancienne route simulée `/api/billing/buy-credits`.
- **Nouvelle route :** `POST /api/billing/verify-paystack`
  - Reçoit la `reference` du paiement depuis le frontend.
  - Fait un appel HTTP sécurisé (serveur à serveur) à l'API de Paystack (`https://api.paystack.co/transaction/verify/:reference`) avec la `PAYSTACK_SECRET_KEY` pour vérifier que le paiement a bien abouti et que le montant est correct.
  - Si succès :
    1. Vérifie que la transaction n'existe pas déjà en base (pour éviter le double ajout de crédits).
    2. Enregistre la transaction en base avec statut `success`.
    3. Ajoute les crédits au solde de l'utilisateur.
    4. Retourne le nouveau solde.

### 3. Frontend Vue.js (`src/components/BillingModal.vue`)
#### [MODIFY] [BillingModal.vue](file:///c:/Users/HP/.gemini/antigravity/scratch/financial-simulator/src/components/BillingModal.vue)
- Inclusion du SDK Javascript Paystack (Popup Inline).
- Modification de la fonction d'achat (`handlePurchase`) :
  - Au clic, ouvre le popup sécurisé de Paystack.
  - Demande l'email de l'utilisateur, le montant (en FCFA), et utilise la `PAYSTACK_PUBLIC_KEY`.
  - À la fermeture / succès du popup (callback `onSuccess`), récupère la `reference` et l'envoie au backend via la nouvelle fonction API de vérification.

#### [MODIFY] [auth.js](file:///c:/Users/HP/.gemini/antigravity/scratch/financial-simulator/src/services/auth.js)
- Création de la fonction `verifyPaystackPayment(reference, packDetails)` qui communiquera avec la route `/api/billing/verify-paystack`.

---

## Verification Plan

### Automated / API Tests
- Simuler l'appel à `/api/billing/verify-paystack` avec une fausse référence et vérifier le rejet (400 Bad Request).
- S'assurer que le backend empêche d'utiliser deux fois la même référence de transaction.

### Manual Verification
1. Ouvrir le modal "Acheter des crédits".
2. Cliquer sur un pack de crédits.
3. Vérifier que le popup Paystack s'ouvre correctement avec le bon montant et la devise XOF.
4. Effectuer un paiement de test (avec les numéros de carte/Mobile Money de test fournis par Paystack).
5. Vérifier que, suite au succès, le popup se ferme, le solde de crédits de l'utilisateur est mis à jour, et l'historique (dans la base de données) est bien sauvegardé.
