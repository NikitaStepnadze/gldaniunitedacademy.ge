import { isAuthenticated } from '../../../../lib/appwrite/auth';
import { PUBLIC_ROUTES, revalidateSite } from '../../../../lib/revalidate';

export const dynamic = 'force-dynamic';

/**
 * Forces the public pages to re-read the CMS.
 *
 * The admin save actions already do this themselves; this endpoint exists for
 * the case where content was changed outside the panel -- directly in the
 * Appwrite console, or by a script -- and the site needs to catch up without
 * waiting for the hourly revalidation.
 */
export async function POST() {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const ok = revalidateSite();
  return Response.json({ ok, revalidated: PUBLIC_ROUTES });
}
