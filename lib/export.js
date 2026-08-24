import 'server-only';

import ExcelJS from 'exceljs';

import { STATUS_LABELS } from './appwrite/enquiries';

/**
 * Spreadsheet export of enquiries and registrations.
 *
 * Writes real .xlsx workbooks rather than CSV. CSV looked like the lighter
 * choice, but Excel decides how to split a CSV by the *reader's* Windows list
 * separator, so the same file becomes one unusable column on any machine whose
 * locale disagrees with whichever delimiter was written. A workbook carries its
 * own structure, so it opens as a table everywhere -- and column widths,
 * a frozen header and text-formatted phone numbers come with it.
 */

/** How the stored contact-parent pointer is written in the sheet. */
const CONTACT_LABELS = { mother: 'დედა', father: 'მამა' };

/**
 * Every exportable field, in the order it appears.
 *
 * One list drives both the bulk sheet (as columns) and the single-person sheet
 * (as rows), so the two can never fall out of step. Written out by hand rather
 * than derived from the row, so adding a database column does not silently
 * reshape a file the office already has a routine around.
 *
 * `width` is the bulk sheet's column width; free-text fields get more room.
 * `registrationOnly` marks the fields a contact-form enquiry never fills, so
 * the per-person sheet can leave them out instead of printing a block of
 * blank rows.
 */
export const FIELDS = [
  { header: 'თარიღი', width: 18, value: (row) => formatDate(row.$createdAt) },
  {
    header: 'ტიპი',
    width: 14,
    value: (row) => (row.source === 'registration' ? 'რეგისტრაცია' : 'შეტყობინება'),
  },
  { header: 'სტატუსი', width: 12, value: (row) => STATUS_LABELS[row.status] ?? row.status },

  { header: 'ბავშვის სახელი', width: 16, registrationOnly: true, value: (r) => r.childFirstName },
  { header: 'ბავშვის გვარი', width: 16, registrationOnly: true, value: (r) => r.childLastName },
  { header: 'დაბადების თარიღი', width: 16, registrationOnly: true, value: (r) => r.childDob },
  { header: 'ასაკი', width: 8, value: (r) => r.childAge },
  {
    header: 'ბავშვის პირადი ნომერი',
    width: 20,
    registrationOnly: true,
    text: true,
    value: (r) => r.childIdNumber,
  },
  { header: 'მისამართი', width: 30, registrationOnly: true, value: (r) => r.address },
  { header: 'სკოლა (დან)', width: 12, registrationOnly: true, value: (r) => r.schoolFrom },
  { header: 'სკოლა (მდე)', width: 12, registrationOnly: true, value: (r) => r.schoolTo },

  { header: 'დედის სახელი', width: 16, registrationOnly: true, value: (r) => r.motherFirstName },
  { header: 'დედის გვარი', width: 16, registrationOnly: true, value: (r) => r.motherLastName },
  {
    header: 'დედის პირადი ნომერი',
    width: 20,
    registrationOnly: true,
    text: true,
    value: (r) => r.motherIdNumber,
  },
  {
    header: 'დედის ტელეფონი',
    width: 16,
    registrationOnly: true,
    text: true,
    value: (r) => r.motherPhone,
  },

  { header: 'მამის სახელი', width: 16, registrationOnly: true, value: (r) => r.fatherFirstName },
  { header: 'მამის გვარი', width: 16, registrationOnly: true, value: (r) => r.fatherLastName },
  {
    header: 'მამის პირადი ნომერი',
    width: 20,
    registrationOnly: true,
    text: true,
    value: (r) => r.fatherIdNumber,
  },
  {
    header: 'მამის ტელეფონი',
    width: 16,
    registrationOnly: true,
    text: true,
    value: (r) => r.fatherPhone,
  },
  {
    header: 'საკონტაქტო მშობელი',
    width: 18,
    registrationOnly: true,
    value: (r) => CONTACT_LABELS[r.contactParent] ?? '',
  },

  { header: 'საკონტაქტო პირი', width: 20, value: (r) => r.name },
  { header: 'ტელეფონი', width: 16, text: true, value: (r) => r.phone },
  { header: 'ელფოსტა', width: 24, value: (r) => r.email },
  { header: 'შეტყობინება', width: 40, value: (r) => r.message },
  { header: 'ადმინის ჩანაწერი', width: 30, value: (r) => r.notes },
  { header: 'ფაილები', width: 10, value: (r) => String(r.fileIds?.length ?? 0) },
  { header: 'ფოტო', width: 8, value: (r) => (r.photoId ? 'კი' : 'არა') },
  { header: 'არქივი', width: 8, value: (r) => (r.archived ? 'კი' : 'არა') },
];

