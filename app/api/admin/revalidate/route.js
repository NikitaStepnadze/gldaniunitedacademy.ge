import { isAuthenticated } from '../../../../lib/appwrite/auth';
import {
  PUBLIC_ROUTES,
  revalidateNews,
  revalidatePrograms,
  revalidateSite,
} from '../../../../lib/revalidate';

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

  /*
   * Every cache, not just the CMS one.
   *
   * This endpoint's whole reason to exist is content changed outside the panel
   * -- in the Appwrite console or by a script -- and the programmes and events
   * tables are exactly the kind of thing edited that way. Clearing only the CMS
   * tag would leave a row added in the console invisible for up to an hour,
   * which is the problem this route is meant to solve.
   */
  const ok = [revalidateSite(), revalidatePrograms(), revalidateNews()].every(
    Boolean
  );
  return Response.json({ ok, revalidated: PUBLIC_ROUTES });
}
