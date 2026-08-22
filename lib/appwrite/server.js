import 'server-only';

import { Client, TablesDB } from 'node-appwrite';

import { endpoint, projectId } from './config';

/**
 * Server-side Appwrite client, authenticated with the secret API key.
 *
 * This module is marked `server-only`: importing it from a client component is
 * a build error rather than a silent leak of `APPWRITE_API_KEY` into the
 * browser bundle.
 *
 * The client is built per call rather than at module scope so a missing key
 * surfaces as a handled request-time error instead of crashing the route on
 * first import -- and so the value is re-read after an env change in dev.
 *
 * This project runs against Appwrite Cloud 1.9.6, so the current `TablesDB`
 * API (tables/columns/rows) is the right one. The older `Databases` API
 * (collections/attributes/documents) is the deprecated path on 1.9.x -- it is
 * only required on servers older than 1.9.0, where `TablesDB` does not exist.
 */
export function getServerClient() {
  // Trimmed before the check: a variable pasted into a hosting dashboard with a
  // stray newline is set but unusable, and `!apiKey` alone would pass it
  // through to fail later as an opaque 401.
  const apiKey = process.env.APPWRITE_API_KEY?.trim();

  if (!projectId) throw new Error('NEXT_PUBLIC_APPWRITE_PROJECT_ID is not set');
  if (!apiKey) throw new Error('APPWRITE_API_KEY is not set');
  /*
   * Checked here rather than trusted from config: an endpoint that is blank or
   * not absolute makes every SDK call build a relative URL and fail with
   * ERR_INVALID_URL, which names only the path and not the missing setting.
   */
  if (!(endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
    throw new Error(`NEXT_PUBLIC_APPWRITE_ENDPOINT is not a valid URL: ${JSON.stringify(endpoint)}`);
  }

  return new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
}

/** TablesDB bound to the server client. */
export function getTablesDB() {
  return new TablesDB(getServerClient());
}
