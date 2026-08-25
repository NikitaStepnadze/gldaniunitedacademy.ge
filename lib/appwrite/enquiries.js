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
    data: {
      ...data,
      fileIds,
      photoId,
      source,
      status: DEFAULT_STATUS,
      archived: false,
      // A new submission has not been looked at yet; the admin list colours
      // it accordingly until someone opens it.
      seen: false,
    },
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
    status: normaliseStatus(row.status),
    notes: row.notes ?? '',
    archived: Boolean(row.archived),
    seen: Boolean(row.seen),
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

/**
 * Workflow states an enquiry moves through.
 *
 * An application arrives under review, then either becomes active or is
 * declined. Archiving is deliberately not one of these: a row can be archived
 * whatever its outcome, so it stays a separate flag with its own view rather
 * than a status that would overwrite the decision that was made.
 */
export const STATUSES = ['active', 'declined', 'review'];

/** Georgian labels for the admin UI. */
export const STATUS_LABELS = {
  active: 'აქტიური',
  declined: 'უარყოფილი',
  review: 'განხილვა',
};

/** The state a newly submitted application starts in. */
export const DEFAULT_STATUS = 'review';

/**
 * Maps the statuses the panel used before the set was reduced to three.
 *
 * Rows written under the old scheme still hold those values, and an unmapped
 * status would fall out of every filter and render as raw English text, so they
 * are translated on read instead of relying on a one-off data migration.
 */
const LEGACY_STATUSES = {
  new: 'review',
  contacted: 'review',
  trial: 'active',
  enrolled: 'active',
};

/** Normalises a stored status onto the current set. */
export function normaliseStatus(value) {
  if (STATUSES.includes(value)) return value;
  return LEGACY_STATUSES[value] ?? DEFAULT_STATUS;
}

/**
 * Every stored value that normalises to `status`.
 *
 * Filtering happens in the database against the raw column, while the table
 * shows the normalised status, so a filter that only matched the new value
 * would hide legacy rows the reader can plainly see under that label -- and
 * miscount the tab badge with them.
 */
function storedValuesFor(status) {
  const legacy = Object.entries(LEGACY_STATUSES)
    .filter(([, mapped]) => mapped === status)
    .map(([stored]) => stored);
  return [status, ...legacy];
}

/* -------------------------------------------------------------------------
   Searching and sorting
   ------------------------------------------------------------------------- */

/**
 * The sort orders the admin list offers.
 *
 * `field` is the plain-row property to compare and `type` picks the comparison,
 * because these columns are not alike: dates compare as dates, the child's age
 * is a numeric string that would sort "10" before "9" as text, and names are
 * Georgian and need a locale-aware collation rather than codepoint order.
 *
 * Sorting is applied in JS, not by the database, for the same reason as the
 * search below -- and because `childAge` is stored as a string, so an Appwrite
 * `orderAsc` on it would produce exactly the "10 before 9" ordering we are
 * trying to avoid.
 */
export const SORTS = {
  newest: { label: 'ჯერ ახალი', field: '$createdAt', type: 'date', dir: -1 },
  oldest: { label: 'ჯერ ძველი', field: '$createdAt', type: 'date', dir: 1 },
  nameAsc: { label: 'სახელი ა-ჰ', field: 'sortName', type: 'text', dir: 1 },
  nameDesc: { label: 'სახელი ჰ-ა', field: 'sortName', type: 'text', dir: -1 },
  ageAsc: { label: 'ასაკი ზრდადი', field: 'childAge', type: 'number', dir: 1 },
  ageDesc: { label: 'ასაკი კლებადი', field: 'childAge', type: 'number', dir: -1 },
  status: { label: 'სტატუსი', field: 'status', type: 'text', dir: 1 },
};

export const DEFAULT_SORT = 'newest';

/** The sources a row can come from, as a filter. */
export const SOURCES = ['registration', 'contact'];

export const SOURCE_LABELS = {
  registration: 'რეგისტრაცია',
  contact: 'შეტყობინება',
};

/**
 * The name a row sorts under.
 *
 * A registration is about the child and the list leads with their name, so
 * that is what "sort by name" has to mean for those rows; a contact enquiry
 * has no child, so it falls back to the sender. Matching the column the admin
 * is actually looking at is the point -- sorting by the `name` column would
 * order registrations by parent while displaying child names, which reads as
 * no ordering at all.
 */
