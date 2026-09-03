/**
 * Syncs the content table with the markers actually present in the theme HTML.
 *
 * The HTML is the source of truth for *which* fields exist: a field is editable
 * because an element carries `data-cms="key"` or `data-cms-img="key"`. This
 * script reads those markers, creates a row for any key that has none yet, and
 * reports keys whose row exists but whose marker is gone.
 *
 * Values are left empty on purpose: an empty value means "use whatever the
 * theme markup already says". The row exists so the field appears in the admin
 * panel; the moment an admin types something, that takes over. So seeding never
 * duplicates the Georgian copy already in the HTML, and the two cannot drift.
 *
 * Idempotent -- re-running never overwrites an admin's edit. Run it after any
 * change to the markers in content/pages/*.html.
 *
 *   npm run appwrite:sync-cms
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';
import { Client, TablesDB, Query, ID } from 'node-appwrite';

config({ quiet: true });

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';
const CONTENT_TABLE = process.env.APPWRITE_CONTENT_TABLE_ID ?? 'content';

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);

const PAGES_DIR = path.join(process.cwd(), 'content', 'pages');

/**
 * Human labels for the key segments, so the admin panel reads like the site
 * rather than like a database. A key not covered here still works -- it just
 * falls back to a prettified version of its own last segment.
 */
const SECTION_LABELS = {
  slide1: 'სლაიდი 1',
  slide2: 'სლაიდი 2',
  slide3: 'სლაიდი 3',
  about: 'ჩვენ შესახებ',
  section1: 'სექცია 1',
  section2: 'სექცია 2',
  section3: 'სექცია 3',
  section4: 'სექცია 4',
  section5: 'სექცია 5',
  benefit1: 'უპირატესობა 1',
  benefit2: 'უპირატესობა 2',
  benefit3: 'უპირატესობა 3',
  benefit4: 'უპირატესობა 4',
  counter1: 'მთვლელი 1',
  counter2: 'მთვლელი 2',
  counter3: 'მთვლელი 3',
  counter4: 'მთვლელი 4',
  coach1: 'მწვრთნელი 1',
  coach2: 'მწვრთნელი 2',
  coach3: 'მწვრთნელი 3',
  coach4: 'მწვრთნელი 4',
  program1: 'პროგრამა 1',
  program2: 'პროგრამა 2',
  program3: 'პროგრამა 3',
  news1: 'სიახლე 1',
  news2: 'სიახლე 2',
  news3: 'სიახლე 3',
  news4: 'სიახლე 4',
  news: 'სიახლეები',
  review1: 'შეფასება 1',
  review2: 'შეფასება 2',
  review3: 'შეფასება 3',
  quote1: 'ციტატა 1',
  quote2: 'ციტატა 2',
  event1: 'ღონისძიება 1',
  // The theme reuses the `post` class for the about-section body copy and for
  // the role line under each testimonial, so these four are not one section.
  post1: 'ჩვენ შესახებ',
  post2: 'შეფასება 1',
  post3: 'შეფასება 2',
  post4: 'შეფასება 3',
  cta: 'ჩაწერის ბანერი',
  registerBar: 'რეგისტრაციის ზოლი',
  hero: 'სათაური',
  footer: 'ფუტერი',
  mission: 'მისია და მიდგომა',
};

const FIELD_LABELS = {
  title: 'სათაური',
  eyebrow: 'ზედა წარწერა',
  text: 'ტექსტი',
  badge: 'ნიშანი',
  formTitle: 'ფორმის სათაური',
  formNote: 'ფორმის შენიშვნა',
  position: 'პოზიცია',
  name: 'სახელი',
  role: 'თანამდებობა',
  age: 'ასაკობრივი ჯგუფი',
  frequency: 'სიხშირე',
  number: 'რიცხვი',
  label: 'წარწერა',
  trust: 'ნდობის წარწერა',
  tab1Title: 'ტაბი 1 — სათაური',
  tab2Title: 'ტაბი 2 — სათაური',
  tab1Text: 'ტაბი 1 — ტექსტი',
  tab2Text: 'ტაბი 2 — ტექსტი',
  tab1Bullet1: 'ტაბი 1 — პუნქტი 1',
  tab1Bullet2: 'ტაბი 1 — პუნქტი 2',
  tab1Bullet3: 'ტაბი 1 — პუნქტი 3',
  tab1Bullet4: 'ტაბი 1 — პუნქტი 4',
  tab2Bullet1: 'ტაბი 2 — პუნქტი 1',
  tab2Bullet2: 'ტაბი 2 — პუნქტი 2',
  tab2Bullet3: 'ტაბი 2 — პუნქტი 3',
  tab2Bullet4: 'ტაბი 2 — პუნქტი 4',
  photo: 'ფოტო',
  image: 'სურათი',
  image1: 'სურათი 1',
  image2: 'სურათი 2',
  pitch: 'მოედნის სურათი',
};

/** Longer copy gets a textarea in the admin panel rather than a one-line input. */
const TEXTAREA_FIELDS = new Set(['text', 'formNote', 'description']);

/**
 * Turns an unmapped key segment into something readable.
 *
 * `col1` -> "სვეტი 1", `coach7` -> "coach 7". A segment that has no Georgian
 * name still reads better split from its trailing number than as a raw slug.
 */
function prettySegment(segment) {
  const m = segment.match(/^([a-z]+)(\d+)$/i);
  if (!m) return segment;

  const [, word, number] = m;
  const NAMED = { col: 'სვეტი', slide: 'სლაიდი', section: 'სექცია' };
  return `${NAMED[word] ?? word} ${number}`;
}

