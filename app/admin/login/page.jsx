import { redirect } from 'next/navigation';

import { createSession, isAuthenticated, verifyCredentials } from '../../../lib/appwrite/auth';

export const dynamic = 'force-dynamic';

/**
 * Admin sign-in.
 *
 * Uses a server action rather than a client component and a fetch: the
 * password is posted straight to the server and never touches client state.
 * The form still works with JavaScript disabled.
 */
export default async function LoginPage({ searchParams }) {
  if (await isAuthenticated()) redirect('/admin/enquiries');

  const params = await searchParams;
  const failed = params?.error === '1';

  async function signIn(formData) {
    'use server';

    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const userId = await verifyCredentials(email, password);
    if (!userId) redirect('/admin/login?error=1');

    await createSession(userId);
    redirect('/admin/enquiries');
  }

  return (
    <div className="admin-login">
      <div className="admin-panel">
        <h1 className="admin-title">ადმინში შესვლა</h1>
        <p className="admin-subtitle">გლდანი იუნაითედ აკადემია</p>

        {failed && (
          <p className="admin-msg error">ელფოსტა ან პაროლი არასწორია.</p>
        )}

        <form action={signIn}>
          <div className="admin-field">
            <label htmlFor="email">ელფოსტა</label>
            <input id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div className="admin-field">
            <label htmlFor="password">პაროლი</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="admin-btn">
            შესვლა
          </button>
        </form>
      </div>
    </div>
  );
}
