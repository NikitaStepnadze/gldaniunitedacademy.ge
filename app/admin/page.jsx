import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../lib/appwrite/auth';

export const dynamic = 'force-dynamic';

/** /admin is not a page of its own -- send the visitor where they belong. */
export default async function AdminIndex() {
  redirect((await isAuthenticated()) ? '/admin/enquiries' : '/admin/login');
}
