import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import {
  CMS_TAG,
  listSettingRows,
  settingsTableId,
  updateValues,
} from '../../../lib/appwrite/content';

import ColorField from './ColorField';

export const dynamic = 'force-dynamic';

const HEX = /^#[0-9a-fA-F]{6}$/;

const GROUP_LABELS = {
  colors: 'საიტის ფერები',
  contact: 'საკონტაქტო ინფორმაცია',
};

export default async function DesignPage({ searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const query = await searchParams;
  const rows = await listSettingRows();

  // Same reason as the content page: keep the action's closure to primitives.
  const baseline = rows.map((row) => ({
    id: row.$id,
    value: row.value ?? '',
    kind: row.kind,
    label: row.label || row.key,
  }));

  const groups = {};
  for (const row of rows) {
    (groups[row.group || 'other'] ??= []).push(row);
  }

  async function save(formData) {
    'use server';

    const updates = [];
    const rejected = [];

    for (const row of baseline) {
      const next = formData.get(row.id);
      if (next === null) continue;
      const value = String(next).trim();

      // A malformed hex would be written straight into a CSS variable and
      // could break the palette site-wide, so reject rather than store it.
      if (row.kind === 'color' && value !== '' && !HEX.test(value)) {
        rejected.push(row.label);
        continue;
      }

      if (value !== row.value) updates.push({ rowId: row.id, value });
    }

    if (updates.length > 0) {
      await updateValues(settingsTableId, updates);
      revalidateTag(CMS_TAG);
    }

    const params = new URLSearchParams({ saved: String(updates.length) });
    if (rejected.length > 0) params.set('bad', rejected.join(', '));
    redirect(`/admin/design?${params}`);
  }

  return (
    <main className="admin-main">
      <h1 className="admin-title">ფერები და პარამეტრები</h1>
      <p className="admin-subtitle">ცვლილება მთელ საიტზე აისახება.</p>

      {query?.bad && (
        <p className="admin-msg error">
          არასწორი ფერის კოდი: {query.bad}. გამოიყენეთ ფორმატი #16244f.
        </p>
      )}
      {query?.saved !== undefined && !query?.bad && (
        <p className="admin-msg ok">
          {Number(query.saved) > 0
            ? `${query.saved} ცვლილება შენახულია.`
            : 'ცვლილება არ იყო.'}
        </p>
      )}

      <form action={save}>
        {Object.entries(groups).map(([group, items]) => (
          <div className="admin-panel" key={group}>
            <h2>{GROUP_LABELS[group] ?? group}</h2>

            {group === 'colors' ? (
              <div className="color-grid">
                {items.map((row) => (
                  <ColorField
                    key={row.$id}
                    id={row.$id}
                    name={row.$id}
                    label={row.label || row.key}
                    hint={row.key.replace(/^color\./, '--')}
                    defaultValue={row.value ?? ''}
                  />
                ))}
              </div>
            ) : (
              items.map((row) => (
                <div className="admin-field" key={row.$id}>
                  <label htmlFor={row.$id}>{row.label || row.key}</label>
                  <input
                    id={row.$id}
                    name={row.$id}
                    type={row.kind === 'email' ? 'email' : row.kind === 'phone' ? 'tel' : 'text'}
                    defaultValue={row.value ?? ''}
                  />
                </div>
              ))
            )}
          </div>
        ))}

        <button type="submit" className="admin-btn">
          შენახვა
        </button>
      </form>
    </main>
  );
}
