import { getContentMap } from '../../lib/appwrite/content';
import { applyContent } from '../../lib/cms';
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
  try {
    content = await getContentMap();
  } catch (error) {
    console.error('[cms] content unavailable, using theme defaults:', error.message);
  }

  return (
    <div
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: applyContent(markup, content) }}
    />
  );
}
