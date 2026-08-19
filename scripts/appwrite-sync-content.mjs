/**
 * Reconciles the content table with the data-cms anchors in the theme markup.
 *
 * The anchors are the source of truth: a key that no element carries can never
 * be shown, and an anchor with no row can never be edited. This script scans
 * the markup, adds rows for anchors that lack one, and reports rows whose
 * anchor has gone (it does not delete them -- that would throw away an admin's
 * text on a theme re-import).
 *
 *   npm run appwrite:sync-content
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { config } from 'dotenv';
import { Client, TablesDB, Query, ID } from 'node-appwrite';

config({ quiet: true });

const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';
const CONTENT_TABLE = process.env.APPWRITE_CONTENT_TABLE_ID ?? 'content';

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const tablesDB = new TablesDB(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

/** Human labels for keys, so the admin panel does not show raw dotted paths. */
const LABELS = {
  'home.hero.eyebrow': 'ჰერო — ზედა წარწერა',
  'home.hero.subtitle': 'ჰერო — აღწერა',
  'home.register.title': 'რეგისტრაციის ფორმა — სათაური',
  'home.register.note': 'რეგისტრაციის ფორმა — მინიშნება',
};

/** Keys whose copy runs long enough to want a textarea in the editor. */
const MULTILINE = new Set(['home.hero.subtitle']);

const CONTENT_DIR = path.join(process.cwd(), 'content', 'pages');
const ROUTE_TO_PAGE = { index: 'home', about: 'about', contact: 'contact' };

// Scan every page for anchors, remembering which page each key appeared on.
const found = new Map();

for (const file of readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.html'))) {
  const route = path.basename(file, '.html');
  const html = readFileSync(path.join(CONTENT_DIR, file), 'utf8');

  for (const match of html.matchAll(/data-cms="([^"]+)"/g)) {
    if (!found.has(match[1])) found.set(match[1], ROUTE_TO_PAGE[route] ?? route);
  }
}

console.log(`\nFound ${found.size} anchor(s) in the theme markup.\n`);

const existing = await tablesDB.listRows({
  databaseId,
  tableId: CONTENT_TABLE,
  queries: [Query.limit(200)],
});
const byKey = new Map(existing.rows.map((row) => [row.key, row]));

let added = 0;
for (const [key, page] of found) {
  if (byKey.has(key)) continue;

  await tablesDB.createRow({
    databaseId,
    tableId: CONTENT_TABLE,
    rowId: ID.unique(),
    data: {
      key,
      value: '',
      page,
      label: LABELS[key] ?? key,
      kind: MULTILINE.has(key) ? 'textarea' : 'text',
    },
  });
  console.log(`  + ${key}`);
  added += 1;
}

// Rows with no anchor cannot show up on the site. Report, never delete: the
// admin's text is worth more than a tidy table, and an anchor may come back.
const orphaned = existing.rows.filter((row) => !found.has(row.key));

console.log(`\n${added} row(s) added.`);

if (orphaned.length > 0) {
  console.log(`\n${orphaned.length} row(s) have no matching data-cms anchor:`);
  for (const row of orphaned) {
    const filled = row.value ? ' (has text)' : ' (empty)';
    console.log(`  - ${row.key}${filled}`);
  }
  console.log('\nThese cannot appear on the site until an anchor is added, or');
  console.log('they can be deleted in the Appwrite console if no longer wanted.');
}

console.log();
