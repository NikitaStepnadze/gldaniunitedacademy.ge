import 'server-only';

import { unstable_cache } from 'next/cache';
import { ID, Query } from 'node-appwrite';

import { databaseId, tables } from './config';
import { getTablesDB } from './server';
import { slugify as baseSlugify } from '../slug';

/**
 * Training programmes -- the cards in the home page's programmes section, the
 * listing at /programs, and one public page per programme.
 *
 * These began as three hardcoded cards in the theme markup, editable only
 * through per-element CMS rows (`home.program1.title` and friends). That was
 * enough to reword a card but not to add a fourth: which fields existed came
 * from the markers written into the HTML, so a new programme meant editing the
 * template. They are rows now, which is what lets an admin add one.
 *
 * The home section and /programs both render from this table, so the two
 * cannot disagree about what the academy offers.
 *
 * Reads on the public path are cached under PROGRAMS_TAG so a page does not hit
 * Appwrite per request, and so an admin's save can drop exactly this data. The
 * admin's own reads bypass the cache: it has just written the row it is about
 * to list, and showing it a stale copy would read as the save having failed.
 */
const PAGE_SIZE = 100;

/** Cache tag covering every read of the programmes table. */
export const PROGRAMS_TAG = 'programs';

/** How many programmes the home page's section shows. */
export const FEATURED_LIMIT = 3;

/**
 * Copies the fields we use out of an Appwrite row.
 *
 * Same reason as the events table's version: the SDK's row objects cannot
 * cross into a client component or be closed over by a server action, so every
 * read is flattened here before it leaves this module.
 *
 * The two defaults are applied on read rather than left to the column, because
 * a row written before its column existed comes back without it -- and a card
 * whose age unit is missing should still print "წელი" under the number rather
 * than nothing.
 */
function toPlainProgram(row) {
  return {
    id: row.$id,
    slug: row.slug ?? '',
    title: row.title ?? '',
    ageRange: row.ageRange ?? '',
    ageUnit: row.ageUnit ?? 'წელი',
    activityLabel: row.activityLabel ?? 'ვარჯიში',
    frequency: row.frequency ?? '',
    image: row.image ?? '',
    description: row.description ?? '',
    body: row.body ?? '',
    priceLabel: row.priceLabel ?? '',
    priceValue: row.priceValue ?? '',
    featured: row.featured !== false,
    published: row.published !== false,
    order: typeof row.order === 'number' ? row.order : 0,
    createdAt: row.$createdAt ?? '',
    updatedAt: row.$updatedAt ?? '',
  };
}

