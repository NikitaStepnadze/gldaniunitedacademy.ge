import Link from 'next/link';
import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import { listEnquiries, STATUSES, STATUS_LABELS } from '../../../lib/appwrite/enquiries';

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

export default async function EnquiriesPage({ searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const params = await searchParams;
  const status = STATUSES.includes(params?.status) ? params.status : undefined;
  const archived = params?.archived === '1';

  const rows = await listEnquiries({ status, archived });

  // Counts come from the unfiltered set so the tabs show totals, not the
  // count of whatever is currently on screen.
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
  const exportQuery = exportParams.toString();
  const exportHref = `/api/admin/export${exportQuery ? `?${exportQuery}` : ''}`;

  const base = archived ? '/admin/enquiries?archived=1' : '/admin/enquiries';
  const link = (s) =>
    s
      ? `${base}${archived ? '&' : '?'}status=${s}`
      : base;

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
          ⭳ სიის ჩამოტვირთვა{status || archived ? ' (ფილტრით)' : ''}
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
        <Link
          href={archived ? '/admin/enquiries' : '/admin/enquiries?archived=1'}
          aria-current={archived ? 'page' : undefined}
        >
          {archived ? '← განაცხადები' : 'არქივი'}
        </Link>
      </div>

      <div className="admin-panel">
        {rows.length === 0 ? (
          <p className="admin-empty">
            {archived ? 'არქივი ცარიელია.' : 'ჯერ არცერთი განაცხადი არ არის.'}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ბავშვი / მშობელი</th>
                  <th>ტელეფონი</th>
                  <th>ასაკი</th>
                  <th>სტატუსი</th>
                  <th>ფაილები</th>
                  <th>თარიღი</th>
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
                  <tr key={row.$id}>
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
