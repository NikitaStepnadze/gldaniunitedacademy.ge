import 'server-only';

import { ID } from 'node-appwrite';

import { databaseId, enquiriesTableId } from './config';
import { getTablesDB } from './server';

/** Upper bounds mirroring the column sizes set by the migration. */
const LIMITS = { name: 128, email: 254, phone: 32, childAge: 32, message: 4000 };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Validates a submitted enquiry.
 *
 * Returns `{ data }` when valid, or `{ errors }` -- a map of field name to
 * message key -- when not. Messages are keyed rather than written out so the
 * UI can render them in Georgian alongside the rest of the page.
 */
export function validateEnquiry(input) {
  const data = {
    name: clean(input?.name, LIMITS.name),
    email: clean(input?.email, LIMITS.email).toLowerCase(),
    phone: clean(input?.phone, LIMITS.phone),
    childAge: clean(input?.childAge, LIMITS.childAge),
    message: clean(input?.message, LIMITS.message),
  };

  const errors = {};
  if (!data.name) errors.name = 'required';
  if (!data.email) errors.email = 'required';
  else if (!EMAIL_PATTERN.test(data.email)) errors.email = 'invalid';
  if (!data.phone) errors.phone = 'required';

  return Object.keys(errors).length > 0 ? { errors } : { data };
}

/** Writes one validated enquiry and returns the created row's id. */
export async function createEnquiry({ fileIds = [], ...data }) {
  const tablesDB = getTablesDB();

  const row = await tablesDB.createRow({
    databaseId,
    tableId: enquiriesTableId,
    rowId: ID.unique(),
    // status and archived are set here rather than left to the column defaults
    // so a row always reads the same whichever path created it.
    data: { ...data, fileIds, status: 'new', archived: false },
  });

  return row.$id;
}

/**
 * Copies an enquiry row into a plain object.
 *
 * The SDK's rows cannot cross into a client component or be captured by a
 * server action -- React rejects them with "Only plain objects ... can be
 * passed to Client Components". Every admin read returns these instead.
 */
function toPlainEnquiry(row) {
  return {
    $id: row.$id,
    $createdAt: row.$createdAt,
    $updatedAt: row.$updatedAt,
    name: row.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    childAge: row.childAge ?? '',
    message: row.message ?? '',
    status: row.status ?? 'new',
    notes: row.notes ?? '',
    archived: Boolean(row.archived),
    fileIds: Array.isArray(row.fileIds) ? [...row.fileIds] : [],
  };
}

/* -------------------------------------------------------------------------
   Admin operations
   ------------------------------------------------------------------------- */

/** Workflow states an enquiry moves through, in order. */
export const STATUSES = ['new', 'contacted', 'trial', 'enrolled', 'declined'];

/** Georgian labels for the admin UI. */
export const STATUS_LABELS = {
  new: 'ახალი',
  contacted: 'დაკავშირებული',
  trial: 'საცდელზე',
  enrolled: 'ჩარიცხული',
  declined: 'უარი',
};

/**
 * Lists enquiries newest first.
 *
 * Archived rows are excluded unless asked for, so the default inbox view shows
 * only what still needs attention.
 */
export async function listEnquiries({ status, archived = false, limit = 100 } = {}) {
  const { Query } = await import('node-appwrite');
  const tablesDB = getTablesDB();

  const queries = [
    Query.equal('archived', archived),
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
  ];
  if (status) queries.push(Query.equal('status', status));

  const page = await tablesDB.listRows({
    databaseId,
    tableId: enquiriesTableId,
    queries,
  });

  return page.rows.map(toPlainEnquiry);
}

/** Counts enquiries per status, for the inbox filter badges. */
export async function countByStatus() {
  const rows = await listEnquiries({ limit: 500 });
  const counts = { all: rows.length };
  for (const status of STATUSES) {
    counts[status] = rows.filter((row) => row.status === status).length;
  }
  return counts;
}

/** Fetches one enquiry by id. */
export async function getEnquiry(rowId) {
  const tablesDB = getTablesDB();
  const row = await tablesDB.getRow({ databaseId, tableId: enquiriesTableId, rowId });
  return toPlainEnquiry(row);
}

/**
 * Updates the admin-controlled fields of an enquiry.
 *
 * Only status, notes and archived are writable here -- the details the parent
 * submitted are left alone, so the record of what they actually sent cannot be
 * edited after the fact.
 */
export async function updateEnquiry(rowId, { status, notes, archived }) {
  const tablesDB = getTablesDB();
  const data = {};

  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
    data.status = status;
  }
  if (notes !== undefined) data.notes = String(notes).slice(0, 8000);
  if (archived !== undefined) data.archived = Boolean(archived);

  const row = await tablesDB.updateRow({
    databaseId,
    tableId: enquiriesTableId,
    rowId,
    data,
  });
  return toPlainEnquiry(row);
}

/** Permanently deletes an enquiry and returns the file ids it referenced. */
export async function deleteEnquiry(rowId) {
  const tablesDB = getTablesDB();
  const row = await getEnquiry(rowId);
  await tablesDB.deleteRow({ databaseId, tableId: enquiriesTableId, rowId });
  return row.fileIds ?? [];
}
