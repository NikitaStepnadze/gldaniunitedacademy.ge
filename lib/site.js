/**
 * The site's canonical origin, without a trailing slash.
 *
 * Everything that has to emit an absolute URL -- the sitemap, robots.txt, the
 * metadataBase in the root layout -- reads it from here, so the canonical host
 * is stated once. Vercel preview deployments can override it via
 * NEXT_PUBLIC_SITE_URL; production uses the real domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gldaniunitedacademy.ge'
).replace(/\/+$/, '');
