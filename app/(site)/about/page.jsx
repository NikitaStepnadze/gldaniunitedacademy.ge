import ThemePage from '../ThemePage';

/**
 * Cached until an admin saves a CMS change, which calls revalidatePath.
 * The number is a safety net for edits made outside the admin panel.
 */
export const revalidate = 3600;

export default function Page() {
  return <ThemePage route="about" />;
}
