import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import {
  CMS_TAG,
  contentTableId,
  listContentRows,
  updateValues,
} from '../../../lib/appwrite/content';

export const dynamic = 'force-dynamic';

const PAGE_LABELS = {
  home: 'მთავარი გვერდი',
  about: 'ჩვენ შესახებ',
  contact: 'კონტაქტი',
};

export default async function ContentPage({ searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const query = await searchParams;
  const rows = await listContentRows();

  // The save action closes over this, so keep it to plain primitives -- a
  // server action's closure is serialised just like client props are.
  const baseline = rows.map((row) => ({ id: row.$id, value: row.value ?? '' }));

  // Grouped by page so the editor reads like the site, not like a database.
  const groups = {};
  for (const row of rows) {
    const page = row.page || 'other';
    (groups[page] ??= []).push(row);
  }

  async function save(formData) {
    'use server';

    const updates = [];
    for (const row of baseline) {
      const next = formData.get(row.id);
      if (next === null) continue;
      const value = String(next);
      // Only write rows that actually changed -- avoids burning quota and
      // avoids touching $updatedAt on untouched rows.
      if (value !== row.value) updates.push({ rowId: row.id, value });
    }

    if (updates.length > 0) {
      await updateValues(contentTableId, updates);
      // Drops the cached CMS reads so the public pages pick the edit up on
      // their next request, without wiping the whole page cache.
      revalidateTag(CMS_TAG);
    }

    redirect(`/admin/content?saved=${updates.length}`);
  }

  const saved = query?.saved;

  return (
    <main className="admin-main">
      <h1 className="admin-title">ტექსტების რედაქტირება</h1>
      <p className="admin-subtitle">
        ცარიელი ველი ნიშნავს, რომ საიტზე დარჩება საწყისი ტექსტი.
      </p>

      {saved !== undefined && (
        <p className="admin-msg ok">
          {Number(saved) > 0
            ? `${saved} ცვლილება შენახულია.`
            : 'ცვლილება არ იყო.'}
        </p>
      )}

      <form action={save}>
        {Object.entries(groups).map(([page, items]) => (
          <div className="admin-panel" key={page}>
            <h2>{PAGE_LABELS[page] ?? page}</h2>
            {items.map((row) => (
              <div className="cms-row" key={row.$id}>
                <div className="admin-field" style={{ marginBottom: 0 }}>
                  <label htmlFor={row.$id}>
                    {row.label || row.key}{' '}
                    <span className="cms-key">{row.key}</span>
                  </label>
                  {row.kind === 'textarea' ? (
                    <textarea
                      id={row.$id}
                      name={row.$id}
                      rows={3}
                      defaultValue={row.value ?? ''}
                      placeholder="საწყისი ტექსტი რჩება"
                    />
                  ) : (
                    <input
                      id={row.$id}
                      name={row.$id}
                      type="text"
                      defaultValue={row.value ?? ''}
                      placeholder="საწყისი ტექსტი რჩება"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        <button type="submit" className="admin-btn">
          ცვლილებების შენახვა
        </button>
      </form>
    </main>
  );
}
