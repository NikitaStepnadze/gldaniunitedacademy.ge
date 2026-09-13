/**
 * Creates the Appwrite database, tables, columns and storage buckets the site
 * and its admin panel need.
 *
 * Safe to run repeatedly: each resource is looked up before it is created, so
 * a second run reports "already exists" rather than failing or duplicating
 * work. This matters because the schema grows -- re-run it after each change.
 *
 * Existence is checked by lookup rather than by catching a 409 on create. On
 * the free plan Appwrite reports an already-existing database, bucket or
 * column as a plan-limit error (400) instead of a 409, so the usual
 * create-and-swallow-409 idiom aborts the whole run.
 *
 * Targets Appwrite Cloud 1.9.6 via the TablesDB API. Check the server version
 * before changing this: TablesDB does not exist below 1.9.0, and on those
 * servers the older Databases/collections API is the one to use.
 *
 *   npm run appwrite:migrate
 */
import { config } from 'dotenv';
import { Client, TablesDB, Storage } from 'node-appwrite';

config({ quiet: true });

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';

const CONTENT_TABLE = process.env.APPWRITE_CONTENT_TABLE_ID ?? 'content';
const SETTINGS_TABLE = process.env.APPWRITE_SETTINGS_TABLE_ID ?? 'settings';
const ENQUIRIES_TABLE = process.env.APPWRITE_ENQUIRIES_TABLE_ID ?? 'enquiries';
const EVENTS_TABLE = process.env.APPWRITE_EVENTS_TABLE_ID ?? 'events';
const PROGRAMS_TABLE = process.env.APPWRITE_PROGRAMS_TABLE_ID ?? 'programs';
const FILES_BUCKET = process.env.APPWRITE_ENQUIRY_FILES_BUCKET_ID ?? 'enquiry-files';

if (!projectId || !apiKey) {
  console.error(
    'Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY in .env'
  );
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

/**
 * Every table below is created with an empty permissions array.
 *
 * That is deliberate, not an oversight: all reads and writes go through the
 * Next.js server using the API key, which bypasses row permissions entirely.
 * Granting nothing means a leaked project id gives a browser no way to read
 * enquiries -- which hold children's names and parents' phone numbers.
 */
const NO_PUBLIC_ACCESS = [];

/** Runs one create call, treating "already exists" as success. */
async function step(label, fn) {
  try {
    await fn();
    console.log(`  + ${label}`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`  . ${label} (already exists)`);
      return;
    }
    console.error(`  x ${label}: ${error.message}`);
    throw error;
  }
}

/**
 * Appwrite builds columns asynchronously; an index over a column still marked
 * "processing" fails. Wait for every column on the table to become available.
 */
