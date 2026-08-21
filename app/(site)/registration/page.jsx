import RegistrationForm from '../../components/RegistrationForm';
import ThemePage from '../ThemePage';

export const metadata = {
  title: 'რეგისტრაცია | გლდანი იუნაითედ აკადემია',
  description:
    'შეავსეთ ჩარიცხვის განაცხადი: ბავშვისა და მშობლის მონაცემები, ფოტო და საბუთები. დაგიკავშირდებით 1–2 სამუშაო დღეში.',
};

/**
 * Cached until an admin saves a CMS change, which calls revalidatePath.
 * The number is a safety net for edits made outside the admin panel.
 */
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <ThemePage route="registration" />
      <RegistrationForm />
    </>
  );
}
