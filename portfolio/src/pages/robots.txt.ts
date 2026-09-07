import type { APIRoute } from 'astro';
import { SITE } from '../consts';

const body = `User-agent: *
Allow: /

Sitemap: ${SITE.url.replace(/\/$/, '')}/sitemap-index.xml
`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
