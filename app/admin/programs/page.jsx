import Link from 'next/link';
import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import { FEATURED_LIMIT, listAllPrograms } from '../../../lib/appwrite/programs';

import {
  createProgramAction,
  moveProgramAction,
  toggleFeaturedAction,
  togglePublishedAction,
} from './actions';

export const dynamic = 'force-dynamic';

/** Banner for a failed action, keyed by the `error` an action redirects with. */
const ERRORS = {
  title: 'სათაური სავალდებულოა.',
};

/**
 * The programmes admin list.
 *
 * A table rather than the content editor's field-by-field form, because these
 * are rows an admin creates and deletes rather than a fixed set of slots. The
 * order of the table is the order of the cards on the site, which is why the
 * arrows are here and not buried in the editor: reordering is something you do
 * while looking at the list.
 */
export default async function ProgramsAdminPage({ searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const query = await searchParams;
  const error = ERRORS[query?.error];
  const deleted = query?.deleted === '1';

  const programs = await listAllPrograms();
  const featuredCount = programs.filter(
    (program) => program.featured && program.published
  ).length;

  return (
    <main className="admin-main">
      <header className="admin-head">
        <h1 className="admin-title">პროგრამები</h1>
        <p className="admin-subtitle">
          აქ იმართება ასაკობრივი ჯგუფები და პროგრამები. თითოეული პროგრამა ჩანს{' '}
          <Link href="/programs" target="_blank" rel="noopener noreferrer">
            პროგრამების გვერდზე
          </Link>{' '}
          და აქვს საკუთარი გვერდი. მთავარ გვერდზე გამოჩნდება მონიშნული{' '}
          {FEATURED_LIMIT} პროგრამა.
        </p>
      </header>

      {error && <p className="admin-msg error">{error}</p>}
      {deleted && <p className="admin-msg ok">პროგრამა წაშლილია.</p>}

      {featuredCount > FEATURED_LIMIT && (
        <p className="admin-msg error">
          მთავარ გვერდზე მონიშნულია {featuredCount} პროგრამა, გამოჩნდება მხოლოდ
          პირველი {FEATURED_LIMIT}.
        </p>
      )}

      <section className="admin-panel">
        <h2>ახალი პროგრამა</h2>
        {/*
          Creation is a single field on purpose. Everything else has a sensible
          empty rendering, so asking for a title and opening the editor gets the
          admin to the screen where the rest belongs, instead of making them fill
          a ten-field form before they can see anything.
        */}
        <form action={createProgramAction} className="admin-field-row">
          <div className="admin-field">
            <label htmlFor="new-title">სათაური</label>
            <input
              id="new-title"
              name="title"
              type="text"
              required
              maxLength={200}
              placeholder="მაგ. დამწყებთა ჯგუფი"
            />
          </div>
          <div className="admin-panel-actions">
            <button type="submit" className="admin-btn">
              დამატება
            </button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h2>არსებული პროგრამები ({programs.length})</h2>

        {programs.length === 0 ? (
          <p className="admin-subtitle">
            პროგრამა ჯერ არ არის. დაამატეთ პირველი ზემოთ.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>რიგი</th>
                  <th>სათაური</th>
                  <th>ასაკი</th>
                  <th>სიხშირე</th>
                  <th>მთავარზე</th>
                  <th>სტატუსი</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {programs.map((program, index) => (
                  <tr key={program.id}>
                    <td className="program-order-cell">
                      {/*
                        Two one-button forms rather than one form with two
                        submits: each needs its own bound direction, and a
                        server action's argument is bound at render time.
                      */}
                      <form action={moveProgramAction.bind(null, program.id, 'up')}>
                        <button
                          type="submit"
                          className="admin-btn secondary small"
                          disabled={index === 0}
                          title="ზემოთ"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveProgramAction.bind(null, program.id, 'down')}>
                        <button
                          type="submit"
                          className="admin-btn secondary small"
                          disabled={index === programs.length - 1}
                          title="ქვემოთ"
                        >
                          ↓
                        </button>
                      </form>
                    </td>
                    <td>
                      <Link href={`/admin/programs/${program.id}`}>{program.title}</Link>
                    </td>
                    <td>
                      {program.ageRange
                        ? `${program.ageRange} ${program.ageUnit}`.trim()
                        : '—'}
                    </td>
                    <td>{program.frequency || '—'}</td>
                    <td>
                      <form action={toggleFeaturedAction.bind(null, program.id)}>
                        <button type="submit" className="admin-btn secondary small">
                          {program.featured ? 'კი' : 'არა'}
                        </button>
                      </form>
                    </td>
                    <td>
                      <form action={togglePublishedAction.bind(null, program.id)}>
                        <button type="submit" className="admin-btn secondary small">
                          {program.published ? 'გამოქვეყნებული' : 'დამალული'}
                        </button>
                      </form>
                    </td>
                    <td>
                      <Link
                        className="admin-btn secondary small"
                        href={`/admin/programs/${program.id}`}
                      >
                        რედაქტირება
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
