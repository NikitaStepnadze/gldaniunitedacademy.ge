/**
 * Rewrites Georgian slugs as Latin ones, once.
 *
 * The events table shipped with native Georgian slugs. They are valid URLs, but
 * Georgian is three bytes per character in UTF-8, so a short headline becomes a
 * ~120-byte percent-encoded string the moment it is pasted into Facebook,
 * WhatsApp or SMS -- and the same encoded form is what Search Console and
 * Analytics report. See lib/slug.js for the full reasoning.
 *
 * This is a one-off. Slugs are otherwise immutable by design: `updateEntryAction`
 * never rewrites one, precisely so a shared link or an indexed URL keeps
 * working. Running this deliberately breaks that rule for every row it touches,
 * which is safe only while the URLs are young -- nothing has been indexed or
 * shared yet. Do not run it once the site is live; add a redirect instead.
 *
 * Idempotent and conservative:
 *  - A row whose slug is already pure ASCII is left alone, so a re-run is a
 *    no-op and a slug an admin chose by hand is never overwritten.
 *  - The new slug is derived from the row's own title through the same
 *    `slugify` the admin panel uses, so what this writes is exactly what
 *    creating the row today would produce.
 *  - Collisions are resolved with a numeric suffix rather than skipped, since
 *    the unique index would otherwise reject the write.
 *
 *   node scripts/appwrite-relatinise-slugs.mjs          # show what would change
 *   node scripts/appwrite-relatinise-slugs.mjs --apply  # write it
 */
import { config } from 'dotenv';
import { Client, TablesDB, Query } from 'node-appwrite';

import { slugify } from '../lib/slug.js';

config({ quiet: true });

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';

const TABLES = [
  { id: process.env.APPWRITE_EVENTS_TABLE_ID ?? 'events', fallback: 'post' },
  { id: process.env.APPWRITE_PROGRAMS_TABLE_ID ?? 'programs', fallback: 'program' },
];

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);

const apply = process.argv.includes('--apply');

/** True when a slug needs no work: it is already a plain ASCII URL segment. */
function isLatin(slug) {
  return /^[a-z0-9-]+$/.test(String(slug ?? ''));
}

/** Every row of a table, following pagination. */
async function listAll(tableId) {
  const rows = [];
  let cursor;

  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({ databaseId, tableId, queries });
    rows.push(...page.rows);

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return rows;
}

console.log(`\nRe-latinising slugs -> ${endpoint} (project ${projectId})`);
console.log(apply ? '  MODE: writing\n' : '  MODE: dry run -- pass --apply to write\n');

let changed = 0;
let kept = 0;

for (const { id: tableId, fallback } of TABLES) {
  let rows;
  try {
    rows = await listAll(tableId);
  } catch (error) {
    console.log(`Table: ${tableId}  -- skipped (${error.message})\n`);
    continue;
  }

  console.log(`Table: ${tableId} (${rows.length} rows)`);

  // Seeded with every slug already present, so a new one cannot collide with a
  // row this run is leaving alone.
  const taken = new Set(rows.map((row) => row.slug).filter(Boolean));

  for (const row of rows) {
    if (isLatin(row.slug)) {
      kept += 1;
      console.log(`  . ${row.slug}`);
      continue;
    }

    let next = slugify(row.title, fallback);
    if (taken.has(next)) {
      for (let n = 2; n < 1000; n += 1) {
        if (!taken.has(`${next}-${n}`)) {
          next = `${next}-${n}`;
          break;
        }
      }
    }

    taken.delete(row.slug);
    taken.add(next);
    changed += 1;

    console.log(`  ~ ${row.slug}`);
    console.log(`    -> ${next}`);

    if (apply) {
      await tablesDB.updateRow({
        databaseId,
        tableId,
        rowId: row.$id,
        data: { slug: next },
      });
    }
  }

  console.log('');
}

console.log(`${changed} to rewrite, ${kept} already Latin.`);

if (changed > 0 && !apply) {
  console.log('\nRe-run with --apply to write these.');
} else if (apply && changed > 0) {
  console.log('\nDone. The old URLs no longer resolve -- re-check any link you have shared.');
}

console.log('');
