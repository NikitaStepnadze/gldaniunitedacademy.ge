import { notFound } from 'next/navigation';

import { getContentMap, getSettingsMap } from '../../../../lib/appwrite/content';
import { getEventBySlug, getPublishedEvents } from '../../../../lib/appwrite/events';
import { applyContactSettings, applyContent } from '../../../../lib/cms';
import { renderEntryPage } from '../../../../lib/events-markup';
import { getPageMarkup } from '../../../../lib/pages';

/**
 * One news entry's or event's own page.
 *
 * This is what turns a card into something worth linking to: every entry is a
 * crawlable URL with its own heading, photo and body, instead of six cards all
 * pointing at the contact form.
 *
 * It does not go through <ThemePage> like the listing routes. Those render a
 * fixed template whose only variable is the CMS map; this one is a template
 * plus one specific row, so it does the same substitutions itself and adds the
 * entry on top.
 */
export const revalidate = 3600;

/**
 * Pre-renders a page per published entry at build time.
 *
 * These pages exist to be indexed, so they should be static HTML a crawler
 * gets without waiting on a database round trip. An entry created afterwards
 * still works -- `dynamicParams` defaults to true, so an unknown slug is
 * rendered on demand and then cached.
 */
export async function generateStaticParams() {
  try {
    const entries = await getPublishedEvents();
    return entries.map((entry) => ({ slug: entry.slug }));
  } catch {
    // A build that cannot reach Appwrite should still produce a site; the
    // pages are then rendered on demand instead.
    return [];
  }
}

/**
 * Per-entry metadata, which is most of the point of these pages.
 *
 * The title and description come from what the admin wrote, so each entry is a
 * distinct result in a search listing rather than one of ten pages sharing the
 * site's default description.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  let entry = null;
  try {
    entry = await getEventBySlug(decodeURIComponent(slug));
  } catch {
    // A malformed escape sequence or an unreachable CMS: either way there is no
    // entry to describe, and the page below will answer with a 404.
  }

  if (!entry) return { title: 'სიახლე ვერ მოიძებნა' };

  // The excerpt is the admin's own summary; the body is the fallback so an
  // entry written without one still gets a description rather than none.
  const description =
    entry.excerpt.trim() || entry.body.trim().slice(0, 200) || undefined;

  return {
    title: entry.title,
    ...(description ? { description } : {}),
    alternates: { canonical: `/news/${encodeURIComponent(entry.slug)}` },
    openGraph: {
      title: entry.title,
      ...(description ? { description } : {}),
      type: 'article',
      // Only a real uploaded photo is advertised. Naming the theme's stock
      // default here would put the same picture on every entry's share card.
      ...(entry.image ? { images: [entry.image] } : {}),
    },
  };
}

export default async function NewsEntryPage({ params }) {
  const { slug } = await params;

  /*
   * The segment arrives percent-encoded because the slugs are Georgian, and
   * what is stored is the decoded form. Decoding is wrapped: a malformed
   * escape sequence in a hand-typed URL throws URIError, which would surface
   * as a 500 on what is really just a page that does not exist.
   */
  let decoded;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    notFound();
  }

  const entry = await getEventBySlug(decoded);
  if (!entry) notFound();

  const markup = await getPageMarkup('news-single');

  let content = {};
  let settings = {};
  try {
    [content, settings] = await Promise.all([getContentMap(), getSettingsMap()]);
  } catch (error) {
    console.error('[cms] content unavailable, using theme defaults:', error.message);
  }

  /*
   * The entry is substituted first, then the CMS overrides.
   *
   * The other way round, an admin's override could land inside the template
   * before the entry's own values did, and a `data-cms` element that ends up
   * holding entry text would be rewritten by a row meant for the chrome. Doing
   * the entry first means the CMS pass only ever sees the shared header, footer
   * and breadcrumbs -- which is all it is for.
   */
  const html = applyContactSettings(
    applyContent(renderEntryPage(markup, entry), content),
    settings
  );

  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
