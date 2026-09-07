import type { Lang } from '../consts';

/**
 * Contenu de la page « Parcours » + extraits sur la home.
 * Remplace librement — c’est ta biographie, tes compétences, tes étapes.
 */

interface AboutContent {
  /** 1–2 phrases, affichées sur la home. */
  short: string;
  /** 2–3 paragraphes pour la page Parcours. */
  long: string[];
  skills: { group: string; items: string[] }[];
  timeline: { period: string; title: string; body: string }[];
}

export const ABOUT: Record<Lang, AboutContent> = {
  fr: {
    short:
      'Je conçois des outils financiers de bout en bout : je pars d’un problème administratif concret en Afrique de l’Ouest, et je livre le produit — analyse métier, code, design, mise en production.',
    long: [
      'Passionné de finance et d’éducation financière, je crois que chacun devrait pouvoir comprendre et maîtriser ses finances. C’est ce qui guide tout ce que je construis.',
      'Concrètement, je développe des logiciels de paie et des outils de simulation financière adaptés au droit local (Côte d’Ivoire, Bénin, Togo). Je travaille seul sur l’ensemble de la chaîne : compréhension de la règle métier, développement full-stack, interface, déploiement et exploitation.',
      'Mon différenciateur n’est pas seulement technique : c’est la capacité à traduire une réglementation fiscale ou sociale en un outil juste, vérifiable et simple à utiliser.',
    ],
    skills: [
      { group: 'Développement', items: ['Vue 3', 'Node.js / Express', 'PostgreSQL', 'Astro', 'TypeScript', 'Socket.IO'] },
      { group: 'Produit & données', items: ['Moteurs de règles fiscales & sociales', 'Génération PDF / Word / Excel', 'Intégration paiement (Paystack)', 'Authentification'] },
      { group: 'Livraison', items: ['Electron / PWA', 'Docker & Docker Swarm', 'nginx', 'CI de déploiement', 'SEO technique'] },
    ],
    timeline: [
      {
        period: '2023 →',
        title: 'ONDA — écosystème d’outils financiers',
        body: 'Simulateurs gratuits (crédit, paie, fiscalité), puis logiciel de paie complet. Infrastructure, déploiement et contenu.',
      },
      {
        period: '2024 →',
        title: 'ONDA RH',
        body: 'Logiciel de paie et de gestion RH multi-pays : paie, déclarations sociales, annuaire, documents. Web, bureau et hors-ligne.',
      },
      {
        period: 'Prochainement',
        title: 'Comptabilité & analyse financière',
        body: 'Un outil de tenue comptable et d’analyse, dans la continuité de l’écosystème.',
      },
    ],
  },

  en: {
    short:
      'I build financial software end to end: I start from a concrete administrative problem in West Africa and ship the product — domain analysis, code, design, production.',
    long: [
      'Driven by finance and financial literacy, I believe everyone should be able to understand and control their finances. That guides everything I build.',
      'In practice, I develop payroll software and financial simulation tools adapted to local law (Côte d’Ivoire, Benin, Togo). I work solo across the whole chain: understanding the business rule, full-stack development, interface, deployment and operations.',
      'My edge is not only technical: it is the ability to translate tax or social regulation into a tool that is correct, auditable and simple to use.',
    ],
    skills: [
      { group: 'Development', items: ['Vue 3', 'Node.js / Express', 'PostgreSQL', 'Astro', 'TypeScript', 'Socket.IO'] },
      { group: 'Product & data', items: ['Tax & social rules engines', 'PDF / Word / Excel generation', 'Payment integration (Paystack)', 'Authentication'] },
      { group: 'Delivery', items: ['Electron / PWA', 'Docker & Docker Swarm', 'nginx', 'Deploy CI', 'Technical SEO'] },
    ],
    timeline: [
      {
        period: '2023 →',
        title: 'ONDA — financial tools ecosystem',
        body: 'Free simulators (credit, payroll, tax), then a full payroll product. Infrastructure, deployment and content.',
      },
      {
        period: '2024 →',
        title: 'ONDA RH',
        body: 'Multi-country payroll and HR software: payroll, social filings, directory, documents. Web, desktop and offline.',
      },
      {
        period: 'Coming next',
        title: 'Accounting & financial analysis',
        body: 'A bookkeeping and analysis tool, continuing the ecosystem.',
      },
    ],
  },
};
