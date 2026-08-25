import Link from 'next/link';
import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import {
  DEFAULT_SORT,
  listEnquiries,
  SORTS,
  SOURCE_LABELS,
  SOURCES,
  STATUSES,
  STATUS_LABELS,
} from '../../../lib/appwrite/enquiries';

import EnquiryToolbar from './EnquiryToolbar';
import SortableHeader from './SortableHeader';

export const dynamic = 'force-dynamic';

/** Formats an ISO timestamp for a Georgian reader. */
function formatDate(iso) {
  return new Date(iso).toLocaleString('ka-GE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The sort dropdown's options, as { key: label }. */
const SORT_OPTIONS = Object.fromEntries(
  Object.entries(SORTS).map(([key, sort]) => [key, sort.label])
);

export default async function EnquiriesPage({ searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const params = await searchParams;

  const status = STATUSES.includes(params?.status) ? params.status : undefined;
  const archived = params?.archived === '1';
  const search = typeof params?.q === 'string' ? params.q.trim() : '';
  const source = SOURCES.includes(params?.source) ? params.source : undefined;
  // Falls back rather than 404s: a stale bookmark naming a sort that no longer
  // exists should still open the list.
  const sort = SORTS[params?.sort] ? params.sort : DEFAULT_SORT;

  const rows = await listEnquiries({ status, archived, search, sort, source });

  /*
   * Counts come from the unfiltered set so the status tabs keep showing what is
   * in each status, not what is in each status *and* matches the current
   * search. A tab reading 0 because of a search term the admin is about to
   * clear would be actively misleading.
   */
  const all = await listEnquiries({ archived, limit: 500 });
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])
  );

  /*
   * The export URL mirrors the filter state exactly, so "download what I am
   * looking at" needs no second set of controls to keep in sync.
   */
  const exportParams = new URLSearchParams();
  if (status) exportParams.set('status', status);
  if (archived) exportParams.set('archived', '1');
  if (search) exportParams.set('q', search);
  if (source) exportParams.set('source', source);
  if (sort !== DEFAULT_SORT) exportParams.set('sort', sort);
  const exportQuery = exportParams.toString();
  const exportHref = `/api/admin/export${exportQuery ? `?${exportQuery}` : ''}`;

  /**
   * Builds a status-tab link that preserves the search, sort and type filters.
   *
   * Rebuilt from the current parameters rather than written out, because
   * dropping them turned every tab click into a silent reset of the admin's
   * search -- they would filter to a family, click a status, and lose it.
   */
  function link(nextStatus) {
    const query = new URLSearchParams();
    if (archived) query.set('archived', '1');
    if (nextStatus) query.set('status', nextStatus);
    if (search) query.set('q', search);
    if (source) query.set('source', source);
    if (sort !== DEFAULT_SORT) query.set('sort', sort);
    const qs = query.toString();
    return `/admin/enquiries${qs ? `?${qs}` : ''}`;
  }

  /** The archive toggle, keeping everything except the archived flag. */
  function archiveLink() {
    const query = new URLSearchParams();
    if (!archived) query.set('archived', '1');
    if (status) query.set('status', status);
    if (search) query.set('q', search);
    if (source) query.set('source', source);
    if (sort !== DEFAULT_SORT) query.set('sort', sort);
    const qs = query.toString();
    return `/admin/enquiries${qs ? `?${qs}` : ''}`;
  }

  const filtering = search !== '' || source !== undefined;

  return (
    <main className="admin-main">
      <h1 className="admin-title">
        {archived ? 'დაარქივებული განაცხადები' : 'განაცხადები'}
      </h1>
      <p className="admin-subtitle">
        {all.length} განაცხადი{status ? ` · ფილტრი: ${STATUS_LABELS[status]}` : ''}
      </p>

      {/*
        * Export links, as plain <a> rather than next/link: the response is a
        * file download, not a page, so a client-side navigation would try to
        * render the CSV as a route. The first link carries the current filter
        * so the file matches what is on screen; the second ignores it and
        * takes everything, archive included.
        */}
      <div className="admin-export">
        <a className="admin-btn secondary small" href={exportHref} download>
          ⭳ სიის ჩამოტვირთვა{status || archived || filtering ? ' (ფილტრით)' : ''}
        </a>
        <a className="admin-btn secondary small" href="/api/admin/export?all=1" download>
          ⭳ ყველა (არქივთან ერთად)
        </a>
      </div>

      <div className="admin-filters">
        <Link href={link()} aria-current={!status ? 'page' : undefined}>
          ყველა <span className="admin-count">{all.length}</span>
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={link(s)} aria-current={status === s ? 'page' : undefined}>
            {STATUS_LABELS[s]} <span className="admin-count">{counts[s]}</span>
          </Link>
        ))}
        {/*
          * The archive sits in the same row as the statuses because it is one
          * more thing to filter by, but it is a view rather than a status --
          * archived rows keep their own status -- so it links out to the
          * archived list instead of adding `?status=`.
          */}
        <Link href={archiveLink()} aria-current={archived ? 'page' : undefined}>
          {archived ? '← განაცხადები' : 'არქივი'}
        </Link>
      </div>

      {/*
        * Search, type filter and sort. A client component because it has to
        * debounce typing and keep focus in the box across the re-render; it
        * drives this server component through the URL rather than holding any
        * of the list state itself.
        */}
      <EnquiryToolbar
        sorts={SORT_OPTIONS}
        sources={SOURCES}
        sourceLabels={SOURCE_LABELS}
        total={all.length}
        shown={rows.length}
      />

      <div className="admin-panel">
        {rows.length === 0 ? (
          <p className="admin-empty">
            {filtering
              ? 'ამ ძებნას შედეგი არ მოჰყოლია. სცადეთ სხვა სიტყვა ან მოხსენით ფილტრი.'
              : archived
                ? 'არქივი ცარიელია.'
                : 'ჯერ არცერთი განაცხადი არ არის.'}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <SortableHeader label="ბავშვი / მშობელი" asc="nameAsc" desc="nameDesc" />
                  <th>ტელეფონი</th>
                  <SortableHeader label="ასაკი" asc="ageAsc" desc="ageDesc" />
                  <th>სტატუსი</th>
                  <th>ფაილები</th>
                  <SortableHeader label="თარიღი" asc="oldest" desc="newest" />
                  {/* Per-application download; the header is blank because
                      the icons below label themselves. */}
                  <th aria-label="ჩამოტვირთვა" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  /*
                   * A registration is about the child, so they lead the row and
                   * the parent goes underneath. Contact enquiries have no child
                   * name, so they keep leading with the sender and show their
                   * email -- which registrations no longer collect.
                   */
                  const childName = `${row.childFirstName} ${row.childLastName}`.trim();
                  const isRegistration = row.source === 'registration';
                  const primary = (isRegistration && childName) || row.name;
                  const secondary = isRegistration ? row.name : row.email;

                  return (
                  /*
                   * Unopened applications are tinted so a new arrival stands
                   * out in a long list; the tint clears once someone opens it.
                   * Archived rows are left plain -- nothing in the archive is
                   * waiting to be actioned, so coloring them would be noise.
                   */
                  <tr
                    key={row.$id}
                    className={archived ? undefined : (row.seen ? 'row-seen' : 'row-new')}
                  >
                    <td>
                      <Link href={`/admin/enquiries/${row.$id}`}>{primary}</Link>
                      <div style={{ color: '#8a93a8', fontSize: 12 }}>{secondary}</div>
                    </td>
                    <td>{row.phone}</td>
                    <td>{row.childAge || '—'}</td>
                    <td>
                      <span className={`pill ${row.status}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td>{row.fileIds?.length ? `${row.fileIds.length} 📎` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', color: '#8a93a8' }}>
                      {formatDate(row.$createdAt)}
                    </td>
                    <td>
                      <a
                        className="admin-row-download"
                        href={`/api/admin/export/${row.$id}`}
                        download
                        title="ამ განაცხადის ჩამოტვირთვა"
                      >
                        ⭳
                      </a>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
