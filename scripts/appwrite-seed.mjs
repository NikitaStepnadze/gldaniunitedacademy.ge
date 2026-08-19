/**
 * Seeds the settings and content tables with the site's current values.
 *
 * Run after `npm run appwrite:migrate`. Idempotent: a key that already has a
 * row is left alone, so an admin's edits are never overwritten by a re-run.
 * Only genuinely new keys are inserted.
 *
 *   npm run appwrite:seed
 */
import { config } from 'dotenv';
import { Client, TablesDB, Query, ID } from 'node-appwrite';

config({ quiet: true });

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';
const CONTENT_TABLE = process.env.APPWRITE_CONTENT_TABLE_ID ?? 'content';
const SETTINGS_TABLE = process.env.APPWRITE_SETTINGS_TABLE_ID ?? 'settings';

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);

/**
 * The theme palette, read from public/stylesheets/colors/color1.css.
 *
 * These are the variables the stylesheet actually keys off, so overriding them
 * at render time restyles the whole site without touching the CSS file.
 */
const COLORS = [
  { key: 'color.navy', value: '#16244f', label: 'Primary navy' },
  { key: 'color.navy-deep', value: '#101a3a', label: 'Navy (dark)' },
  { key: 'color.navy-soft', value: '#22346b', label: 'Navy (soft)' },
  { key: 'color.gold', value: '#c9a227', label: 'Accent gold' },
  { key: 'color.gold-light', value: '#e0bf55', label: 'Gold (light)' },
  { key: 'color.gold-dark', value: '#a5821c', label: 'Gold (dark)' },
  { key: 'color.surface', value: '#f5f7fb', label: 'Surface' },
  { key: 'color.line', value: '#dde3ef', label: 'Border line' },
  { key: 'color.secondary', value: '#4a5570', label: 'Secondary text' },
  { key: 'color.interactive', value: '#2f5fbf', label: 'Link / interactive' },
];

const SETTINGS = [
  ...COLORS.map((c) => ({ ...c, kind: 'color', group: 'colors' })),
  {
    key: 'contact.email',
    value: '',
    kind: 'email',
    group: 'contact',
    label: 'Contact email',
  },
  {
    key: 'contact.phone',
    value: '',
    kind: 'phone',
    group: 'contact',
    label: 'Contact phone',
  },
  {
    key: 'contact.address',
    value: '',
    kind: 'text',
    group: 'contact',
    label: 'Address',
  },
  {
    key: 'notify.enquiryEmail',
    value: '',
    kind: 'email',
    group: 'contact',
    label: 'Send new enquiries to',
  },
];

/**
 * Editable text snippets.
 *
 * Values are left empty on purpose: an empty value means "use whatever the
 * theme markup already says". The row exists so the field shows up in the
 * admin panel; the moment an admin types something it takes over. That way
 * seeding never has to duplicate the Georgian copy already in the HTML, and
 * the two can never drift apart.
 */
const CONTENT = [
  { key: 'home.hero.title', page: 'home', label: 'Hero heading', kind: 'text' },
  { key: 'home.hero.subtitle', page: 'home', label: 'Hero subheading', kind: 'textarea' },
  { key: 'home.hero.cta', page: 'home', label: 'Hero button text', kind: 'text' },
  { key: 'home.about.title', page: 'home', label: 'About section heading', kind: 'text' },
  { key: 'home.about.body', page: 'home', label: 'About section text', kind: 'textarea' },
  { key: 'about.title', page: 'about', label: 'Page heading', kind: 'text' },
  { key: 'about.body', page: 'about', label: 'Page text', kind: 'textarea' },
  { key: 'contact.title', page: 'contact', label: 'Page heading', kind: 'text' },
  { key: 'contact.intro', page: 'contact', label: 'Intro text', kind: 'textarea' },
  { key: 'contact.formNote', page: 'contact', label: 'Note above the form', kind: 'textarea' },
];

/** Inserts a row only when its key is absent, so admin edits survive re-runs. */
async function seed(tableId, rows) {
  let created = 0;
  let kept = 0;

  for (const row of rows) {
    const found = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [Query.equal('key', row.key), Query.limit(1)],
    });

    if (found.total > 0) {
      kept += 1;
      continue;
    }

    await tablesDB.createRow({
      databaseId,
      tableId,
      rowId: ID.unique(),
      data: { value: '', ...row },
    });
    created += 1;
    console.log(`  + ${row.key}`);
  }

  console.log(`  ${tableId}: ${created} added, ${kept} left untouched`);
}

console.log(`\nSeeding -> ${endpoint} (project ${projectId})\n`);
console.log('Settings');
await seed(SETTINGS_TABLE, SETTINGS);
console.log('\nContent');
await seed(CONTENT_TABLE, CONTENT);
console.log('\nDone.\n');
