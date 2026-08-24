import 'server-only';

import { unstable_cache } from 'next/cache';
import { Query } from 'node-appwrite';

import { databaseId, tables } from './config';
import { getTablesDB } from './server';

/**
 * Reads the CMS tables: editable text snippets and site settings.
 *
 * Both are keyed key/value tables, small enough to fetch whole.
 *
 * The public read paths are wrapped in `unstable_cache` under a tag. Without
 * it these are plain database calls, which Next cannot know to re-run: the
 * public pages would keep serving whatever the last build baked in, and an
 * admin's save would never show up on the site. Tagging lets the admin's save
 * call `revalidateTag` and drop exactly this data, leaving the rest of the
 * page cache intact.
 */
const PAGE_SIZE = 100;

/** Cache tag covering both CMS tables. */
export const CMS_TAG = 'cms';

/**
 * Copies the fields we use out of an Appwrite row.
 *
 * The SDK hands back objects React refuses to serialise across the
 * server/client boundary ("Only plain objects ... can be passed to Client
 * Components"). Anything that reaches a client component -- or is closed over
 * by a server action, which is serialised the same way -- has to be a plain
 * object first, so every read goes through here.
 */
function toPlainRow(row) {
  return {
    $id: row.$id,
    key: row.key ?? '',
    value: row.value ?? '',
    page: row.page ?? '',
    group: row.group ?? '',
    label: row.label ?? '',
    kind: row.kind ?? 'text',
    // Document order of the marker in the theme HTML; see the migration.
    order: typeof row.order === 'number' ? row.order : 0,
  };
}

/** Fetches every row of a table, following pagination. */
async function listAll(tableId) {
  const tablesDB = getTablesDB();
  const rows = [];
  let cursor;

  for (;;) {
    const queries = [Query.limit(PAGE_SIZE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({ databaseId, tableId, queries });
    rows.push(...page.rows);

    if (page.rows.length < PAGE_SIZE) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return rows;
}

/**
 * Returns { key: value } for every content row that has a value.
 *
 * Empty values are dropped deliberately: an empty row means "no override, use
 * whatever the theme markup already says". Filtering here keeps that rule in
 * one place, so callers can treat a missing key and an empty one alike.
 */
export const getContentMap = unstable_cache(
  async () => {
    const rows = await listAll(tables.content);
    const map = {};

    for (const row of rows) {
      if (typeof row.value === 'string' && row.value.trim() !== '') {
        map[row.key] = row.value;
      }
    }

    return map;
  },
  ['cms-content'],
  { tags: [CMS_TAG] }
);

/** Returns { key: value } for every setting that has a value. */
export const getSettingsMap = unstable_cache(
  async () => {
    const rows = await listAll(tables.settings);
    const map = {};

    for (const row of rows) {
      if (typeof row.value === 'string' && row.value.trim() !== '') {
        map[row.key] = row.value;
      }
    }

    return map;
  },
  ['cms-settings'],
  { tags: [CMS_TAG] }
);

/**
 * Full rows, including empty ones, for the admin editor UI.
 *
 * Sorted by the marker's position in the theme HTML rather than by key, so the
 * editor reads top-to-bottom in the same order as the page it edits. Sorting
 * by key is alphabetical, which puts the footer above the hero.
 */
export async function listContentRows() {
  const rows = await listAll(tables.content);
  return rows
    .map(toPlainRow)
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
}

/** Full rows, including empty ones, for the admin editor UI. */
export async function listSettingRows() {
  const rows = await listAll(tables.settings);
  return rows.map(toPlainRow).sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Updates one row's value by row id. */
export async function updateRowValue(tableId, rowId, value) {
  const tablesDB = getTablesDB();
  return tablesDB.updateRow({ databaseId, tableId, rowId, data: { value } });
}

/** Applies many { rowId, value } updates to one table. */
export async function updateValues(tableId, updates) {
  for (const { rowId, value } of updates) {
    await updateRowValue(tableId, rowId, value);
  }
}

export const contentTableId = tables.content;
export const settingsTableId = tables.settings;
