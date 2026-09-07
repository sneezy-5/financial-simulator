/**
 * Configuration centrale du portfolio.
 * Remplace les valeurs entre « ⟨ ⟩ » par tes informations réelles avant la mise en ligne.
 */

export const SITE = {
  /** URL de production, sans slash final. À renseigner avec le domaine acheté. */
  url: 'https://exemple.com',
  /** Nom complet — sert au titre, au pied de page, au JSON-LD Person. */
  author: '⟨Ton Nom Complet⟩',
  /** Ville / pays. */
  location: 'Abidjan, Côte d’Ivoire',
  /** Année de démarrage d’activité (pied de page « © 2021–2026 »). */
  since: 2021,
} as const;

/** Titre + description par défaut, par langue (repris si une page n’en fournit pas). */
export const META = {
  fr: {
    title: `${SITE.author} — Concepteur d’outils financiers`,
    description:
      'Je conçois et développe des outils financiers et de paie pour l’Afrique de l’Ouest — de l’analyse métier au déploiement. Découvrez mes projets.',
  },
  en: {
    title: `${SITE.author} — Financial software builder`,
    description:
      'I design and build financial and payroll software for West Africa — from domain analysis to deployment. See my projects.',
  },
} as const;

/** Liens sociaux / contact. Laisse une valeur vide ('') pour masquer le lien. */
export const LINKS = {
  email: 'ericobronze@gmail.com',
  /** Ton URL LinkedIn complète, ex. https://www.linkedin.com/in/prenom-nom */
  linkedin: 'https://www.linkedin.com/in/ton-profil',
  github: 'https://github.com/nadingra',
  whatsapp: 'https://wa.me/2250151144337',
  /** Écosystème de produits, mis en avant sur la home. */
  onda: 'https://eonda.online/',
} as const;

/** Fichier CV téléchargeable (placé dans /public). Laisse '' pour masquer le bouton. */
export const CV = {
  fr: '/cv-fr.pdf',
  en: '/cv-en.pdf',
} as const;

export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

/** true si la valeur est encore un placeholder (à ne pas afficher). */
export const isPlaceholder = (v?: string): boolean =>
  !v || /[⟨⟩]|ton-profil|votre-profil|exemple\.com/.test(v);

/** true si le lien est réellement configuré. */
export const hasLink = (v?: string): boolean => !isPlaceholder(v);