/**
 * Derives {page, group, label, kind} from a dotted key.
 *
 * e.g. `home.coach2.name` -> page "home", group "coach2",
 *      label "მწვრთნელი 2 — სახელი".
 */
function describe(key, isImage) {
  const parts = key.split('.');
  const page = parts[0];
  const field = parts[parts.length - 1];
  const group = parts.length > 2 ? parts.slice(1, -1).join('.') : page;

  /*
   * Label from the whole group path, not just its first segment.
   *
   * `home.footer.col1.title` and `home.footer.col2.title` both have "footer"
   * as parts[1], so keying the label off that alone rendered every footer
   * column as the same "ფუტერი — სათაური" and left the admin unable to tell
   * which of three identical fields edits which column.
   */
  const groupLabel =
    SECTION_LABELS[group] ??
    group
      .split('.')
      .map((segment) => SECTION_LABELS[segment] ?? prettySegment(segment))
      .join(' ');

  const fieldLabel = FIELD_LABELS[field] ?? field;

  const kind = isImage ? 'image' : TEXTAREA_FIELDS.has(field) ? 'textarea' : 'text';

  return {
    page,
    group,
    label: `${groupLabel} — ${fieldLabel}`,
    kind,
  };
}

/**
 * Every marker in the theme HTML, in document order, deduplicated.
 *
 * Both marker kinds are collected in one pass, sorted by their offset in the
 * file, so an image sitting between two paragraphs keeps its place. That order
 * becomes the row's `order` column and is what the editor sorts by.
 */
async function collectKeys() {
  const files = (await readdir(PAGES_DIR)).filter((f) => f.endsWith('.html'));
  const keys = new Map();
  let order = 0;

  // index.html first -- it is the home page, and the admin expects to see it
  // at the top of the editor rather than after "about".
  const ordered = files.sort((a, b) => {
    if (a === 'index.html') return -1;
    if (b === 'index.html') return 1;
    return a < b ? -1 : 1;
  });

  for (const file of ordered) {
    const html = await readFile(path.join(PAGES_DIR, file), 'utf8');

    const found = [
      ...[...html.matchAll(/\sdata-cms="([^"]+)"/g)].map((m) => ({
        key: m[1],
        at: m.index,
        isImage: false,
      })),
      ...[...html.matchAll(/\sdata-cms-img="([^"]+)"/g)].map((m) => ({
        key: m[1],
        at: m.index,
        isImage: true,
      })),
    ].sort((a, b) => a.at - b.at);

    for (const { key, isImage } of found) {
      if (keys.has(key)) continue;
      keys.set(key, { ...describe(key, isImage), order: (order += 1) });
    }
  }

  return keys;
}

/** Every row already in the table, keyed by its `key` column. */
async function existingRows() {
  const rows = new Map();
  let cursor;

  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({ databaseId, tableId: CONTENT_TABLE, queries });
    for (const row of page.rows) rows.set(row.key, row);

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return rows;
}

const wanted = await collectKeys();
const present = await existingRows();

console.log(`\nMarkers in HTML: ${wanted.size}`);
console.log(`Rows in table:   ${present.size}\n`);

let created = 0;
let relabelled = 0;

for (const [key, meta] of wanted) {
  const row = present.get(key);

  if (!row) {
    await tablesDB.createRow({
      databaseId,
      tableId: CONTENT_TABLE,
      rowId: ID.unique(),
      data: { key, value: '', ...meta },
    });
    created += 1;
    console.log(`  + ${key}  (${meta.label})`);
    continue;
  }

  // The row exists. Its value is the admin's and is never touched, but the
  // labelling metadata is ours -- refresh it so renaming a section in this
  // script actually reaches the panel.
  const needsUpdate =
    row.label !== meta.label ||
    row.page !== meta.page ||
    row.group !== meta.group ||
    row.kind !== meta.kind ||
    row.order !== meta.order;

  if (needsUpdate) {
    await tablesDB.updateRow({
      databaseId,
      tableId: CONTENT_TABLE,
      rowId: row.$id,
      data: meta,
    });
    relabelled += 1;
  }
}

/*
 * A row whose marker has gone is reported, not deleted -- it may hold copy an
 * admin wrote, and a marker can vanish from a theme edit that is later
 * reverted. Deleting is opt-in via `--prune`, and even then only for rows that
 * are empty: an orphan holding text is the one case where losing the row loses
 * something no longer recoverable from the HTML.
 */
const orphans = [...present.values()].filter((row) => !wanted.has(row.key));
const prune = process.argv.includes('--prune');
let pruned = 0;

if (prune) {
  for (const row of orphans) {
    if ((row.value ?? '').trim() !== '') continue;
    await tablesDB.deleteRow({
      databaseId,
      tableId: CONTENT_TABLE,
      rowId: row.$id,
    });
    pruned += 1;
  }
}

console.log(`\nCreated:    ${created}`);
console.log(`Relabelled: ${relabelled}`);
if (prune) console.log(`Pruned:     ${pruned} (empty orphans)`);

const remaining = orphans.filter(
  (row) => !prune || (row.value ?? '').trim() !== ''
);

if (remaining.length > 0) {
  console.log(`\nRows with no marker in the HTML (left in place):`);
  for (const row of remaining) {
    const held = (row.value ?? '').trim();
    console.log(`  ? ${row.key}${held ? `  -- holds text, edit or delete by hand` : ''}`);
  }
  if (!prune) console.log(`\n  Re-run with --prune to delete the empty ones.`);
}

console.log('\nDone.\n');
