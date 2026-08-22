import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { endpoint, projectId } from './config';

/**
 * Admin authentication.
 *
 * Credentials are checked against Appwrite -- it owns the password hash, so
 * this code never sees or stores one. What Appwrite hands back on success is a
 * session cookie scoped to its own domain, which is not much use to us: the
 * admin panel needs to know "is this request from the admin?" on its own
 * domain, on every request.
 *
 * So on a successful check we mint our own signed cookie. It carries the user
 * id and an expiry, signed with ADMIN_SESSION_SECRET, and is verified with a
 * constant-time comparison. Rotating that secret invalidates every session.
 */
const COOKIE_NAME = 'gua_admin';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set');
  return secret;
}

function sign(payload) {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/**
 * Verifies an email/password pair against Appwrite.
 *
 * Uses the REST endpoint directly rather than a client: the server SDK needs a
 * `sessions.write` scope for this, and the browser SDK is not meant to run
 * here. A plain fetch with the public project id needs neither, and we only
 * care whether the credentials are accepted.
 *
 * Returns the user id on success, or null when the credentials are rejected.
 */
export async function verifyCredentials(email, password) {
  /*
   * Named explicitly, because the failure this prevents is unreadable: with a
   * blank endpoint the template below yields the bare path
   * '/account/sessions/email', and fetch rejects it as ERR_INVALID_URL --
   * an error that points at Appwrite's API rather than at the unset variable
   * that actually caused it.
   */
  if (!(endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
    throw new Error(`NEXT_PUBLIC_APPWRITE_ENDPOINT is not a valid URL: ${JSON.stringify(endpoint)}`);
  }
  if (!projectId) throw new Error('NEXT_PUBLIC_APPWRITE_PROJECT_ID is not set');

  const response = await fetch(`${endpoint}/account/sessions/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!response.ok) return null;

  const session = await response.json();

  // Appwrite created a session on its side; we do not use it, and leaving it
  // open would pile up dead sessions on the account. Best effort -- a failure
  // here must not stop a valid login.
  try {
    const { Client, Users } = await import('node-appwrite');
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(process.env.APPWRITE_API_KEY);
    await new Users(client).deleteSession({
      userId: session.userId,
      sessionId: session.$id,
    });
  } catch {
    // Ignore: the session expires on its own.
  }

  // Only the one configured account may sign in. Even a valid Appwrite user is
  // refused unless it is this id, so adding a user does not grant admin access.
  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId || session.userId !== adminId) return null;

  return session.userId;
}

/** Issues the signed session cookie. */
export async function createSession(userId) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Clears the session cookie. */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Returns the signed-in admin's user id, or null.
 *
 * Checks the signature before anything else, so a tampered cookie is rejected
 * without its contents being trusted even briefly.
 */
export async function getSessionUserId() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator === -1) return null;

  const payload = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);
  const expected = sign(payload);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [userId, expiresAt] = payload.split('.');
  if (!userId || Number(expiresAt) < Date.now()) return null;
  if (userId !== process.env.ADMIN_USER_ID) return null;

  return userId;
}

/** True when the current request carries a valid admin session. */
export async function isAuthenticated() {
  return (await getSessionUserId()) !== null;
}
