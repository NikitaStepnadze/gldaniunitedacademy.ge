import { SITE_URL } from '../lib/site';

/**
 * Keeps the admin panel and API routes out of the index, and tells crawlers
 * where the sitemap lives. Google reads the sitemap line here even when the
 * file has not been submitted in Search Console.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
