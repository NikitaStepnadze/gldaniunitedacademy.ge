import ThemePage from '../ThemePage';

export const metadata = {
  title: 'ჩვენ შესახებ',
  description:
    'გლდანი იუნაითედ აკადემიის შესახებ — ჩვენი მწვრთნელები, სავარჯიშო პირობები და მიდგომა ბავშვების საფეხბურთო განვითარებაში.',
  alternates: { canonical: '/about' },
};

/**
 * Cached until an admin saves a CMS change, which calls revalidatePath.
 * The number is a safety net for edits made outside the admin panel.
 */
export const revalidate = 3600;

export default function Page() {
  return <ThemePage route="about" />;
}
