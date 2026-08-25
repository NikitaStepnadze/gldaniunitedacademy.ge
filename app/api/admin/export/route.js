import { isAuthenticated } from '../../../../lib/appwrite/auth';
import {
  DEFAULT_SORT,
  listEnquiries,
  SORTS,
  SOURCES,
  STATUSES,
  STATUS_LABELS,
} from '../../../../lib/appwrite/enquiries';
import { buildEnquiriesWorkbook, safeFilename, XLSX_CONTENT_TYPE } from '../../../../lib/export';

export const dynamic = 'force-dynamic';

/**
 * Exports enquiries as an Excel workbook for a signed-in admin.
 *
 * Takes the same `status` and `archived` parameters as the admin list, so the
 * export matches whatever the admin is looking at rather than always dumping
 * everything. `?all=1` overrides both and takes every row, archived included,
 * which is what a backup or a year-end report wants.
 */
export async function GET(request) {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const exportAll = searchParams.get('all') === '1';
  const statusParam = searchParams.get('status');
  const status = STATUSES.includes(statusParam) ? statusParam : undefined;
  const archived = searchParams.get('archived') === '1';

  /*
   * The search, type filter and sort the admin had on screen.
   *
   * Carried through so "download the list" keeps meaning "download what I am
   * looking at" now that the list can be searched. Without these the button
   * silently exported every row of the status instead of the handful the
   * admin had filtered down to -- which is the opposite of what a filtered
   * export is for, and easy not to notice until the wrong file is sent on.
   */
  const search = (searchParams.get('q') ?? '').trim();
  const sourceParam = searchParams.get('source');
  const source = SOURCES.includes(sourceParam) ? sourceParam : undefined;
  const sortParam = searchParams.get('sort');
  const sort = SORTS[sortParam] ? sortParam : DEFAULT_SORT;

  /*
   * The limit is well above any plausible number of applications for a single
   * academy and is here so a runaway read cannot hang the request. If it is
   * ever reached the export would truncate silently, so it is logged.
   */
  const LIMIT = 2000;

  let rows;
  if (exportAll) {
    // `?all=1` is the backup button and deliberately ignores every filter,
    // search included.
    const [live, archive] = await Promise.all([
      listEnquiries({ archived: false, limit: LIMIT }),
      listEnquiries({ archived: true, limit: LIMIT }),
    ]);
    rows = [...live, ...archive];
  } else {
    rows = await listEnquiries({ status, archived, limit: LIMIT, search, sort, source });
  }

  if (rows.length >= LIMIT) {
    console.warn(`[export] hit the ${LIMIT}-row limit; the workbook may be incomplete`);
  }

  const buffer = await buildEnquiriesWorkbook(rows, {
    title: status ? STATUS_LABELS[status] : (archived ? 'არქივი' : 'განაცხადები'),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = safeFilename(
    exportAll
      ? ['განაცხადები', 'ყველა']
      : ['განაცხადები', archived ? 'არქივი' : null, status ? STATUS_LABELS[status] : null],
    stamp
  );

  return new Response(buffer, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      /*
       * `filename*` with UTF-8 encoding, because the name is Georgian and a
       * plain `filename=` header may only carry Latin-1. The ASCII fallback is
       * there for anything that does not understand the extended form.
       */
      'Content-Disposition':
        `attachment; filename="registrations-${stamp}.xlsx"; `
        + `filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