async function waitForColumns(tableId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { columns } = await tablesDB.listColumns({ databaseId, tableId });
    if (columns.every((c) => c.status === 'available')) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Columns on ${tableId} did not become available in time`);
}

/**
 * Creates one column from a declarative spec, skipping ones already present.
 *
 * The existence check is done by listing, not by catching an error. On the free
 * plan Appwrite reports an already-existing column as `column_limit_exceeded`
 * (400) rather than a 409, so create-and-swallow-409 aborts every re-run once
 * a table is full. Listing first is plan-independent.
 *
 * A required column must never also declare a default -- Appwrite rejects that
 * pairing with attribute_default_unsupported. So every `required: true` entry
 * in the schema below carries no xdefault, and defaulted columns are optional.
 */
function column(tableId, spec, existingColumns) {
  const { kind, key, ...rest } = spec;

  const existing = existingColumns.get(key);
  if (existing) {
    /*
     * A column already there is left alone with one exception: a spec that has
     * become optional while the live column is still required. That happened to
     * `email` when the registration form stopped asking for one, and a
     * create-only migration would never apply it -- every registration would
     * keep failing on a required column the form no longer fills.
     *
     * Only this direction is automated. Tightening a column, renaming one or
     * changing its size can fail against existing rows, so those stay manual.
     */
    if (existing.required && rest.required === false) {
      /*
       * `xdefault` is not optional in the update calls, even though it is in
       * the create ones: the SDK rejects the request before it is sent if the
       * key is absent. It becomes the column's default, and a column being
       * made optional precisely because nothing fills it wants no default, so
       * it is passed explicitly as null.
       */
      const relax = {
        string: () =>
          tablesDB.updateStringColumn({
            databaseId,
            tableId,
            key,
            required: false,
            size: rest.size,
            xdefault: null,
          }),
        email: () =>
          tablesDB.updateEmailColumn({
            databaseId,
            tableId,
            key,
            required: false,
            xdefault: null,
          }),
      }[kind];

      if (relax) return step(`${key} (${kind}) -> optional`, relax);
    }

    console.log(`  . ${key} (${kind}) (already exists)`);
    return Promise.resolve();
  }

  const base = { databaseId, tableId, key, ...rest };

  const makers = {
    string: () => tablesDB.createStringColumn(base),
    email: () => tablesDB.createEmailColumn(base),
    integer: () => tablesDB.createIntegerColumn(base),
    boolean: () => tablesDB.createBooleanColumn(base),
    datetime: () => tablesDB.createDatetimeColumn(base),
  };

  const label = `${key} (${kind}${rest.required ? ', required' : ''})`;
  return step(label, makers[kind]);
}

const SCHEMA = [
  {
    tableId: CONTENT_TABLE,
    name: 'Content',
    description: 'Keyed text snippets swapped into the theme markup',
    columns: [
      // e.g. "home.hero.title" -- matches data-cms="..." in the theme HTML.
      { kind: 'string', key: 'key', size: 128, required: true },
      { kind: 'string', key: 'value', size: 8000, required: false },
      // Which page it belongs to, so the admin UI can group fields.
      { kind: 'string', key: 'page', size: 64, required: false },
      // Section within the page ("slide1", "coach2"), so the editor can put
      // every field of one card together instead of listing 98 flat inputs.
      { kind: 'string', key: 'group', size: 64, required: false },
      // Human label shown in the admin panel instead of the raw key.
      { kind: 'string', key: 'label', size: 160, required: false },
      // 'text' | 'textarea' | 'image' -- tells the admin which input to render.
      { kind: 'string', key: 'kind', size: 32, required: false, xdefault: 'text' },
      /*
       * Document order of the marker in the theme HTML.
       *
       * Without it the editor can only sort by key, which is alphabetical and
       * so puts the footer above the hero. Sorting by this makes the panel read
       * top-to-bottom in the same order as the page it edits.
       */
      { kind: 'integer', key: 'order', required: false, xdefault: 0 },
    ],
    indexes: [
      { key: 'idx_key', type: 'unique', columns: ['key'] },
      { key: 'idx_page', type: 'key', columns: ['page'] },
    ],
  },
  {
    tableId: SETTINGS_TABLE,
    name: 'Settings',
    description: 'Site-wide settings: colour palette, contact details',
    columns: [
      { kind: 'string', key: 'key', size: 128, required: true },
      { kind: 'string', key: 'value', size: 2000, required: false },
      // 'color' | 'text' | 'email' | 'phone' -- drives the admin input type.
      { kind: 'string', key: 'kind', size: 32, required: false, xdefault: 'text' },
      { kind: 'string', key: 'group', size: 64, required: false },
      { kind: 'string', key: 'label', size: 160, required: false },
    ],
    indexes: [
      { key: 'idx_settings_key', type: 'unique', columns: ['key'] },
      { key: 'idx_group', type: 'key', columns: ['group'] },
    ],
  },
  {
    tableId: ENQUIRIES_TABLE,
    name: 'Enquiries',
    description: 'Registration enquiries from the contact form',
    columns: [
      { kind: 'string', key: 'name', size: 128, required: true },
      /*
       * Optional, unlike name and phone. The registration form asks for no
       * email at all -- parents are reached by phone -- while the contact form
       * still requires one from its own senders. An optional column lets both
       * write to this table, with each form enforcing its own rule.
       */
      { kind: 'email', key: 'email', required: false },
      { kind: 'string', key: 'phone', size: 32, required: true },
      { kind: 'string', key: 'childAge', size: 32, required: false },
      { kind: 'string', key: 'message', size: 4000, required: false },

      /*
       * Registration-form fields.
       *
       * All optional at the schema level even though the registration form
       * requires them, because the contact form writes to this same table and
       * sends none of them. Required-ness is enforced per form in
       * validateRegistration(); making the columns required here would break
       * every contact submission.
       */
      { kind: 'string', key: 'childFirstName', size: 64, required: false },
      { kind: 'string', key: 'childLastName', size: 64, required: false },
      { kind: 'string', key: 'childDob', size: 16, required: false },
      // Georgian personal number is 11 digits. Sized with room to spare rather
      // than exactly, so a stray space or a format change cannot truncate one.
      { kind: 'string', key: 'childIdNumber', size: 32, required: false },
      { kind: 'string', key: 'address', size: 256, required: false },
      // School hours as submitted, two HH:MM times. Kept as separate columns
      // rather than one joined string so either end can be read on its own.
      { kind: 'string', key: 'schoolFrom', size: 8, required: false },
      { kind: 'string', key: 'schoolTo', size: 8, required: false },

      /*
       * Mother's and father's details.
       *
       * Both sets are optional here even though the form demands a complete set
       * for at least one parent: that is a cross-field rule a column cannot
       * express. It is enforced in validateRegistration().
       */
      { kind: 'string', key: 'motherFirstName', size: 64, required: false },
      { kind: 'string', key: 'motherLastName', size: 64, required: false },
      { kind: 'string', key: 'motherIdNumber', size: 32, required: false },
      { kind: 'string', key: 'motherPhone', size: 32, required: false },
      { kind: 'string', key: 'fatherFirstName', size: 64, required: false },
      { kind: 'string', key: 'fatherLastName', size: 64, required: false },
      { kind: 'string', key: 'fatherIdNumber', size: 32, required: false },
      { kind: 'string', key: 'fatherPhone', size: 32, required: false },
      // 'mother' | 'father' -- which block the row's `name` and `phone` were
      // taken from, so the admin panel can label the contact instead of
      // leaving the reader to work it out.
      { kind: 'string', key: 'contactParent', size: 16, required: false },

      /*
       * Superseded by the mother/father columns above. Kept so applications
       * submitted before the split still read correctly in the admin panel;
       * nothing writes them any more.
       */
      { kind: 'string', key: 'parentFirstName', size: 64, required: false },
      { kind: 'string', key: 'parentLastName', size: 64, required: false },
      // The child's photo, kept apart from fileIds so the admin panel can show
      // it as a portrait rather than as one more anonymous attachment.
      { kind: 'string', key: 'photoId', size: 64, required: false },
      // Which form produced the row: 'contact' or 'registration'. Lets the
      // admin inbox tell a full enrolment application from a general question.
      // Which training plan the parent chose: 'standard' (130 GEL/month, three
      // sessions a week) or 'extended' (those three plus two more, priced in
      // person). Stored as the key rather than the Georgian label so the price
      // and the wording can change without rewriting every stored row --
      // lib/appwrite/enquiries.js owns the labels.
      { kind: 'string', key: 'trainingPlan', size: 32, required: false },
      { kind: 'string', key: 'source', size: 32, required: false, xdefault: 'contact' },
      // Admin workflow: 'review', 'active' or 'declined'. Left as a plain string
      // rather than an enum so the set can change without a column migration;
      // lib/appwrite/enquiries.js is what constrains it, and maps the values
      // used before this set onto it.
      { kind: 'string', key: 'status', size: 32, required: false, xdefault: 'review' },
      // Private admin notes -- never shown on the public site.
      { kind: 'string', key: 'notes', size: 8000, required: false },
      // Ids of files in the enquiry-files bucket, attached by the parent.
      { kind: 'string', key: 'fileIds', size: 64, required: false, array: true },
      { kind: 'boolean', key: 'archived', required: false, xdefault: false },
      // Whether an admin has opened this enquiry. Drives the colour of the row
      // in the admin list, so a newly arrived application is visible at a
      // glance. Defaults to false so every existing row reads as unopened.
      { kind: 'boolean', key: 'seen', required: false, xdefault: false },
    ],
    indexes: [
      { key: 'idx_email', type: 'key', columns: ['email'] },
      { key: 'idx_status', type: 'key', columns: ['status'] },
      { key: 'idx_archived', type: 'key', columns: ['archived'] },
      { key: 'idx_source', type: 'key', columns: ['source'] },
    ],
  },
  {
    tableId: EVENTS_TABLE,
    name: 'Events',
    description: 'News and events, each rendered as its own public page',
    columns: [
      /*
       * The URL segment, e.g. "zafkhulis-banaki" in /news/zafkhulis-banaki.
       *
       * Unique and immutable once an entry is published: it is what search
       * engines index and what anyone who shared the link typed. The admin
       * form derives it from the title on creation and then leaves it alone,
       * so renaming a headline never breaks an indexed URL.
       */
      { kind: 'string', key: 'slug', size: 160, required: true },
      { kind: 'string', key: 'title', size: 200, required: true },
      /*
       * Which of the two card layouts this entry uses.
       *
       * 'event' is the schedule card -- photo, three meta lines, a price panel
       * -- shown in the home page's events section and at the top of /news.
       * 'news' is the blog card: photo, tag, headline, author and date.
       *
       * One table rather than two because both kinds are the same thing to
       * everything downstream: a row an admin writes, a slug, and a public page
       * at /news/<slug>. Splitting them would duplicate the editor, the page
       * route and the sitemap for the sake of which fields a card happens to
       * draw.
       */
      { kind: 'string', key: 'kind', size: 16, required: false, xdefault: 'news' },
      // The pill above a news card's headline ('ვარჯიში', 'ტურნირი').
      { kind: 'string', key: 'tag', size: 80, required: false },
      // The byline on a news card. Free text so it can read 'ავტორი: აკადემია'
      // or carry a coach's name without a second field.
      { kind: 'string', key: 'author', size: 120, required: false },
      /*
       * The three meta lines under the headline, shown beside their pin,
       * calendar and clock icons on the card.
       *
       * Free text rather than a real date: the theme prints them verbatim
       * ("20 სექტემბერი", "დაწყება 11:00 საათზე") and the admin writes them in
       * Georgian. A datetime column would force a locale format nobody asked
       * for and would not hold "until finish".
       */
      { kind: 'string', key: 'location', size: 200, required: false },
      { kind: 'string', key: 'date', size: 100, required: false },
      { kind: 'string', key: 'time', size: 100, required: false },
      // The price block on the right of the card: a label ("მონაწილეობა") over
      // a value ("უფასო").
      { kind: 'string', key: 'priceLabel', size: 80, required: false },
      { kind: 'string', key: 'priceValue', size: 80, required: false },
      // The card's call to action, and the heading above the body on the
      // entry's own page.
      { kind: 'string', key: 'ctaLabel', size: 80, required: false },
      // The card photo and the hero of the entry's page. A /api/media/<id> URL
      // written by the admin's image picker, or empty for the theme default.
      { kind: 'string', key: 'image', size: 512, required: false },
      // A one-paragraph summary, used as the page's meta description and as
      // the lead above the body.
      { kind: 'string', key: 'excerpt', size: 1000, required: false },
      /*
       * The entry's own page content: plain text, blank line between
       * paragraphs. Stored unformatted and escaped at render time -- an admin
       * pasting markup must not be able to script the public site.
       */
      { kind: 'string', key: 'body', size: 20000, required: false },
      /*
       * Whether this entry appears in the home page's events section.
       *
       * Only meaningful for kind 'event': news entries live on /news and are
       * not shown on the home page at all. The admin panel enforces the limit
       * of two; the renderer takes the first two regardless, so a third flag
       * set by hand cannot push a card into a layout with room for two.
       */
      { kind: 'boolean', key: 'featured', required: false, xdefault: false },
      // Unpublished entries stay out of the listing, the home section, the
      // sitemap and their own URL -- a draft is invisible, not merely unlinked.
      { kind: 'boolean', key: 'published', required: false, xdefault: true },
      // Display order, low to high. The admin reorders with the up/down
      // buttons in the list rather than typing a number.
      { kind: 'integer', key: 'order', required: false, xdefault: 0 },
    ],
    indexes: [
      { key: 'idx_slug', type: 'unique', columns: ['slug'] },
      { key: 'idx_featured', type: 'key', columns: ['featured'] },
      { key: 'idx_published', type: 'key', columns: ['published'] },
      { key: 'idx_kind', type: 'key', columns: ['kind'] },
    ],
  },
  {
    tableId: PROGRAMS_TABLE,
    name: 'Programs',
    description: 'Age-group training programmes shown on the home page and /programs',
    columns: [
      /*
       * The URL segment, e.g. "damtsqebta-jgufi" in /programs/damtsqebta-jgufi.
       *
       * Unique, and left alone once a programme is created: it is what anyone
       * who bookmarked or shared the page typed. The admin form derives it from
       * the title on creation only, so renaming a programme never breaks a link.
       */
      { kind: 'string', key: 'slug', size: 160, required: true },
      { kind: 'string', key: 'title', size: 200, required: true },
      /*
       * The age badge on the card photo, split into its number and its unit so
       * the theme can keep printing them on two lines ("5-8" over "წელი") the
       * way the static markup did.
       */
      { kind: 'string', key: 'ageRange', size: 40, required: false },
      { kind: 'string', key: 'ageUnit', size: 40, required: false, xdefault: 'წელი' },
      /*
       * The two meta lines under the card photo, each beside its own icon.
       *
       * `activityLabel` is the left one -- the word the theme hardcoded as
       * "ვარჯიში" and which an admin could not previously edit. It is a column
       * rather than a fixed string precisely because that was the gap: a
       * programme that is a camp or a tournament rather than regular training
       * needs to be able to say so.
       */
      { kind: 'string', key: 'activityLabel', size: 80, required: false, xdefault: 'ვარჯიში' },
      { kind: 'string', key: 'frequency', size: 120, required: false },
      // The card photo and the hero of the programme's own page. An
      // /api/media/<id> URL from the admin image picker, or empty for the
      // theme's own default image.
      { kind: 'string', key: 'image', size: 512, required: false },
      // The paragraph under the title on the card, and the lead on the
      // programme's page. Also used as that page's meta description.
      { kind: 'string', key: 'description', size: 2000, required: false },
      /*
       * The programme page's own content: plain text, blank line between
       * paragraphs. Stored unformatted and escaped at render time -- an admin
       * pasting markup must not be able to script the public site.
       */
      { kind: 'string', key: 'body', size: 20000, required: false },
      // Price block on the programme's page: a label over a value.
      { kind: 'string', key: 'priceLabel', size: 80, required: false },
      { kind: 'string', key: 'priceValue', size: 80, required: false },
      /*
       * Whether this programme appears in the home page's card section, which
       * is a three-column row. The admin panel steers this rather than the
       * public page guessing which of a growing list belong there.
       */
      { kind: 'boolean', key: 'featured', required: false, xdefault: true },
      // An unpublished programme is invisible: out of the listing, the home
      // section, the sitemap and its own URL -- a draft, not merely unlinked.
      { kind: 'boolean', key: 'published', required: false, xdefault: true },
      // Display order, low to high. The admin reorders with the up/down
      // buttons in the list rather than typing a number.
      { kind: 'integer', key: 'order', required: false, xdefault: 0 },
    ],
    indexes: [
      { key: 'idx_program_slug', type: 'unique', columns: ['slug'] },
      { key: 'idx_program_featured', type: 'key', columns: ['featured'] },
      { key: 'idx_program_published', type: 'key', columns: ['published'] },
    ],
  },
];

console.log(`\nAppwrite migration -> ${endpoint} (project ${projectId})\n`);

console.log('Database');
// Checked rather than create-and-catch: on the free plan, creating a database
// that already exists fails with a plan-limit error instead of a 409, so the
// usual "swallow 409" trick would break every re-run.
try {
  await tablesDB.get({ databaseId });
  console.log(`  . database "${databaseId}" (already exists)`);
} catch (error) {
  if (error.code !== 404) throw error;
  await step(`database "${databaseId}"`, () =>
    tablesDB.create({ databaseId, name: 'Academy' })
  );
}

for (const table of SCHEMA) {
  console.log(`\nTable: ${table.tableId}  -- ${table.description}`);

  // Existence is checked by lookup rather than by catching a create error, for
  // the same plan-limit reason described on `column` above.
  let tableExists = true;
  try {
    await tablesDB.getTable({ databaseId, tableId: table.tableId });
    console.log(`  . table "${table.tableId}" (already exists)`);
  } catch (error) {
    if (error.code !== 404) throw error;
    tableExists = false;
  }

  if (!tableExists) {
    await step(`table "${table.tableId}"`, () =>
      tablesDB.createTable({
        databaseId,
        tableId: table.tableId,
        name: table.name,
        permissions: NO_PUBLIC_ACCESS,
        rowSecurity: false,
      })
    );
  }

  const { columns } = await tablesDB.listColumns({ databaseId, tableId: table.tableId });
  // A Map, not a Set: `column` needs each live column's `required` flag to see
  // whether a spec that has since become optional still has to be relaxed.
  const existingColumns = new Map(columns.map((c) => [c.key, c]));
  for (const spec of table.columns) {
    await column(table.tableId, spec, existingColumns);
  }

  await waitForColumns(table.tableId);

  const { indexes } = await tablesDB.listIndexes({ databaseId, tableId: table.tableId });
  const existingIndexes = new Set(indexes.map((i) => i.key));
  for (const index of table.indexes) {
    if (existingIndexes.has(index.key)) {
      console.log(`  . index ${index.key} (already exists)`);
      continue;
    }
    await step(`index ${index.key}`, () =>
      tablesDB.createIndex({
        databaseId,
        tableId: table.tableId,
        key: index.key,
        type: index.type,
        columns: index.columns,
      })
    );
  }
}

console.log('\nStorage');
// Same guard as the database: bucket count is also plan-limited, so an
// existing bucket may report a limit error rather than a 409.
let bucketExists = false;
try {
  await storage.getBucket({ bucketId: FILES_BUCKET });
  bucketExists = true;
  console.log(`  . bucket "${FILES_BUCKET}" (already exists)`);
} catch (error) {
  if (error.code !== 404) throw error;
}

if (!bucketExists) {
  await step(`bucket "${FILES_BUCKET}"`, () =>
    storage.createBucket({
      bucketId: FILES_BUCKET,
      name: 'Enquiry files',
      // Same reasoning as the tables: uploads are proxied through the server,
      // so the bucket grants nothing. These files are children's documents.
      permissions: NO_PUBLIC_ACCESS,
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 10 * 1024 * 1024, // 10 MB
      allowedFileExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'],
      compression: 'gzip',
      encryption: true,
      antivirus: true,
    })
  );
}

/*
 * Site images share the enquiry bucket.
 *
 * They would rather have a bucket of their own -- one granting public read, so
 * the CDN could serve them directly -- but Appwrite's free plan allows exactly
 * one bucket per project, and the enquiry bucket has it.
 *
 * Sharing is safe only because the bucket still grants nobody anything. Both
 * kinds of file stay unreachable by URL, and each is served by a route that
 * decides for itself what it will hand out:
 *
 *   /api/admin/files/[id]  - any file in the bucket, admin session required.
 *   /api/media/[id]        - public, but ONLY files an admin has published
 *                            into a CMS row. See that route for the check.
 *
 * So an enquiry document is never public: nothing points a CMS row at it.
 *
 * The extension list is widened here because site images allow formats a
 * scanned document does not (avif, gif).
 */
await step(`bucket "${FILES_BUCKET}" accepts site image formats`, () =>
  storage.updateBucket({
    bucketId: FILES_BUCKET,
    name: 'Enquiry files & site images',
    permissions: NO_PUBLIC_ACCESS,
    fileSecurity: false,
    enabled: true,
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: [
      'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'avif', 'gif',
    ],
    compression: 'gzip',
    encryption: true,
    antivirus: true,
  })
);

console.log('\nDone.\n');