/** Fetches every row of the programmes table, following pagination. */
async function listAllRows() {
  const tablesDB = getTablesDB();
  const rows = [];
  let cursor;

  for (;;) {
    const queries = [Query.limit(PAGE_SIZE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({
      databaseId,
      tableId: tables.programs,
      queries,
    });
    rows.push(...page.rows);

    if (page.rows.length < PAGE_SIZE) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return rows;
}

/**
 * Sorts programmes the way both the listing and the home section want them.
 *
 * `order` is what the admin controls with the up/down buttons. Oldest-first is
 * the tie-break here, unlike the events list: programmes are a stable ladder of
 * age groups rather than a feed, so a newly added one belongs after the ones
 * already there rather than jumping above them.
 */
function byOrder(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt < b.createdAt ? -1 : 1;
}

/**
 * Every published programme, in display order.
 *
 * Cached and tagged: this is what /programs and the home page read on every
 * request. Callers all treat an empty list as a page that renders without the
 * section rather than as an error.
 */
export const getPublishedPrograms = unstable_cache(
  async () => {
    const rows = await listAllRows();
    return rows
      .map(toPlainProgram)
      .filter((program) => program.published && program.slug !== '')
      .sort(byOrder);
  },
  ['programs-published'],
  { tags: [PROGRAMS_TAG] }
);

/**
 * The programmes shown in the home page's section.
 *
 * Capped at FEATURED_LIMIT here rather than trusted from the database: the
 * section is a three-column row, so a fourth flagged card -- set by a hand edit
 * in the Appwrite console, or by two admins saving at once -- would wrap onto a
 * second line and leave a lopsided grid.
 *
 * Falls back to the first programmes in display order when nothing is flagged,
 * so a site whose admin has never touched the checkbox still shows a populated
 * section instead of an empty one.
 */
export async function getFeaturedPrograms() {
  const programs = await getPublishedPrograms();
  const flagged = programs.filter((program) => program.featured);
  const chosen = flagged.length > 0 ? flagged : programs;
  return chosen.slice(0, FEATURED_LIMIT);
}

/** One published programme by slug, or null. Used by /programs/[slug]. */
export async function getProgramBySlug(slug) {
  const programs = await getPublishedPrograms();
  return programs.find((program) => program.slug === slug) ?? null;
}

/**
 * Every programme including drafts, for the admin list.
 *
 * Uncached deliberately: the admin has just saved and is looking at the result.
 */
export async function listAllPrograms() {
  const rows = await listAllRows();
  return rows.map(toPlainProgram).sort(byOrder);
}

/** One programme by row id including drafts, for the admin editor. */
export async function getProgramById(id) {
  try {
    const row = await getTablesDB().getRow({
      databaseId,
      tableId: tables.programs,
      rowId: id,
    });
    return toPlainProgram(row);
  } catch (error) {
    /*
     * Logged rather than swallowed silently.
     *
     * The caller turns a null into notFound(), which is right for an id that
     * genuinely does not exist -- but it is also what a misconfigured table id
     * or an unreachable Appwrite produces, and those are not 404s. Without this
     * line the two are indistinguishable from the outside: the editor just
     * shows "not found" for a row that is plainly there.
     */
    console.error(`[programs] cannot read ${id}:`, error.message);
    return null;
  }
}

/**
 * Turns a title into a URL segment.
 *
 * Transliterates Georgian to Latin -- see lib/slug.js for why these slugs are
 * not native Georgian, which is what the site shipped first.
 *
 * Wrapped rather than re-exported bare so the fallback prefix names what the
 * row is: a programme whose title romanises to nothing becomes
 * `program-<timestamp>` rather than a bare number.
 */
export function slugify(title) {
  return baseSlugify(title, 'program');
}

/**
 * Makes a slug unique against the programmes already stored.
 *
 * Appwrite's unique index would reject a duplicate, but a rejection is not a
 * useful answer to an admin who named two programmes alike. A numeric suffix
 * gives them a working URL without a second round of typing.
 */
export async function uniqueSlug(desired, exceptId = null) {
  const programs = await listAllPrograms();
  const taken = new Set(
    programs.filter((program) => program.id !== exceptId).map((program) => program.slug)
  );

  if (!taken.has(desired)) return desired;

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${desired}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${desired}-${Date.now()}`;
}

/** The columns an admin write may set, so a stray form field cannot reach the row. */
const WRITABLE = [
  'slug',
  'title',
  'ageRange',
  'ageUnit',
  'activityLabel',
  'frequency',
  'image',
  'description',
  'body',
  'priceLabel',
  'priceValue',
  'featured',
  'published',
  'order',
];

/** Keeps only the writable columns, dropping undefined ones. */
function pickWritable(data) {
  const out = {};
  for (const key of WRITABLE) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

/** Creates one programme and returns it. */
export async function createProgram(data) {
  const row = await getTablesDB().createRow({
    databaseId,
    tableId: tables.programs,
    rowId: ID.unique(),
    data: pickWritable(data),
  });
  return toPlainProgram(row);
}

/** Updates one programme by row id and returns it. */
export async function updateProgram(id, data) {
  const row = await getTablesDB().updateRow({
    databaseId,
    tableId: tables.programs,
    rowId: id,
    data: pickWritable(data),
  });
  return toPlainProgram(row);
}

/** Deletes one programme by row id. */
export async function deleteProgram(id) {
  await getTablesDB().deleteRow({
    databaseId,
    tableId: tables.programs,
    rowId: id,
  });
}

/**
 * Clears the featured flag on programmes beyond the allowed three.
 *
 * Called after a save that set the flag. The admin form already refuses to
 * check a fourth box, but the check happens in one browser: two admins editing
 * at once, or a stale tab, can still land four flagged rows in the table.
 * Trimming here keeps the home section's promise -- the three most recently
 * chosen -- rather than leaving the render-time slice to pick three
 * arbitrarily.
 *
 * `keepId` is the programme that was just saved, so it is never the one
 * dropped.
 */
export async function trimFeatured(keepId) {
  const programs = await listAllPrograms();
  const flagged = programs.filter((program) => program.featured);
  if (flagged.length <= FEATURED_LIMIT) return;

  // Keep the row just saved, then as many of the rest as still fit.
  const keep = new Set([keepId]);
  for (const program of flagged) {
    if (keep.size >= FEATURED_LIMIT) break;
    keep.add(program.id);
  }

  for (const program of flagged) {
    if (keep.has(program.id)) continue;
    await updateProgram(program.id, { featured: false });
  }
}

export const programsTableId = tables.programs;
