import EnquiryForms from '../../components/EnquiryForms';
import ThemePage from '../ThemePage';

export const metadata = {
  title: 'კონტაქტი',
  description:
    'დაგვიკავშირდით — გლდანი იუნაითედ აკადემიის მისამართი, ტელეფონი და საკონტაქტო ფორმა.',
  alternates: { canonical: '/contact' },
};

/**
 * Cached until an admin saves a CMS change, which calls revalidatePath.
 * The number is a safety net for edits made outside the admin panel.
 */
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <ThemePage route="contact" />
      <EnquiryForms />
    </>
  );
}
