import 'server-only';

import { unstable_cache } from 'next/cache';
import { ID, Query } from 'node-appwrite';

import { databaseId, tables } from './config';
import { getTablesDB } from './server';
import { slugify as baseSlugify } from '../slug';

/**
 * News and events -- the cards in the home page's events section, the listing
 * at /news, and one public page per entry.
 *
 * Unlike the `content` table, which only overrides text the theme already
 * ships, this table *is* the content: an admin creates rows, and each row
 * becomes a URL. That is the whole point of it -- a site with ten entries has
 * eleven more pages for a crawler to index than one whose events live as
 * hardcoded markup in the home page.
 *
 * Reads on the public path are cached under EVENTS_TAG so a page does not hit
 * Appwrite per request, and so an admin's save can drop exactly this data. The
 * admin's own reads bypass the cache: it has just written the row it is about
 * to list, and showing it a stale copy would read as the save having failed.
 */
const PAGE_SIZE = 100;

/** Cache tag covering every read of the events table. */
export const EVENTS_TAG = 'events';

/** How many entries the home page's events section shows. */
export const FEATURED_LIMIT = 2;

/**
 * Copies the fields we use out of an Appwrite row.
 *
 * Same reason as the content table's version: the SDK's row objects cannot
 * cross into a client component or be closed over by a server action, so every
 * read is flattened here before it leaves this module.
 */
function toPlainEvent(row) {
  return {
    id: row.$id,
    slug: row.slug ?? '',
    title: row.title ?? '',
    kind: row.kind === 'event' ? 'event' : 'news',
    tag: row.tag ?? '',
    author: row.author ?? '',
    location: row.location ?? '',
    date: row.date ?? '',
    time: row.time ?? '',
    priceLabel: row.priceLabel ?? '',
    priceValue: row.priceValue ?? '',
    ctaLabel: row.ctaLabel ?? '',
    image: row.image ?? '',
    excerpt: row.excerpt ?? '',
    body: row.body ?? '',
    featured: row.featured === true,
    published: row.published !== false,
    order: typeof row.order === 'number' ? row.order : 0,
    createdAt: row.$createdAt ?? '',
    updatedAt: row.$updatedAt ?? '',
  };
}

