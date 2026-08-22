/**
 * Appwrite connection settings, read once at module load.
 *
 * The endpoint/project/table ids are also exposed with a NEXT_PUBLIC_ prefix so
 * they can be read in the browser if a client-side feature ever needs them.
 * `APPWRITE_API_KEY` deliberately has no such prefix -- it is a secret and must
 * never reach the bundle.
 */
/**
 * Reads a variable, treating blank as absent.
 *
 * `??` alone is not enough: a hosting dashboard stores a variable that was
 * added but left empty as the empty string, which is not nullish, so the
 * fallback never applies and the value silently becomes ''. That turned the
 * endpoint into '' in production, which made every Appwrite URL relative and
 * failed with ERR_INVALID_URL on a path like '/account/sessions/email'.
 * Whitespace is trimmed for the same reason -- a value that is only spaces is
 * a value nobody meant to set.
 */
function env(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/*
 * A trailing slash is stripped so callers can join paths with a leading slash
 * without producing '//', which Appwrite rejects on some routes.
 */
export const endpoint = env(
  'NEXT_PUBLIC_APPWRITE_ENDPOINT',
  'https://fra.cloud.appwrite.io/v1'
).replace(/\/+$/, '');

export const projectId = env('NEXT_PUBLIC_APPWRITE_PROJECT_ID');

export const databaseId = env('APPWRITE_DATABASE_ID', 'academy');

/** Tables created by `npm run appwrite:migrate`. */
export const tables = {
  /** Keyed text snippets swapped into the theme markup at render time. */
  content: env('APPWRITE_CONTENT_TABLE_ID', 'content'),
  /** Site-wide settings: colour palette, contact details, toggles. */
  settings: env('APPWRITE_SETTINGS_TABLE_ID', 'settings'),
  /** Registration enquiries submitted through the contact form. */
  enquiries: env('APPWRITE_ENQUIRIES_TABLE_ID', 'enquiries'),
};

/** Storage bucket for files attached to an enquiry (documents, photos). */
export const enquiryFilesBucketId = env(
  'APPWRITE_ENQUIRY_FILES_BUCKET_ID',
  'enquiry-files'
);

/** Kept as a named export for older imports. */
export const enquiriesTableId = tables.enquiries;
