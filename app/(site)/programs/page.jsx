import ThemePage from '../ThemePage';

export const metadata = {
  title: 'პროგრამები',
  description:
    'გლდანი იუნაითედ აკადემიის სავარჯიშო პროგრამები ასაკობრივი ჯგუფების მიხედვით — ვარჯიშის სიხშირე, შინაარსი და მიზნები.',
  alternates: { canonical: '/programs' },
};

/**
 * Cached until an admin saves a programme, which calls revalidatePath.
 * The number is a safety net for edits made outside the admin panel.
 */
export const revalidate = 3600;

/**
 * The programmes listing.
 *
 * Renders the same theme page the rest of the site does; the cards themselves
 * are substituted into its `<!--cms:programs-->` placeholder by ThemePage.
 *
 * The one difference from the home page's section is which programmes appear:
 * this page asks for every published one rather than the three flagged for the
 * home page. That is handled in ThemePage by the route -- see the note there.
 */
export default function Page() {
  return <ThemePage route="programs" />;
}