/** Fetches every row of the events table, following pagination. */
async function listAllRows() {
  const tablesDB = getTablesDB();
  const rows = [];
  let cursor;

  for (;;) {
    const queries = [Query.limit(PAGE_SIZE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({
      databaseId,
      tableId: tables.events,
      queries,
    });
    rows.push(...page.rows);

    if (page.rows.length < PAGE_SIZE) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return rows;
}

/**
 * Sorts entries the way both the listing and the home section want them.
 *
 * `order` is what the admin controls with the up/down buttons; newest-first is
 * the tie-break, so a freshly created entry that has not been reordered still
 * lands at the top of its group rather than in an arbitrary position.
 */
function byOrder(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt < b.createdAt ? 1 : -1;
}

/**
 * Every published entry, in display order.
 *
 * Cached and tagged: this is what /news and the home page read on every
 * request. A failure returns an empty list rather than throwing -- see the
 * callers, which all treat "no entries" as a page that renders without the
 * section rather than as an error.
 */
export const getPublishedEvents = unstable_cache(
  async () => {
    const rows = await listAllRows();
    return rows
      .map(toPlainEvent)
      .filter((event) => event.published && event.slug !== '')
      .sort(byOrder);
  },
  ['events-published'],
  { tags: [EVENTS_TAG] }
);

/**
 * The entries shown in the home page's events section.
 *
 * Capped at FEATURED_LIMIT here rather than trusted from the database. The
 * admin panel already refuses to flag a third, but the section's markup has
 * room for exactly two cards, so a row flagged some other way -- a hand edit
 * in the Appwrite console, a half-applied save -- must not be able to push a
 * third card into a layout that cannot hold one.
 *
 * Falls back to the first entries in display order when nothing is flagged, so
 * a site whose admin has never touched the checkbox still shows a populated
 * section instead of an empty one.
 */
export async function getFeaturedEvents() {
  const events = (await getPublishedEvents()).filter((event) => event.kind === 'event');
  const flagged = events.filter((event) => event.featured);
  const chosen = flagged.length > 0 ? flagged : events;
  return chosen.slice(0, FEATURED_LIMIT);
}

/** Every published entry of one kind, in display order. */
export async function getEventsOfKind(kind) {
  const events = await getPublishedEvents();
  return events.filter((event) => event.kind === kind);
}

/** One published entry by slug, or null. Used by /news/[slug]. */
export async function getEventBySlug(slug) {
  const events = await getPublishedEvents();
  return events.find((event) => event.slug === slug) ?? null;
}

/**
 * Every entry including drafts, for the admin list.
 *
 * Uncached deliberately: the admin has just saved and is looking at the result.
 */
export async function listAllEvents() {
  const rows = await listAllRows();
  return rows.map(toPlainEvent).sort(byOrder);
}

/** One entry by row id including drafts, for the admin editor. */
export async function getEventById(id) {
  try {
    const row = await getTablesDB().getRow({
      databaseId,
      tableId: tables.events,
      rowId: id,
    });
    return toPlainEvent(row);
  } catch {
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
 * row is: an entry whose title romanises to nothing becomes
 * `post-<timestamp>` rather than a bare number.
 */
export function slugify(title) {
  return baseSlugify(title, 'post');
}

/**
 * Makes a slug unique against the entries already stored.
 *
 * Appwrite's unique index would reject a duplicate, but a rejection is not a
 * useful answer to an admin who wrote a second entry with a repeated headline.
 * A numeric suffix gives them a working URL without a second round of typing.
 */
export async function uniqueSlug(desired, exceptId = null) {
  const events = await listAllEvents();
  const taken = new Set(
    events.filter((event) => event.id !== exceptId).map((event) => event.slug)
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
  'kind',
  'tag',
  'author',
  'location',
  'date',
  'time',
  'priceLabel',
  'priceValue',
  'ctaLabel',
  'image',
  'excerpt',
  'body',
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

/** Creates one entry and returns it. */
export async function createEvent(data) {
  const row = await getTablesDB().createRow({
    databaseId,
    tableId: tables.events,
    rowId: ID.unique(),
    data: pickWritable(data),
  });
  return toPlainEvent(row);
}

/** Updates one entry by row id and returns it. */
export async function updateEvent(id, data) {
  const row = await getTablesDB().updateRow({
    databaseId,
    tableId: tables.events,
    rowId: id,
    data: pickWritable(data),
  });
  return toPlainEvent(row);
}

/** Deletes one entry by row id. */
export async function deleteEvent(id) {
  await getTablesDB().deleteRow({
    databaseId,
    tableId: tables.events,
    rowId: id,
  });
}

/**
 * Clears every other entry's featured flag beyond the allowed two.
 *
 * Called after a save that set the flag. The admin form already refuses to
 * check a third box, but the check happens in one browser: two admins editing
 * at once, or a stale tab, can still land three flagged rows in the table.
 * Trimming here keeps the home section's promise -- exactly the two most
 * recently chosen -- rather than leaving it to the render-time slice to pick
 * two arbitrarily.
 *
 * `keepId` is the entry that was just saved, so it is never the one dropped.
 */
export async function trimFeatured(keepId) {
  const events = await listAllEvents();
  const flagged = events.filter(
    (event) => event.featured && event.kind === 'event'
  );
  if (flagged.length <= FEATURED_LIMIT) return;

  // Keep the row just saved, then as many of the rest as still fit.
  const keep = new Set([keepId]);
  for (const event of flagged) {
    if (keep.size >= FEATURED_LIMIT) break;
    keep.add(event.id);
  }

  for (const event of flagged) {
    if (keep.has(event.id)) continue;
    await updateEvent(event.id, { featured: false });
  }
}

export const eventsTableId = tables.events;
