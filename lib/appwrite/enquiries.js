import 'server-only';

import { ID } from 'node-appwrite';

import { databaseId, enquiriesTableId } from './config';
import { getTablesDB } from './server';

/** Upper bounds mirroring the column sizes set by the migration. */
const LIMITS = {
  name: 128,
  email: 254,
  phone: 32,
  childAge: 32,
  message: 4000,
  childFirstName: 64,
  childLastName: 64,
  childDob: 16,
  childIdNumber: 32,
  parentFirstName: 64,
  parentLastName: 64,
  address: 256,
  schoolFrom: 8,
  schoolTo: 8,
  idNumber: 32,
};

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

/**
 * Matches a calendar date written as YYYY-MM-DD.
 *
 * The registration form uses `<input type="date">`, which submits in exactly
 * this format regardless of the locale the field displays, so the shape is
 * fixed rather than parsed leniently.
 */
const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Youngest and oldest the academy enrols; see the age copy on the site. */
const MIN_AGE = 4;
const MAX_AGE = 17;

/**
 * Turns a YYYY-MM-DD birth date into a whole-years age.
 *
 * Compares month/day before decrementing so a birthday later this year is not
 * counted, which a plain year subtraction would get wrong for most of the year.
 */
function ageFromDob(dob, now) {
  const [y, m, d] = dob.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) age -= 1;
  return age;
}

/**
 * Georgian personal number ("პირადი ნომერი"): exactly 11 digits.
 *
 * Checked after stripping spaces, because the number is often written in groups
 * and rejecting a correct number over its spacing is needless friction.
 */
const ID_NUMBER_PATTERN = /^\d{11}$/;

/** A time as `<input type="time">` submits it: HH:MM, 24-hour. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Digits only, ignoring the +, spaces and dashes people write numbers with.
 * Georgian mobile numbers are 9 digits; the upper bound leaves room for an
 * international prefix without accepting arbitrary text.
 */
const PHONE_PATTERN = /^\d{9,15}$/;

/** Strips the separators people type inside numbers before matching. */
function digitsOnly(value) {
  return value.replace(/[\s\-()+]/g, '');
}

/** Minutes since midnight, for comparing two HH:MM times. */
function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Validates one parent's block: name, surname, personal number and phone.
 *
 * Returns `{ filled, values, errors }`. `filled` reports whether any of the
 * four was supplied at all, which is what lets the caller require the mother's
 * block or the father's without requiring both -- a half-filled block is an
 * error, an untouched one is not.
 *
 * `prefix` is 'mother' or 'father', and error keys come back fully prefixed
 * (`motherPhone`) so they map straight onto the form's field names.
 */
function validateParent(input, prefix) {
  const firstName = clean(input?.[`${prefix}FirstName`], LIMITS.parentFirstName);
  const lastName = clean(input?.[`${prefix}LastName`], LIMITS.parentLastName);
  const idNumber = clean(input?.[`${prefix}IdNumber`], LIMITS.idNumber);
  const phone = clean(input?.[`${prefix}Phone`], LIMITS.phone);

  const values = {
    [`${prefix}FirstName`]: firstName,
    [`${prefix}LastName`]: lastName,
    [`${prefix}IdNumber`]: idNumber,
    [`${prefix}Phone`]: phone,
  };

  const filled = Boolean(firstName || lastName || idNumber || phone);
  const errors = {};

  // Only validated once the block has been started; an untouched parent is
  // legitimate, so flagging its four empty fields would be wrong.
  if (filled) {
    if (!firstName) errors[`${prefix}FirstName`] = 'required';
    if (!lastName) errors[`${prefix}LastName`] = 'required';

    if (!idNumber) errors[`${prefix}IdNumber`] = 'required';
    else if (!ID_NUMBER_PATTERN.test(digitsOnly(idNumber))) {
      errors[`${prefix}IdNumber`] = 'invalid';
    }

    if (!phone) errors[`${prefix}Phone`] = 'required';
    else if (!PHONE_PATTERN.test(digitsOnly(phone))) {
      errors[`${prefix}Phone`] = 'invalid';
    }
  }

  return { filled, values, errors };
}

/**
 * Validates a full registration application.
 *
 * Stricter than validateEnquiry: this is an enrolment application, so the
 * child's details are all mandatory, as is a complete set of details for at
 * least one parent. Returns the same `{ data }` / `{ errors }` shape.
 *
 * At least one parent -- not both -- because single-parent and single-guardian
 * families are ordinary, and demanding a father's personal number would leave
 * them unable to apply at all. Whichever block is started must be complete.
 *
 * It also sets the columns the rest of the system already reads:
 *
 *  - `name`     -- the contact parent's full name (the mother's when given,
 *                  otherwise the father's), so admin lists and the enquiry
 *                  detail heading keep working unchanged;
 *  - `phone`    -- that same parent's number, for the admin list column;
 *  - `childAge` -- derived from the date of birth rather than asked for, so it
 *                  cannot contradict it. Stored as a string to match the column.
 *
 * No email is collected: the academy reaches parents by phone, and asking for
 * an address nobody uses is one more field to get wrong. The column is optional
 * (see the migration) and simply left unset here.
 *
 * The date of birth is validated as a real date in a plausible range; a typo
 * that yields a 60-year-old or an unborn child is rejected rather than stored.
 */
