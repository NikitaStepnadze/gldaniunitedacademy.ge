'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * A column heading that sorts the table when clicked.
 *
 * The dropdown in the toolbar can already reach every order; this exists
 * because clicking the column is what people try first in a table, and having
 * both means neither has to be discovered. They write to the same `sort`
 * parameter, so the two controls can never disagree about the current order.
 *
 * `asc`/`desc` are the two SORTS keys this column toggles between. Clicking the
 * column that is already active flips it; clicking a different one starts at
 * that column's ascending order.
 */
export default function SortableHeader({ label, asc, desc, className }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = searchParams.get('sort') ?? 'newest';
  const isAsc = current === asc;
  const isDesc = current === desc;
  const active = isAsc || isDesc;

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', isAsc ? desc : asc);
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  return (
    <th className={className} aria-sort={active ? (isAsc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="admin-sort-btn" onClick={toggle}>
        {label}
        {/* The arrow shows the direction the data is in, not the direction a
            click would take it -- matching what every spreadsheet does. */}
        <span className={`admin-sort-arrow${active ? ' active' : ''}`} aria-hidden="true">
          {active ? (isAsc ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}
