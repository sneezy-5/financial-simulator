import { getCollection } from 'astro:content';
import type { Lang } from '../consts';

type Coll = 'projects' | 'posts';

/**
 * getStaticPaths partagé pour les pages [slug] : une route par entrée d’une
 * langue, avec `hasAlt` indiquant si la traduction existe (pour le hreflang).
 */
export async function slugPaths(collection: Coll, lang: Lang) {
  const all = await getCollection(collection);
  const keysOtherLang = new Set(
    all.filter((e: any) => e.data.lang !== lang).map((e: any) => e.data.key),
  );
  return all
    .filter((e: any) => e.data.lang === lang && (!import.meta.env.PROD || !e.data.draft))
    .map((entry: any) => ({
      params: { slug: entry.data.key as string },
      props: { entry, hasAlt: keysOtherLang.has(entry.data.key) },
    }));
}
