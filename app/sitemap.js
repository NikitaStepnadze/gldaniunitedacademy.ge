import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { getPublishedEvents } from '../lib/appwrite/events';
import { getPublishedPrograms } from '../lib/appwrite/programs';
import { SITE_URL } from '../lib/site';

const SITE_DIR = path.join(process.cwd(), 'app', '(site)');

/**
 * Per-route hints for the crawler.
 *
 * Priority and changeFrequency are advisory -- Google ignores both -- but they
 * cost nothing and other crawlers still read them. Anything not listed here
 * falls back to DEFAULT_HINT, so adding a page needs no edit.
 */
const HINTS = {
  '': { changeFrequency: 'weekly', priority: 1 },
  '/registration': { changeFrequency: 'monthly', priority: 0.9 },
  '/programs': { changeFrequency: 'monthly', priority: 0.9 },
  '/about': { changeFrequency: 'monthly', priority: 0.8 },
  // The listing changes whenever an entry is added, so it is crawled often.
  '/news': { changeFrequency: 'weekly', priority: 0.8 },
  '/contact': { changeFrequency: 'yearly', priority: 0.7 },
};

const DEFAULT_HINT = { changeFrequency: 'monthly', priority: 0.5 };

/**
 * Walks the (site) route group and returns one route per page.jsx found.
 *
 * Reading the filesystem rather than hardcoding the list keeps the sitemap
 * honest: a page that exists is listed, and a page that is deleted stops being
 * advertised, with no second place to remember to update. Route groups --
 * directories in parentheses -- contribute nothing to the URL, and dynamic
 * segments are skipped because they have no single concrete URL to emit.
 */
async function collectRoutes(dir = SITE_DIR, prefix = '') {
  const routes = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return routes;
  }

  if (entries.some((entry) => entry.isFile() && /^page\.(jsx?|tsx?)$/.test(entry.name))) {
    routes.push(prefix);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const { name } = entry;

    // Private folders and dynamic/catch-all segments are not crawlable URLs.
    if (name.startsWith('_') || name.startsWith('[') || name.startsWith('@')) continue;

    const isGroup = name.startsWith('(') && name.endsWith(')');
    routes.push(
      ...(await collectRoutes(path.join(dir, name), isGroup ? prefix : `${prefix}/${name}`))
    );
  }

  return routes;
}

/**
 * Uses the page file's own mtime as lastModified.
 *
 * The CMS only overrides text inside a page that already exists, so the file
 * is the closest thing to a real "last changed" signal available at request
 * time. Falls back to now when the file cannot be stat'd.
 */
async function lastModifiedFor(route) {
  const dir = path.join(SITE_DIR, route);

  for (const name of ['page.jsx', 'page.js', 'page.tsx', 'page.ts']) {
    try {
      return (await stat(path.join(dir, name))).mtime;
    } catch {
      // try the next extension
    }
  }

  return new Date();
}

/** Re-generated hourly, matching the public pages' revalidate window. */
export const revalidate = 3600;

/**
 * One entry per published programme.
 *
 * These cannot come from collectRoutes: they live under a `[slug]` segment,
 * which has no single concrete URL on disk, so the filesystem walk skips it by
 * design. The rows are the only place the real URLs exist.
 *
 * A failure returns nothing rather than throwing. A sitemap missing its
 * programme pages is a smaller problem than a sitemap that 500s, which costs
 * the crawler every other URL in the file too.
 */
async function programRoutes() {
  try {
    const programs = await getPublishedPrograms();
    return programs.map((program) => ({
      url: `${SITE_URL}/programs/${encodeURIComponent(program.slug)}`,
      lastModified: program.updatedAt ? new Date(program.updatedAt) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    }));
  } catch (error) {
    console.error('[sitemap] programmes unavailable:', error.message);
    return [];
  }
}

/**
 * One entry per published news post or event.
 *
 * Same reasoning as programRoutes: these live under a `[slug]` segment, which
 * the filesystem walk skips because it has no single concrete URL on disk.
 * These pages are the main reason the table exists -- each is an indexable page
 * the site did not have before -- so leaving them out of the sitemap would
 * waste most of the benefit.
 *
 * A failure returns nothing rather than throwing, for the same reason as the
 * programme routes: a sitemap missing some URLs beats one that 500s.
 */
async function newsRoutes() {
  try {
    const entries = await getPublishedEvents();
    return entries.map((entry) => ({
      url: `${SITE_URL}/news/${encodeURIComponent(entry.slug)}`,
      lastModified: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch (error) {
    console.error('[sitemap] news entries unavailable:', error.message);
    return [];
  }
}

export default async function sitemap() {
  const routes = await collectRoutes();

  const entries = await Promise.all(
    routes.map(async (route) => ({
      // <loc> must carry a path: the root route is the empty string, which
      // would otherwise emit a bare origin and be rejected as invalid.
      url: `${SITE_URL}${route || '/'}`,
      lastModified: await lastModifiedFor(route),
      ...(HINTS[route] ?? DEFAULT_HINT),
    }))
  );

  // Highest priority first, so the important pages lead the file.
  const [programs, news] = await Promise.all([programRoutes(), newsRoutes()]);

  return [...entries, ...programs, ...news].sort((a, b) => b.priority - a.priority);
}
