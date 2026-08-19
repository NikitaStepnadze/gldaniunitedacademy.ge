/**
 * Appwrite connection settings, read once at module load.
 *
 * The endpoint/project/table ids are also exposed with a NEXT_PUBLIC_ prefix so
 * they can be read in the browser if a client-side feature ever needs them.
 * `APPWRITE_API_KEY` deliberately has no such prefix -- it is a secret and must
 * never reach the bundle.
 */
export const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';

export const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? '';

export const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';

/** Tables created by `npm run appwrite:migrate`. */
export const tables = {
  /** Keyed text snippets swapped into the theme markup at render time. */
  content: process.env.APPWRITE_CONTENT_TABLE_ID ?? 'content',
  /** Site-wide settings: colour palette, contact details, toggles. */
  settings: process.env.APPWRITE_SETTINGS_TABLE_ID ?? 'settings',
  /** Registration enquiries submitted through the contact form. */
  enquiries: process.env.APPWRITE_ENQUIRIES_TABLE_ID ?? 'enquiries',
};

/** Storage bucket for files attached to an enquiry (documents, photos). */
export const enquiryFilesBucketId =
  process.env.APPWRITE_ENQUIRY_FILES_BUCKET_ID ?? 'enquiry-files';

/** Kept as a named export for older imports. */
export const enquiriesTableId = tables.enquiries;