export function validateRegistration(input, now = new Date()) {
  const childFirstName = clean(input?.childFirstName, LIMITS.childFirstName);
  const childLastName = clean(input?.childLastName, LIMITS.childLastName);
  const childDob = clean(input?.childDob, LIMITS.childDob);
  const childIdNumber = clean(input?.childIdNumber, LIMITS.childIdNumber);
  const address = clean(input?.address, LIMITS.address);
  const schoolFrom = clean(input?.schoolFrom, LIMITS.schoolFrom);
  const schoolTo = clean(input?.schoolTo, LIMITS.schoolTo);

  const errors = {};

  if (!childFirstName) errors.childFirstName = 'required';
  if (!childLastName) errors.childLastName = 'required';
  if (!address) errors.address = 'required';

  if (!childIdNumber) errors.childIdNumber = 'required';
  else if (!ID_NUMBER_PATTERN.test(digitsOnly(childIdNumber))) {
    errors.childIdNumber = 'invalid';
  }

  let age = '';
  if (!childDob) {
    errors.childDob = 'required';
  } else if (!DOB_PATTERN.test(childDob)) {
    errors.childDob = 'invalid';
  } else {
    // Round-tripping through Date catches impossible days such as 2020-02-31,
    // which the regex alone accepts.
    const parsed = new Date(`${childDob}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || !childDob.startsWith(parsed.toISOString().slice(0, 4))
        || parsed.toISOString().slice(0, 10) !== childDob) {
      errors.childDob = 'invalid';
    } else {
      const years = ageFromDob(childDob, now);
      if (years < MIN_AGE || years > MAX_AGE) errors.childDob = 'out_of_range';
      else age = String(years);
    }
  }

  /* --- school hours ----------------------------------------------------
     Both ends are required together: "from 09:00" with no end tells the
     coaches nothing about when the child is free to train. */
  if (!schoolFrom) errors.schoolFrom = 'required';
  else if (!TIME_PATTERN.test(schoolFrom)) errors.schoolFrom = 'invalid';

  if (!schoolTo) errors.schoolTo = 'required';
  else if (!TIME_PATTERN.test(schoolTo)) errors.schoolTo = 'invalid';
  else if (!errors.schoolFrom && minutesOf(schoolTo) <= minutesOf(schoolFrom)) {
    // Flagged on the end time, which is the one the parent would change.
    errors.schoolTo = 'order';
  }

  /* --- parents ---------------------------------------------------------- */
  const mother = validateParent(input, 'mother');
  const father = validateParent(input, 'father');

  Object.assign(errors, mother.errors, father.errors);

  if (!mother.filled && !father.filled) {
    // Reported on the mother's name because that is where the section starts,
    // so focusing the first bad field lands somewhere that makes sense.
    errors.motherFirstName = 'parent_required';
  }

  if (Object.keys(errors).length > 0) return { errors };

  // The mother is the default contact, falling back to the father when only his
  // block was filled in -- so `name` and `phone` are never empty.
  const contact = mother.filled ? 'mother' : 'father';
  const contactFirstName = mother.filled
    ? mother.values.motherFirstName
    : father.values.fatherFirstName;
  const contactLastName = mother.filled
    ? mother.values.motherLastName
    : father.values.fatherLastName;
  const contactPhone = mother.filled ? mother.values.motherPhone : father.values.fatherPhone;

  return {
    data: {
      childFirstName,
      childLastName,
      childDob,
      childIdNumber,
      address,
      schoolFrom,
      schoolTo,
      ...mother.values,
      ...father.values,
      message: clean(input?.message, LIMITS.message),
      // Columns the admin UI and contact flow already depend on.
      name: `${contactFirstName} ${contactLastName}`.trim().slice(0, LIMITS.name),
      phone: contactPhone,
      childAge: age,
      source: 'registration',
      // Which parent the name and phone above belong to, so the admin panel can
      // label the contact rather than leaving the reader to guess.
      contactParent: contact,
    },
  };
}

/**
 * Writes one validated enquiry or registration and returns the created row's id.
 *
 * `source` defaults to 'contact' so rows created by the contact form -- which
 * does not send the field -- are still labelled explicitly rather than relying
 * on the column default.
 */
export async function createEnquiry({ fileIds = [], photoId = '', source = 'contact', ...data }) {
  const tablesDB = getTablesDB();

  const row = await tablesDB.createRow({
    databaseId,
    tableId: enquiriesTableId,
    rowId: ID.unique(),
    // status and archived are set here rather than left to the column defaults
    // so a row always reads the same whichever path created it.
    data: { ...data, fileIds, photoId, source, status: 'new', archived: false },
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
    // Registration fields. Empty on rows the contact form created.
    childFirstName: row.childFirstName ?? '',
    childLastName: row.childLastName ?? '',
    childDob: row.childDob ?? '',
    childIdNumber: row.childIdNumber ?? '',
    address: row.address ?? '',
    schoolFrom: row.schoolFrom ?? '',
    schoolTo: row.schoolTo ?? '',
    motherFirstName: row.motherFirstName ?? '',
    motherLastName: row.motherLastName ?? '',
    motherIdNumber: row.motherIdNumber ?? '',
    motherPhone: row.motherPhone ?? '',
    fatherFirstName: row.fatherFirstName ?? '',
    fatherLastName: row.fatherLastName ?? '',
    fatherIdNumber: row.fatherIdNumber ?? '',
    fatherPhone: row.fatherPhone ?? '',
    contactParent: row.contactParent ?? '',
    photoId: row.photoId ?? '',
    source: row.source ?? 'contact',
    /*
     * Superseded by the mother/father columns, kept so applications submitted
     * before the split still show a parent name in the admin panel.
     */
    parentFirstName: row.parentFirstName ?? '',
    parentLastName: row.parentLastName ?? '',
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
