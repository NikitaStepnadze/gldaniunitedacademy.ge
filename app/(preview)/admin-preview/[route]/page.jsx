import { notFound } from 'next/navigation';

import { isAuthenticated } from '../../../../lib/appwrite/auth';
import { getContentMap, getSettingsMap } from '../../../../lib/appwrite/content';
import { getEventsOfKind, getFeaturedEvents } from '../../../../lib/appwrite/events';
import {
  getFeaturedPrograms,
  getPublishedPrograms,
} from '../../../../lib/appwrite/programs';
import {
  applyContactSettings,
  applyContent,
  applyEvents,
  applyEventsAll,
  applyNews,
  applyPrograms,
  buildColorOverrides,
} from '../../../../lib/cms';
import { renderEventCards, renderNewsList } from '../../../../lib/events-markup';
import { renderProgramCards } from '../../../../lib/programs-markup';
import { getPageMarkup } from '../../../../lib/pages';

import PreviewFrame from './PreviewFrame';

/**
 * The page the admin editor shows inside its preview iframe.
 *
 * It renders the real theme markup with the real stylesheets -- the document
 * itself comes from the layout in this route group -- so what the admin sees is
 * the actual site rather than an approximation. Two things make it a preview
 * rather than just the public page:
 *
 *  - Draft values arrive over postMessage from the editor and are applied in
 *    the browser as the admin types, without anything being saved.
 *  - It is never cached or indexed, and it 404s without an admin session.
 *
 * The saved values are rendered server-side first, so the frame is correct on
 * load and stays correct for every field the admin has not touched.
 *
 * ROUTES is an allow-list rather than a pass-through to getPageMarkup: the
 * segment reaches a filesystem path, and a traversal like `..%2F..%2F.env`
 * must not be able to read a file outside content/pages.
 */
const ROUTES = new Set([
  'index',
  'about',
  'contact',
  'registration',
  'programs',
  'news',
]);

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }) {
  if (!(await isAuthenticated())) notFound();

  const { route } = await params;
  if (!ROUTES.has(route)) notFound();

  const markup = await getPageMarkup(route);

  let content = {};
  let settings = {};
  let colorOverrides = null;
  /*
   * The card listings are read here too, not only on the public pages.
   *
   * Without them the preview shows the raw `<!--cms:...-->` comments where the
   * cards belong -- or, worse, the empty-list branch strips the whole section,
   * so an admin editing the heading above it sees the section vanish. The
   * preview has to make the same substitutions the public page makes, for the
   * same reason it renders the same markup: what it shows has to be the site.
   */
  let events = [];
  let programs = [];
  let news = [];

  // Same route branch as ThemePage: the listing pages show every row, the home
  // page only the flagged ones.
  const allPrograms = route === 'programs';
  const isNews = route === 'news';

  try {
    [content, settings, events, programs, news] = await Promise.all([
      getContentMap(),
      getSettingsMap(),
      isNews ? getEventsOfKind('event') : getFeaturedEvents(),
      allPrograms ? getPublishedPrograms() : getFeaturedPrograms(),
      isNews ? getEventsOfKind('news') : [],
    ]);
    colorOverrides = buildColorOverrides(settings);
  } catch (error) {
    console.error('[preview] CMS unavailable, showing theme defaults:', error.message);
  }

  const eventCards = renderEventCards(events);

  // Same substitutions the public page makes, so the preview shows the saved
  // contact details and the real cards rather than the theme's originals.
  const html = applyNews(
    applyEventsAll(
      applyPrograms(
        applyEvents(
          applyContactSettings(applyContent(markup, content), settings),
          eventCards
        ),
        renderProgramCards(programs)
      ),
      eventCards
    ),
    renderNewsList(news)
  );

  return (
    <>
      {colorOverrides && (
        <style id="cms-colors" dangerouslySetInnerHTML={{ __html: colorOverrides }} />
      )}
      {/*
        suppressHydrationWarning for the same reason as the public page: the
        theme's deferred scripts rewrite this subtree before React hydrates.
      */}
      <div
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <PreviewFrame route={route} />
    </>
  );
}
