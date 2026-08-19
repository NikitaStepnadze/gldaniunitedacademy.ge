import { redirect } from 'next/navigation';

import { destroySession } from '../../../../lib/appwrite/auth';

export const dynamic = 'force-dynamic';

/** POST-only: a link prefetch must never be able to sign the admin out. */
export async function POST() {
  await destroySession();
  redirect('/admin/login');
}
