import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';

import { CMS_TAG } from './appwrite/content';

/**
 * Every public route whose HTML embeds CMS content.
 *
 * Listed explicitly rather than derived, because this is the list that has to
 * be purged when an admin saves and there is no way to ask Next which cached
 * pages happened to read a given row.
 *
 * Keep in step with `app/(site)/`: a new public page that renders <ThemePage>
 * must be added here or its edits will sit behind the hourly revalidation.
 */
export const PUBLIC_ROUTES = ['/', '/about', '/contact', '/registration'];

/**
 * Drops every cache holding CMS content, so a save shows on the site at once.
 *
 * Three separate caches have to be cleared, and clearing only some of them is
 * exactly the bug this function exists to fix -- the admin saved, the preview
 * showed the new text (it applies the draft in the browser and never consults
 * a cache at all), and the public page kept serving the old copy.
 *
 *  1. `revalidateTag(CMS_TAG)` drops the `unstable_cache` wrapper around the
 *     Appwrite reads in lib/appwrite/content.js. Necessary, but on its own it
 *     only guarantees the *next* render reads fresh rows -- it does not force
 *     that render to happen.
 *
 *  2. Each public page carries `export const revalidate = 3600`, which puts its
 *     rendered HTML in the full route cache for an hour. Until that entry is
 *     dropped, no render happens, so the fresh rows from (1) are never read and
 *     the visitor keeps getting hour-old HTML. `revalidatePath` per route is
 *     what drops it.
 *
 *  3. The layout is purged too, because `app/(site)/layout.jsx` reads the
 *     settings map for the colour overrides -- a palette change lives in the
 *     layout's output, not the page's.
 *
 * Why per-route rather than the single `revalidatePath('/', 'layout')` this
 * replaced: that call is documented to purge everything under the root layout,
 * but the admin panel is a *sibling route group* with its own `<html>`, so the
 * save action runs under `app/admin/layout.jsx` and the path it names resolves
 * against a different layout tree than the one the public pages are built from.
 * Naming each public route removes the ambiguity -- there is nothing left to
 * resolve.
 *
 * Failures are swallowed per call. A save that reached the database has
 * succeeded; if one purge then fails, the right outcome is a page that is stale
 * for up to an hour, not an error telling the admin their saved edit was lost.
 */
export function revalidateSite() {
  const failures = [];

  try {
    revalidateTag(CMS_TAG);
  } catch (error) {
    failures.push(`tag:${error.message}`);
  }

  for (const route of PUBLIC_ROUTES) {
    try {
      // 'page' rather than the default: these routes have no dynamic segments,
      // so the page entry is the whole of what is cached for them.
      revalidatePath(route, 'page');
    } catch (error) {
      failures.push(`${route}:${error.message}`);
    }
  }

  // The layout carries the colour overrides; see (3) above.
  try {
    revalidatePath('/', 'layout');
  } catch (error) {
    failures.push(`layout:${error.message}`);
  }

  if (failures.length > 0) {
    console.error('[cms] partial revalidation:', failures.join(', '));
  }

  return failures.length === 0;
}
