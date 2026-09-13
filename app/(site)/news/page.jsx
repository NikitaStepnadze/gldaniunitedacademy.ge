import ThemePage from '../ThemePage';

export const metadata = {
  title: 'სიახლეები და ღონისძიებები',
  description:
    'გლდანი იუნაითედ აკადემიის სიახლეები, ღონისძიებები და სასარგებლო რჩევები მშობლებისთვის — ვარჯიშები, ტურნირები და ბანაკები.',
  alternates: { canonical: '/news' },
};

/**
 * Cached until an admin saves an entry, which calls revalidatePath.
 * The number is a safety net for edits made outside the admin panel.
 */
export const revalidate = 3600;

/**
 * The news and events listing.
 *
 * Renders the same theme page the rest of the site does; the cards themselves
 * are substituted into its `<!--cms:news-->` and `<!--cms:events-all-->`
 * placeholders by ThemePage.
 *
 * The difference from the home page's events section is which entries appear:
 * this page asks for every published one rather than the two flagged for the
 * home page, and it lists the news posts the home page no longer carries at
 * all. Both are handled in ThemePage by the route -- see the note there.
 */
export default function Page() {
  return <ThemePage route="news" />;
}
