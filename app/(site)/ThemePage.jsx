import { getContentMap, getSettingsMap } from '../../lib/appwrite/content';
import { getEventsOfKind, getFeaturedEvents } from '../../lib/appwrite/events';
import { getFeaturedPrograms, getPublishedPrograms } from '../../lib/appwrite/programs';
import {
  applyContactSettings,
  applyContent,
  applyEvents,
  applyEventsAll,
  applyNews,
  applyPrograms,
} from '../../lib/cms';
import { renderEventCards, renderNewsList } from '../../lib/events-markup';
import { renderProgramCards } from '../../lib/programs-markup';
import { getPageMarkup } from '../../lib/pages';

/**
 * Renders one page of the original theme, with any CMS overrides applied.
 *
 * The body markup is injected verbatim so the rendered DOM matches the static
 * template exactly. Stylesheets and scripts are emitted by the root layout --
 * see the note there for why neither can live in this tree.
 *
 * `suppressHydrationWarning` is required, not cosmetic. The theme's scripts are
 * deferred, so jQuery, Swiper, Owl and WOW all run before React hydrates and
 * they rewrite this subtree as they initialise -- wrapping carousels, injecting
 * countdown markup, adding state classes. React would otherwise compare its
 * server-rendered string against that already-mutated DOM and report a
 * mismatch on every page. The content is static server-rendered HTML that React
 * never re-renders, so opting its children out of hydration checking is safe.
 *
 * If the content lookup fails -- Appwrite unreachable, quota exhausted -- the
 * page still renders with the theme's own copy. A CMS outage must not take the
 * public site down with it.
 */
export default async function ThemePage({ route }) {
  const markup = await getPageMarkup(route);

  let content = {};
  let settings = {};
  /*
   * Each list is fetched unconditionally and every substitution is a no-op on a
   * page that does not carry its marker -- applyEvents and its siblings return
   * the markup untouched when the placeholder is absent. Keying the fetches off
   * the route would put the same fact in two places and leave a page carrying a
   * placeholder silently unfilled.
   */
  let events = [];
  let programs = [];
  let news = [];

  /*
   * How many rows each listing asks for is the one thing that does depend on
   * the route.
   *
   * The home page's sections are fixed-size rows showing the flagged entries,
   * while /programs and /news are the full listings. Both render the identical
   * card markup, so this is a difference of how many rows are asked for, not of
   * what is done with them.
   */
  const allPrograms = route === 'programs';
  const isNews = route === 'news';

  try {
    // Every read is cached under its own tag, so this is one round trip's worth
    // of work on a cold cache and none on a warm one.
    [content, settings, events, programs, news] = await Promise.all([
      getContentMap(),
      getSettingsMap(),
      isNews ? getEventsOfKind('event') : getFeaturedEvents(),
      allPrograms ? getPublishedPrograms() : getFeaturedPrograms(),
      // Only /news lists the blog cards; nothing else carries their marker.
      isNews ? getEventsOfKind('news') : [],
    ]);
  } catch (error) {
    console.error('[cms] content unavailable, using theme defaults:', error.message);
  }

  /*
   * The same cards serve both event placeholders.
   *
   * `<!--cms:events-->` is the home page's two-card row and
   * `<!--cms:events-all-->` is the full listing on /news, but no page carries
   * both -- so whichever marker is present gets the list this route asked for,
   * and the other substitution finds nothing to do.
   */
  const eventCards = renderEventCards(events);

  // Contact details are a site-wide setting rather than a per-element content
  // row, so they are substituted after the content overrides are in place.
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

  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
