import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const langField = z.enum(['fr', 'en']);

/** Projets — une entrée par (projet, langue). Fichier : <slug>.<lang>.md */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      lang: langField,
      /** slug logique partagé entre les langues, ex. "onda-rh" */
      key: z.string(),
      title: z.string(),
      summary: z.string(),
      role: z.string(),
      stack: z.array(z.string()),
      year: z.string(),
      url: z.string().url().optional(),
      cover: image().optional(),
      /** ordre d’affichage, petit = premier */
      order: z.number().default(100),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

/** Articles de blog — une entrée par (article, langue). Fichier : <slug>.<lang>.md */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      lang: langField,
      key: z.string(),
      title: z.string(),
      description: z.string(),
      published: z.coerce.date(),
      updated: z.coerce.date().optional(),
      cover: image().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects, posts };
