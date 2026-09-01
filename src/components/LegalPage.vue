<script setup>
import { ref } from 'vue'

const props = defineProps({
  doc: { type: String, default: 'cgu' } // 'cgu' | 'confidentialite'
})
defineEmits(['retour'])

const activeDoc = ref(props.doc === 'confidentialite' ? 'confidentialite' : 'cgu')

const MAJ = '31/08/2026'
const CONTACT = 'info@eonda.online'
</script>

<template>
  <div class="lg-page">
    <!-- Barre -->
    <header class="lg-bar">
      <button class="lg-back" @click="$emit('retour')" aria-label="Retour">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Retour
      </button>
      <span class="lg-logo">ONDA</span>
      <span class="lg-bar-spacer"></span>
    </header>

    <div class="lg-wrap">
      <!-- Onglets -->
      <div class="lg-tabs" role="tablist">
        <button
          class="lg-tab" :class="{ 'is-active': activeDoc === 'cgu' }"
          role="tab" :aria-selected="activeDoc === 'cgu'"
          @click="activeDoc = 'cgu'">Conditions d'utilisation</button>
        <button
          class="lg-tab" :class="{ 'is-active': activeDoc === 'confidentialite' }"
          role="tab" :aria-selected="activeDoc === 'confidentialite'"
          @click="activeDoc = 'confidentialite'">Politique de confidentialité</button>
      </div>

      <!-- ════════════ CGU ════════════ -->
      <article v-if="activeDoc === 'cgu'" class="lg-doc">
        <h1>Conditions Générales d'Utilisation</h1>
        <p class="lg-maj">Dernière mise à jour : {{ MAJ }}</p>

        <h2>1. Objet et identité de l'Éditeur</h2>
        <p>
          Les présentes Conditions Générales d'Utilisation (les « CGU ») régissent l'accès et l'utilisation
          de la plateforme <strong>ONDA RH Pro</strong> (le « Service »).
        </p>
        <p>
          Le Service est exploité à titre individuel, en nom propre, par un exploitant établi à Abidjan
          (Côte d'Ivoire), joignable à l'adresse {{ CONTACT }} (l'« Éditeur » ou « nous »). À ce jour, le
          Service n'est pas exploité par l'intermédiaire d'une société immatriculée : aucune mention de
          registre du commerce ni de capital social n'est donc applicable.
        </p>

        <h2>2. Définitions</h2>
        <ul>
          <li><strong>Service</strong> : l'application web et progressive (PWA) ONDA RH Pro et l'ensemble de ses modules.</li>
          <li><strong>Utilisateur</strong> : toute personne physique ou morale disposant d'un compte pour accéder au Service.</li>
          <li><strong>Compte</strong> : l'espace personnel de l'Utilisateur, protégé par identifiant et mot de passe.</li>
          <li><strong>Offre Gratuite</strong> : les fonctionnalités accessibles sans paiement.</li>
          <li><strong>Offre Pro</strong> : les fonctionnalités payantes activées après souscription.</li>
          <li><strong>Contenu Utilisateur</strong> : toute donnée saisie ou importée par l'Utilisateur, notamment les données de ses salariés.</li>
        </ul>

        <h2>3. Acceptation</h2>
        <p>
          La création d'un Compte et toute utilisation du Service emportent acceptation pleine et entière des CGU.
          L'Utilisateur qui n'accepte pas les CGU doit renoncer à utiliser le Service.
        </p>

        <h2>4. Description du Service</h2>
        <p>
          Le Service propose des outils de gestion de la paie et des ressources humaines : simulation et génération
          de bulletins, calcul des congés payés et du solde de tout compte, annuaire des salariés, contrats,
          déclarations sociales (CNPS, ITS, FDFP), tableaux de bord et génération de documents RH, pour la
          Côte d'Ivoire.
        </p>
        <p>
          Le Service est un <strong>outil d'aide</strong>. Il ne se substitue pas à un expert-comptable, à un
          conseil juridique ou à un professionnel de la paie. L'Utilisateur reste seul responsable de la
          conformité de ses obligations sociales et fiscales et doit vérifier les résultats produits au regard
          de sa situation particulière et de la réglementation en vigueur.
        </p>

        <h2>5. Compte</h2>
        <ul>
          <li>L'Utilisateur fournit des informations exactes et les maintient à jour.</li>
          <li>Les identifiants sont personnels et confidentiels ; l'Utilisateur est responsable de leur usage.</li>
          <li>Toute utilisation du Compte est réputée effectuée par l'Utilisateur. Il signale sans délai toute utilisation non autorisée à {{ CONTACT }}.</li>
        </ul>

        <h2>6. Offre Gratuite et Offre Pro</h2>
        <ul>
          <li>L'Offre Gratuite est fournie sans contrepartie financière et sans obligation d'achat.</li>
          <li>L'Offre Pro est souscrite dans l'application ; le prix, la périodicité et les quotas applicables y sont indiqués avant paiement.</li>
          <li>Les paiements sont traités par le prestataire Paystack et les moyens de paiement proposés (Mobile Money, Wave, carte bancaire). L'Éditeur ne conserve pas les numéros de carte.</li>
          <li>Sauf mention contraire au moment de la souscription, l'Offre Pro n'est pas reconduite automatiquement à l'insu de l'Utilisateur.</li>
          <li>Sauf disposition légale impérative contraire, les sommes versées pour une période entamée ne sont pas remboursées.</li>
        </ul>

        <h2>7. Obligations de l'Utilisateur</h2>
        <ul>
          <li>Utiliser le Service conformément aux lois applicables et aux présentes CGU.</li>
          <li>Ne pas revendre, sous-licencier ou exploiter le Service pour le compte de tiers sans accord écrit de l'Éditeur.</li>
          <li>Ne pas tenter de contourner les limitations techniques, quotas ou mesures de sécurité.</li>
          <li>Garantir l'exactitude et la licéité des données saisies, et disposer du droit de les traiter.</li>
          <li>Informer ses salariés du traitement de leurs données, conformément à la réglementation applicable.</li>
        </ul>

        <h2>8. Contenu Utilisateur et données</h2>
        <p>
          L'Utilisateur conserve la propriété et la responsabilité de son Contenu Utilisateur. Il concède à l'Éditeur
          une licence limitée, non exclusive et pour la seule durée d'utilisation du Service, aux fins d'héberger,
          traiter et afficher ce contenu afin de fournir le Service. Le traitement des données personnelles est
          décrit dans la Politique de confidentialité.
        </p>

        <h2>9. Propriété intellectuelle</h2>
        <p>
          Le Service, sa marque, ses interfaces, ses modèles de documents et son code source sont la propriété
          exclusive de l'Éditeur ou de ses concédants. Les CGU ne confèrent aucun droit de propriété sur le Service,
          seulement un droit d'usage personnel, révocable et non transférable pendant la durée d'utilisation.
        </p>

        <h2>10. Disponibilité et évolutions</h2>
        <p>
          L'Éditeur met en œuvre des moyens raisonnables pour assurer la disponibilité du Service, sans garantie
          d'accès ininterrompu. Le Service peut être suspendu temporairement pour maintenance, mise à jour ou pour
          des raisons de sécurité. Les fonctionnalités peuvent évoluer, être ajoutées ou retirées.
        </p>

        <h2>11. Garanties et responsabilité</h2>
        <p>
          Le Service est fourni « en l'état ». L'Éditeur ne garantit pas que les calculs, barèmes ou documents
          produits sont exacts au regard de toute situation individuelle ou de toute évolution réglementaire.
          Il appartient à l'Utilisateur de contrôler chaque résultat avant tout usage officiel ou déclaratif.
        </p>
        <p>
          Dans la limite autorisée par la loi, la responsabilité de l'Éditeur, tous préjudices confondus, est
          limitée au montant effectivement payé par l'Utilisateur au titre du Service au cours des douze (12) mois
          précédant le fait générateur. L'Éditeur ne répond pas des dommages indirects, notamment pertes
          d'exploitation, de données, de chiffre d'affaires ou d'image.
        </p>

        <h2>12. Sauvegarde et portabilité</h2>
        <p>
          L'Utilisateur peut exporter ses documents (PDF, Excel) depuis le Service. Il lui est recommandé de
          conserver ses propres copies. L'Éditeur ne saurait être tenu responsable d'une perte de données
          imputable à un défaut de sauvegarde de l'Utilisateur.
        </p>

        <h2>13. Suspension et résiliation</h2>
        <ul>
          <li>L'Utilisateur peut cesser d'utiliser le Service et demander la suppression de son Compte à tout moment.</li>
          <li>L'Éditeur peut suspendre ou résilier l'accès en cas de manquement aux CGU, d'usage frauduleux ou de risque pour le Service ou pour des tiers.</li>
          <li>Après résiliation, le Contenu Utilisateur est supprimé dans un délai de 30 jours, sauf obligation légale de conservation.</li>
        </ul>

        <h2>14. Modification des CGU</h2>
        <p>
          L'Éditeur peut modifier les CGU. Les Utilisateurs sont informés par un moyen approprié (application ou
          e-mail). La poursuite de l'utilisation après l'entrée en vigueur des nouvelles CGU vaut acceptation.
        </p>

        <h2>15. Droit applicable et litiges</h2>
        <p>
          Les CGU sont régies par le droit ivoirien. En cas de différend, les parties rechercheront une solution
          amiable avant toute action contentieuse. À défaut d'accord, compétence est attribuée aux tribunaux
          compétents d'Abidjan, sous réserve des règles impératives protectrices du consommateur.
        </p>

        <h2>16. Contact</h2>
        <p>Pour toute question relative aux CGU : {{ CONTACT }}.</p>
      </article>

      <!-- ════════════ CONFIDENTIALITÉ ════════════ -->
      <article v-else class="lg-doc">
        <h1>Politique de confidentialité</h1>
        <p class="lg-maj">Dernière mise à jour : {{ MAJ }}</p>

        <p>
          La présente politique décrit comment sont traitées les données personnelles dans le cadre de
          l'utilisation de <strong>ONDA RH Pro</strong>.
        </p>

        <h2>1. Responsable et rôles</h2>
        <ul>
          <li>
            Pour les <strong>données de compte et de facturation</strong> de l'Utilisateur, le responsable de
            traitement est l'Éditeur (exploitant du Service ONDA RH Pro, à titre individuel, établi à Abidjan,
            Côte d'Ivoire), contact : {{ CONTACT }}.
          </li>
          <li>
            Pour les <strong>données des salariés</strong> saisies ou importées par l'Utilisateur, l'Utilisateur
            (l'employeur) est <strong>responsable de traitement</strong> ; l'Éditeur agit en qualité de
            <strong>sous-traitant</strong>, sur instruction de l'Utilisateur et pour la seule fourniture du Service.
          </li>
        </ul>

        <h2>2. Données traitées</h2>
        <ul>
          <li><strong>Compte</strong> : nom, adresse e-mail, téléphone, nom de l'entreprise, identifiants de connexion (mot de passe stocké sous forme hachée).</li>
          <li><strong>Facturation (Offre Pro)</strong> : historique des paiements et informations nécessaires à la facturation, via le prestataire Paystack.</li>
          <li><strong>Données salariés (Contenu Utilisateur)</strong> : état civil, matricule, numéro CNPS, poste, catégorie, dates de contrat, rémunération, situation familiale, absences et heures supplémentaires.</li>
          <li><strong>Données techniques</strong> : journaux de connexion, adresse IP, type d'appareil et de navigateur, cookies strictement nécessaires au fonctionnement.</li>
        </ul>

        <h2>3. Finalités et bases légales</h2>
        <ul>
          <li>Fournir et sécuriser le Service, gérer le Compte — exécution du contrat.</li>
          <li>Traiter les paiements et établir la facturation — exécution du contrat et obligation légale.</li>
          <li>Prévenir la fraude, assurer la sécurité et améliorer le Service — intérêt légitime de l'Éditeur.</li>
          <li>Répondre aux demandes de support — exécution du contrat et intérêt légitime.</li>
        </ul>

        <h2>4. Destinataires et sous-traitants</h2>
        <p>Les données ne sont ni vendues ni louées. Elles peuvent être communiquées à&nbsp;:</p>
        <ul>
          <li>un prestataire d'hébergement cloud — hébergement de l'infrastructure et de la base de données ;</li>
          <li>Paystack — traitement des paiements de l'Offre Pro ;</li>
          <li>un service tiers d'envoi d'e-mails — e-mails de connexion et de notification ;</li>
          <li>les autorités, lorsque la loi l'exige.</li>
        </ul>

        <h2>5. Hébergement et localisation</h2>
        <p>
          L'infrastructure est fournie par un prestataire d'hébergement cloud professionnel. Les serveurs
          peuvent être situés hors de Côte d'Ivoire.
        </p>

        <h2>6. Durées de conservation</h2>
        <ul>
          <li><strong>Compte</strong> : pendant toute la durée d'utilisation, puis supprimé ou anonymisé dans un délai de 12 mois après la fermeture du Compte.</li>
          <li><strong>Données salariés</strong> : supprimées dans un délai de 30 jours après la résiliation, ou plus tôt sur demande de l'Utilisateur, sauf obligation légale de conservation.</li>
          <li><strong>Facturation</strong> : conservée pendant 10 ans, conformément aux obligations comptables.</li>
          <li><strong>Journaux techniques</strong> : 12 mois.</li>
        </ul>

        <h2>7. Sécurité</h2>
        <p>
          Chiffrement des échanges (HTTPS), mots de passe stockés sous forme hachée, contrôle d'accès par compte,
          cloisonnement des données par Utilisateur, sauvegardes régulières. Aucune mesure n'offre toutefois une
          sécurité absolue.
        </p>

        <h2>8. Cookies</h2>
        <p>
          Le Service utilise des cookies et un stockage local strictement nécessaires à l'authentification et au
          fonctionnement (session, préférences d'affichage). Le Service n'utilise pas de cookies publicitaires ni
          de traceurs de profilage. Si une mesure d'audience venait à être ajoutée, elle le serait dans le respect
          de la réglementation applicable et, le cas échéant, de votre consentement.
        </p>

        <h2>9. Vos droits</h2>
        <p>
          Vous disposez des droits d'accès, de rectification, d'effacement, d'opposition, de limitation et de
          portabilité, dans les conditions prévues par la réglementation applicable. Pour les exercer, écrivez à
          {{ CONTACT }}.
        </p>
        <p>
          Si votre demande porte sur des <strong>données figurant dans le compte d'un employeur</strong>
          (données salariés), adressez-vous d'abord à cet employeur, responsable de traitement. L'Éditeur
          relaiera la demande le cas échéant.
        </p>

        <h2>10. Transferts hors de Côte d'Ivoire</h2>
        <p>
          Certaines données peuvent être hébergées ou traitées hors de Côte d'Ivoire par nos prestataires
          techniques (hébergeur, prestataire de paiement, service d'e-mails). Nous sélectionnons des prestataires
          présentant des garanties de sécurité et de confidentialité appropriées.
        </p>

        <h2>11. Réclamation</h2>
        <p>
          Vous pouvez introduire une réclamation auprès de l'Autorité de Régulation des Télécommunications de
          Côte d'Ivoire (ARTCI), compétente en matière de protection des données personnelles.
        </p>

        <h2>12. Modifications</h2>
        <p>
          Cette politique peut être mise à jour. La version applicable est celle publiée dans le Service à la date
          de consultation ; les modifications importantes font l'objet d'une information spécifique.
        </p>

        <h2>13. Contact</h2>
        <p>Pour toute question relative à vos données : {{ CONTACT }}.</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.lg-page {
  --ink: #0b0d12;
  --muted: #5b6472;
  --mint: #10bf9a;
  --cream: #f6f1e8;
  --line: #e7e3d9;
  min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, var(--cream) 100%);
  color: var(--ink);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.lg-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 10;
}
.lg-back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.lg-back:hover { border-color: var(--mint); transform: translateX(-2px); }
.lg-logo { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em; }
.lg-bar-spacer { flex: 1; }

.lg-wrap { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }

.lg-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}
.lg-tab {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;
}
.lg-tab:hover { color: var(--ink); }
.lg-tab.is-active {
  background: var(--ink);
  color: #fff;
  border-color: var(--ink);
}

.lg-doc h1 {
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 0.4rem;
}
.lg-maj { color: var(--muted); font-size: 0.85rem; margin: 0 0 2rem; }
.lg-doc h2 {
  font-size: 1.08rem;
  font-weight: 800;
  margin: 2rem 0 0.6rem;
  letter-spacing: -0.01em;
}
.lg-doc p { line-height: 1.7; margin: 0 0 0.9rem; color: #2b3038; font-size: 0.95rem; }
.lg-doc ul { margin: 0 0 1rem; padding-left: 1.2rem; }
.lg-doc li { line-height: 1.7; margin-bottom: 0.35rem; color: #2b3038; font-size: 0.95rem; }
.lg-doc strong { color: var(--ink); }

@media (max-width: 560px) {
  .lg-doc h1 { font-size: 1.5rem; }
  .lg-wrap { padding: 1.75rem 1.15rem 4rem; }
}
</style>
