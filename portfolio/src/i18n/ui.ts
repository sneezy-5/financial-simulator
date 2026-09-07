import type { Lang } from '../consts';

/** Libellés d’interface. Toute chaîne visible passe par ici. */
export const UI = {
  fr: {
    'nav.projects': 'Projets',
    'nav.about': 'Parcours',
    'nav.blog': 'Blog',
    'nav.contact': 'Contact',
    'nav.skipToContent': 'Aller au contenu',

    'home.heroKicker': 'Concepteur d’outils financiers',
    'home.heroTitle': 'Je transforme un casse-tête financier en outil qu’on utilise tous les jours.',
    'home.heroLead':
      'Analyse métier, développement full-stack, design, mise en production. Je livre des produits financiers et de paie de bout en bout, pensés pour l’Afrique de l’Ouest.',
    'home.ctaProjects': 'Voir les projets',
    'home.ctaContact': 'Me contacter',
    'home.projectsTitle': 'Projets',
    'home.projectsLead': 'Une sélection — le reste sur la page projets.',
    'home.allProjects': 'Tous les projets',
    'home.aboutTitle': 'En bref',
    'home.aboutMore': 'Lire le parcours complet',
    'home.blogTitle': 'Écrits récents',
    'home.blogMore': 'Tous les articles',

    'projects.title': 'Projets',
    'projects.lead': 'Ce que j’ai conçu et développé, du problème métier au déploiement.',
    'project.role': 'Rôle',
    'project.stack': 'Stack',
    'project.year': 'Année',
    'project.visit': 'Voir en ligne',
    'project.back': 'Tous les projets',

    'about.title': 'Parcours',
    'about.skills': 'Compétences',
    'about.timeline': 'Étapes',
    'about.downloadCv': 'Télécharger le CV',

    'blog.title': 'Blog',
    'blog.lead': 'Notes sur la finance, la paie et la construction d’outils.',
    'blog.back': 'Tous les articles',
    'blog.updated': 'Mis à jour le',
    'blog.published': 'Publié le',

    'contact.title': 'Contact',
    'contact.lead': 'Un projet, une question, une envie d’échanger ? Écris-moi.',
    'contact.emailCta': 'Envoyer un e-mail',

    'footer.built': 'Site construit avec Astro.',
    'footer.rights': 'Tous droits réservés.',

    'lang.switch': 'English',
    'theme.toggle': 'Changer de thème',
    '404.title': 'Page introuvable',
    '404.lead': 'Cette page n’existe pas ou a été déplacée.',
    '404.home': 'Retour à l’accueil',
  },

  en: {
    'nav.projects': 'Projects',
    'nav.about': 'About',
    'nav.blog': 'Blog',
    'nav.contact': 'Contact',
    'nav.skipToContent': 'Skip to content',

    'home.heroKicker': 'Financial software builder',
    'home.heroTitle': 'I turn a financial headache into a tool people use every day.',
    'home.heroLead':
      'Domain analysis, full-stack development, design, production. I ship financial and payroll products end to end, built for West Africa.',
    'home.ctaProjects': 'View projects',
    'home.ctaContact': 'Get in touch',
    'home.projectsTitle': 'Projects',
    'home.projectsLead': 'A selection — the rest on the projects page.',
    'home.allProjects': 'All projects',
    'home.aboutTitle': 'In short',
    'home.aboutMore': 'Read the full background',
    'home.blogTitle': 'Recent writing',
    'home.blogMore': 'All articles',

    'projects.title': 'Projects',
    'projects.lead': 'What I have designed and built, from the business problem to deployment.',
    'project.role': 'Role',
    'project.stack': 'Stack',
    'project.year': 'Year',
    'project.visit': 'View live',
    'project.back': 'All projects',

    'about.title': 'About',
    'about.skills': 'Skills',
    'about.timeline': 'Milestones',
    'about.downloadCv': 'Download résumé',

    'blog.title': 'Blog',
    'blog.lead': 'Notes on finance, payroll and building tools.',
    'blog.back': 'All articles',
    'blog.updated': 'Updated',
    'blog.published': 'Published',

    'contact.title': 'Contact',
    'contact.lead': 'A project, a question, or just want to talk? Drop me a line.',
    'contact.emailCta': 'Send an email',

    'footer.built': 'Built with Astro.',
    'footer.rights': 'All rights reserved.',

    'lang.switch': 'Français',
    'theme.toggle': 'Toggle theme',
    '404.title': 'Page not found',
    '404.lead': 'This page does not exist or has moved.',
    '404.home': 'Back to home',
  },
} as const;

export type UIKey = keyof (typeof UI)['fr'];

/** Renvoie une fonction de traduction pour la langue donnée. */
export function useT(lang: Lang) {
  return (key: UIKey): string => UI[lang][key] ?? UI.fr[key] ?? key;
}

/**
 * Segments d’URL localisés. La clé est l’identifiant logique de section,
 * la valeur le segment affiché dans l’URL pour chaque langue.
 */
export const ROUTES = {
  projects: { fr: 'projets', en: 'projects' },
  about: { fr: 'parcours', en: 'about' },
  blog: { fr: 'blog', en: 'blog' },
  contact: { fr: 'contact', en: 'contact' },
} as const;

export type RouteId = keyof typeof ROUTES;

/** Construit un chemin absolu localisé : localePath('fr', 'projects') -> '/projets/'. */
export function localePath(lang: Lang, routeId?: RouteId, slug?: string): string {
  const prefix = lang === 'en' ? '/en' : '';
  if (!routeId) return prefix ? `${prefix}/` : '/';
  const seg = ROUTES[routeId][lang];
  return `${prefix}/${seg}${slug ? `/${slug}` : ''}/`;
}

/** Chemin de la home d’une langue. */
export function homePath(lang: Lang): string {
  return lang === 'en' ? '/en/' : '/';
}
