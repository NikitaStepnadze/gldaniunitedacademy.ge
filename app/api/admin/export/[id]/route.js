import { isAuthenticated } from '../../../../../lib/appwrite/auth';
import { getEnquiry } from '../../../../../lib/appwrite/enquiries';
import { buildEnquiryWorkbook, safeFilename, XLSX_CONTENT_TYPE } from '../../../../../lib/export';

export const dynamic = 'force-dynamic';

/**
 * Exports one enquiry as its own Excel workbook.
 *
 * Laid out vertically -- field name, value -- so it reads and prints like the
 * application form itself rather than as one row of a wide table.
 *
 * The file is named after the person it describes, so a folder of these is
 * navigable without opening each one.
 */
export async function GET(request, { params }) {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  let row;
  try {
    row = await getEnquiry(id);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const buffer = await buildEnquiryWorkbook(row);

  const childName = `${row.childFirstName} ${row.childLastName}`.trim();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = safeFilename([childName || row.name || 'განაცხადი'], stamp);

  return new Response(buffer, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      // See the bulk route: Georgian names need the UTF-8 `filename*` form,
      // with an ASCII fallback for clients that do not support it.
      'Content-Disposition':
        `attachment; filename="registration-${id}.xlsx"; `
        + `filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
