import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../consts';

export type Project = CollectionEntry<'projects'>;
export type Post = CollectionEntry<'posts'>;

const isProd = import.meta.env.PROD;

/** Projets d’une langue, triés (order asc), brouillons exclus en prod. */
export async function getProjects(lang: Lang): Promise<Project[]> {
  const all = await getCollection('projects', (e) => e.data.lang === lang && (!isProd || !e.data.draft));
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** Articles d’une langue, du plus récent au plus ancien. */
export async function getPosts(lang: Lang): Promise<Post[]> {
  const all = await getCollection('posts', (e) => e.data.lang === lang && (!isProd || !e.data.draft));
  return all.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}

/** Retrouve l’équivalent d’une entrée dans l’autre langue (même `key`). */
export async function counterpart(
  collection: 'projects' | 'posts',
  key: string,
  otherLang: Lang,
): Promise<string | null> {
  const all = await getCollection(collection, (e: any) => e.data.key === key && e.data.lang === otherLang);
  return all[0]?.id ?? null;
}

/** Slug propre = la `key` (partagée entre langues), pas l’id de fichier. */
export function entrySlug(entry: Project | Post): string {
  return entry.data.key;
}