/**
 * Date as `DD.MM.YYYY HH:MM`.
 *
 * Not the locale-formatted string the admin table uses: `toLocaleString('ka-GE')`
 * can emit Georgian digits, which a spreadsheet will not read as a date.
 */
function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ink and gold, matching the admin panel's header styling. */
const HEADER_FILL = 'FF1B2130';
const HEADER_FONT = 'FFFFFFFF';
const LABEL_FILL = 'FFF4F5F7';

/**
 * Writes one value into a cell.
 *
 * Fields flagged `text` are forced to a text format. Phone numbers and personal
 * numbers are digit strings that Excel would otherwise convert to numbers --
 * dropping the leading zero from `0599...` and rendering an 11-digit personal
 * number in scientific notation. Both are silent corruptions of exactly the
 * data the office needs to read back.
 */
function writeCell(cell, value, field) {
  const text = value == null ? '' : String(value);
  cell.value = text;
  if (field?.text && text) cell.numFmt = '@';
}

/**
 * Builds the bulk workbook: one row per enquiry, one column per field.
 *
 * The header row is frozen so it stays visible while scrolling a long list,
 * and an autofilter is set so the office can sort and filter without
 * formatting anything themselves.
 */
export async function buildEnquiriesWorkbook(rows, { title = 'განაცხადები' } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gldani United Academy';

  const sheet = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = FIELDS.map((field) => ({
    header: field.header,
    width: field.width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;

  for (const row of rows) {
    const added = sheet.addRow([]);
    FIELDS.forEach((field, index) => {
      writeCell(added.getCell(index + 1), field.value(row), field);
    });
    added.alignment = { vertical: 'top', wrapText: true };
  }

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: FIELDS.length },
    };
  }

  return workbook.xlsx.writeBuffer();
}

/**
 * Builds a single person's workbook: field name on the left, value on the right.
 *
 * Laid out vertically rather than as a one-row table because this file is read
 * about one child -- scrolling sideways through 28 columns to read one
 * application is the thing the layout should avoid. It prints on a page as-is.
 *
 * Contact-form enquiries drop the registration-only fields rather than showing
 * a column of empty rows for a child who was never named.
 */
export async function buildEnquiryWorkbook(row) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gldani United Academy';

  const sheet = workbook.addWorksheet('განაცხადი', {
    // Fits the two columns onto one printed page.
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: {
      left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3,
    } },
  });

  sheet.columns = [
    { key: 'label', width: 26 },
    { key: 'value', width: 46 },
  ];

  const isRegistration = row.source === 'registration';
  const childName = `${row.childFirstName} ${row.childLastName}`.trim();

  /* A title row, so a printed sheet says who it is about without the reader
     having to match it against a filename. */
  const heading = sheet.addRow([(isRegistration && childName) || row.name || 'განაცხადი', '']);
  sheet.mergeCells(heading.number, 1, heading.number, 2);
  heading.font = { bold: true, size: 14, color: { argb: HEADER_FONT } };
  heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  heading.alignment = { vertical: 'middle', horizontal: 'center' };
  heading.height = 28;

  sheet.addRow([]);

  for (const field of FIELDS) {
    if (field.registrationOnly && !isRegistration) continue;

    const added = sheet.addRow([]);
    const label = added.getCell(1);
    label.value = field.header;
    label.font = { bold: true };
    label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_FILL } };
    label.alignment = { vertical: 'top' };

    const cell = added.getCell(2);
    writeCell(cell, field.value(row), field);
    cell.alignment = { vertical: 'top', wrapText: true };
  }

  return workbook.xlsx.writeBuffer();
}

/** The MIME type Excel and Google Sheets expect for an .xlsx workbook. */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Builds a safe download filename.
 *
 * Names are Georgian, and a raw name can carry quotes, slashes or newlines
 * that would break the Content-Disposition header or escape the filename.
 * Latin-1 header values cannot carry Georgian at all, so callers send this
 * through the header's `filename*` form.
 */
export function safeFilename(parts, stamp) {
  const base = parts
    .filter(Boolean)
    .join('-')
    .replace(/[\\/:*?"<>|\r\n]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return `${base || 'export'}-${stamp}.xlsx`;
}