function sortNameOf(row) {
  const child = `${row.childFirstName} ${row.childLastName}`.trim();
  return (row.source === 'registration' && child) || row.name || '';
}

/**
 * Every field the free-text search looks at, flattened into one string.
 *
 * Deliberately wide: an admin searching the inbox is trying to find one family
 * again, and they may remember any of a personal number, a phone, a street or
 * the child's name. Restricting the search to the columns that happen to be on
 * screen would make the ones that are not simply unfindable.
 */
function haystackOf(row) {
  return [
    row.name,
    row.email,
    row.phone,
    row.childFirstName,
    row.childLastName,
    row.childIdNumber,
    row.childAge,
    row.address,
    row.motherFirstName,
    row.motherLastName,
    row.motherPhone,
    row.motherIdNumber,
    row.fatherFirstName,
    row.fatherLastName,
    row.fatherPhone,
    row.fatherIdNumber,
    row.parentFirstName,
    row.parentLastName,
    row.message,
    row.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * True when a row matches the admin's query.
 *
 * Every whitespace-separated term must match somewhere, so typing more words
 * narrows rather than widens -- "გიორგი 2015" finds the Giorgi born in 2015
 * instead of every Giorgi plus everyone else from 2015.
 *
 * Digits are matched against a separator-stripped copy of the haystack as
 * well, because phone numbers and personal numbers are written with spaces,
 * dashes and a leading +, and a search for the number as it appears on a
 * screen would otherwise miss the row that stores it grouped.
 */
export function matchesSearch(row, search) {
  const terms = String(search ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const hay = haystackOf(row);
  const digits = hay.replace(/[\s\-()+]/g, '');

  return terms.every((term) => {
    if (hay.includes(term)) return true;
    const bare = term.replace(/[\s\-()+]/g, '');
    return /\d/.test(bare) && bare !== '' && digits.includes(bare);
  });
}

/** Compares two rows under one of the SORTS entries. */
function compareBy(a, b, sort) {
  const pick = (row) => (sort.field === 'sortName' ? sortNameOf(row) : row[sort.field]);
  const left = pick(a);
  const right = pick(b);

  if (sort.type === 'date') {
    return (new Date(left).getTime() - new Date(right).getTime()) * sort.dir;
  }

  if (sort.type === 'number') {
    /*
     * A missing or non-numeric age always sorts last, whichever direction the
     * admin picked. Treating it as 0 would park every contact enquiry -- which
     * has no age at all -- at the top of the ascending list, ahead of the
     * registrations the sort exists to order.
     */
    const ln = Number.parseFloat(left);
    const rn = Number.parseFloat(right);
    const lBad = Number.isNaN(ln);
    const rBad = Number.isNaN(rn);
    if (lBad && rBad) return 0;
    if (lBad) return 1;
    if (rBad) return -1;
    return (ln - rn) * sort.dir;
  }

  // 'ka' so Georgian letters order as a Georgian reader expects; codepoint
  // order would be close but puts the archaic letters in the wrong place.
  return String(left ?? '').localeCompare(String(right ?? ''), 'ka') * sort.dir;
}

/**
 * Lists enquiries, filtered, searched and sorted.
 *
 * Status and the archived flag are pushed down into Appwrite because they map
 * onto indexed columns and cut the number of rows fetched. Search and sort are
 * applied here in JS instead, for three reasons:
 *
 *  - the search spans ~20 columns, and Appwrite's `Query.search` needs a
 *    fulltext index per column, which the free plan limits;
 *  - `Query.search` matches whole words, so it would not find a family by the
 *    first few letters of a surname, which is how people actually search;
 *  - `childAge` is stored as a string, so a database sort on it orders "10"
 *    before "9".
 *
 * The row count here is one academy's applications -- hundreds, not millions --
 * so the cost of sorting them in memory is not worth an index budget.
 *
 * `limit` bounds what is *fetched*; filtering then happens on that page, so a
 * search only ever looks at rows that were read. It is deliberately generous
 * for that reason.
 */
export async function listEnquiries({
  status,
  archived = false,
  limit = 100,
  search = '',
  sort = DEFAULT_SORT,
  source,
} = {}) {
  const { Query } = await import('node-appwrite');
  const tablesDB = getTablesDB();

  const queries = [
    Query.equal('archived', archived),
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
  ];
  if (status) {
    const stored = storedValuesFor(status);
    /*
     * A row with no status reads as the default one, so that tab has to match
     * the unset column too -- otherwise those rows appear under "ყველა" and
     * nowhere else.
     */
    queries.push(
      status === DEFAULT_STATUS
        ? Query.or([Query.equal('status', stored), Query.isNull('status')])
        : Query.equal('status', stored)
    );
  }

  const page = await tablesDB.listRows({
    databaseId,
    tableId: enquiriesTableId,
    queries,
  });

  let rows = page.rows.map(toPlainEnquiry);

  // Applied after mapping so it reads the normalised row, not the raw column:
  // rows written before `source` existed default to 'contact' in toPlainEnquiry.
  if (source) rows = rows.filter((row) => row.source === source);

  if (search) rows = rows.filter((row) => matchesSearch(row, search));

  const order = SORTS[sort] ?? SORTS[DEFAULT_SORT];
  // Copied before sorting: `rows` may still be the array `map` returned, and
  // sorting in place would be a side effect on a value the caller passed us.
  return [...rows].sort((a, b) => compareBy(a, b, order));
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
 * Records that an admin has opened this enquiry.
 *
 * Kept apart from updateEnquiry, which takes a deliberate workflow decision:
 * this is a side effect of reading the page, and routing it through the same
 * function would make an accidental `seen` write look like a status change.
 *
 * Errors are swallowed. The flag only drives a colour in the list, so failing
 * to set it must not turn a readable application into an error page -- the
 * worst outcome is a row that stays marked new.
 */
export async function markEnquirySeen(rowId) {
  try {
    const tablesDB = getTablesDB();
    await tablesDB.updateRow({
      databaseId,
      tableId: enquiriesTableId,
      rowId,
      data: { seen: true },
    });
  } catch {
    // Ignore: see above.
  }
}

/**
 * Updates the workflow fields of an enquiry.
 *
 * Kept to status, notes and archived. The details the parent submitted go
 * through updateEnquiryDetails, which validates them; routing an edit through
 * here would write them unchecked.
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

/**
 * Validates an admin edit of the details a parent submitted.
 *
 * Deliberately laxer than validateRegistration. That function guards the public
 * form, where a wrong personal number is a typo to catch before it is stored.
 * This one guards a staff member fixing a record, often from a phone call: they
 * may know the child's name and nothing else yet, and a form that refuses to
 * save until every field is perfect would push them to keep the corrections in
 * their head instead.
 *
 * So the rule is "well-formed if present" rather than "present": anything
 * filled in has to be a plausible value, and anything left blank is allowed to
 * stay blank. What is never permitted is a value the column cannot hold or a
 * pair that contradicts itself.
 */
export function validateEnquiryEdit(input, { isRegistration } = {}) {
  const errors = {};
  const data = {};

  /** Trims to the column's size and records the field as edited. */
  const text = (key, limit) => {
    const value = clean(input?.[key], limit);
    data[key] = value;
    return value;
  };

  if (isRegistration) {
    text('childFirstName', LIMITS.childFirstName);
    text('childLastName', LIMITS.childLastName);
    text('address', LIMITS.address);

    const childId = text('childIdNumber', LIMITS.childIdNumber);
    if (childId && !ID_NUMBER_PATTERN.test(digitsOnly(childId))) {
      errors.childIdNumber = 'invalid';
    }

    /* The date of birth drives childAge, so it is recomputed here rather than
       edited separately -- two fields that can disagree is worse than one. */
    const dob = text('childDob', LIMITS.childDob);
    if (dob) {
      if (!DOB_PATTERN.test(dob)) {
        errors.childDob = 'invalid';
      } else {
        const parsed = new Date(`${dob}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob) {
          errors.childDob = 'invalid';
        } else {
          const years = ageFromDob(dob, new Date());
          if (years < MIN_AGE || years > MAX_AGE) errors.childDob = 'out_of_range';
          else data.childAge = String(years);
        }
      }
    } else {
      // Clearing the date clears the age with it.
      data.childAge = '';
    }

    const from = text('schoolFrom', LIMITS.schoolFrom);
    const to = text('schoolTo', LIMITS.schoolTo);
    if (from && !TIME_PATTERN.test(from)) errors.schoolFrom = 'invalid';
    if (to && !TIME_PATTERN.test(to)) errors.schoolTo = 'invalid';
    if (from && to && !errors.schoolFrom && !errors.schoolTo
        && minutesOf(to) <= minutesOf(from)) {
      errors.schoolTo = 'order';
    }

    /* Parents, each field independent. The public form's "one complete block"
       rule is not applied: a half-known parent is exactly the state an admin
       is trying to record before the next phone call. */
    for (const prefix of ['mother', 'father']) {
      text(`${prefix}FirstName`, LIMITS.parentFirstName);
      text(`${prefix}LastName`, LIMITS.parentLastName);

      const id = text(`${prefix}IdNumber`, LIMITS.idNumber);
      if (id && !ID_NUMBER_PATTERN.test(digitsOnly(id))) {
        errors[`${prefix}IdNumber`] = 'invalid';
      }

      const tel = text(`${prefix}Phone`, LIMITS.phone);
      if (tel && !PHONE_PATTERN.test(digitsOnly(tel))) {
        errors[`${prefix}Phone`] = 'invalid';
      }
    }

    /*
     * Which parent is the contact. Only a block with a name can hold that role,
     * so a stale pointer cannot survive the block being emptied.
     */
    const contactParent = clean(input?.contactParent, 16);
    const named = (prefix) => Boolean(data[`${prefix}FirstName`] || data[`${prefix}LastName`]);
    if (contactParent === 'mother' && named('mother')) data.contactParent = 'mother';
    else if (contactParent === 'father' && named('father')) data.contactParent = 'father';
    else if (named('mother')) data.contactParent = 'mother';
    else if (named('father')) data.contactParent = 'father';
    else data.contactParent = '';

    /* `name` and `phone` are the admin list's columns, copied from whichever
       parent is the contact. Recomputed here so the list cannot drift from the
       details below it. */
    const contact = data.contactParent;
    if (contact) {
      data.name = `${data[`${contact}FirstName`]} ${data[`${contact}LastName`]}`
        .trim()
        .slice(0, LIMITS.name);
      data.phone = data[`${contact}Phone`];
    } else {
      data.name = '';
      data.phone = '';
    }
  } else {
    /* A contact enquiry: the five fields it actually carries. Here `name` and
       `phone` are typed directly rather than derived. */
    text('name', LIMITS.name);
    text('childAge', LIMITS.childAge);

    const email = clean(input?.email, LIMITS.email).toLowerCase();
    data.email = email;
    if (email && !EMAIL_PATTERN.test(email)) errors.email = 'invalid';

    const phone = text('phone', LIMITS.phone);
    if (phone && !PHONE_PATTERN.test(digitsOnly(phone))) errors.phone = 'invalid';
  }

  text('message', LIMITS.message);

  if (Object.keys(errors).length > 0) return { errors };
  return { data };
}

/**
 * Writes an admin edit of the submitted details.
 *
 * Separate from updateEnquiry so the two cannot be confused: that one takes
 * workflow state, this one takes parent-supplied data and must be handed
 * already-validated values from validateEnquiryEdit.
 */
export async function updateEnquiryDetails(rowId, data) {
  const tablesDB = getTablesDB();
  const row = await tablesDB.updateRow({
    databaseId,
    tableId: enquiriesTableId,
    rowId,
    data,
  });
  return toPlainEnquiry(row);
}

/**
 * Replaces the file ids on a row.
 *
 * The photo and form 100 are stored as ids on the row but the bytes live in
 * storage, so adding or removing one is two operations that must not disagree.
 * The caller uploads or deletes first, then records the result here.
 */
export async function setEnquiryFiles(rowId, { photoId, fileIds }) {
  const tablesDB = getTablesDB();
  const data = {};
  if (photoId !== undefined) data.photoId = String(photoId ?? '');
  if (fileIds !== undefined) data.fileIds = (fileIds ?? []).map(String);

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
