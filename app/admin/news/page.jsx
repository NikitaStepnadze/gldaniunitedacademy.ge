import Link from 'next/link';
import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import { FEATURED_LIMIT, listAllEvents } from '../../../lib/appwrite/events';

import {
  createEntryAction,
  moveEntryAction,
  toggleFeaturedAction,
  togglePublishedAction,
} from './actions';

export const dynamic = 'force-dynamic';

/** Banner for a failed action, keyed by the `error` an action redirects with. */
const ERRORS = {
  title: 'სათაური სავალდებულოა.',
  featuredKind: 'მთავარ გვერდზე მხოლოდ ღონისძიება შეიძლება გამოჩნდეს.',
};

/** How each kind is named in the panel. */
const KIND_LABELS = {
  news: 'სიახლე',
  event: 'ღონისძიება',
};

/**
 * One block of the list: every entry of a single kind, in display order.
 *
 * Rendered as two tables rather than one with a kind column, because the two
 * are ordered independently and the arrows act within a block. A single table
 * would show an "up" arrow next to an entry whose neighbour above is of the
 * other kind, and pressing it would appear to do nothing.
 */
function EntryTable({ kind, entries, emptyText }) {
  if (entries.length === 0) {
    return <p className="admin-subtitle">{emptyText}</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>რიგი</th>
            <th>სათაური</th>
            {kind === 'news' ? <th>კატეგორია</th> : <th>ადგილი</th>}
            <th>თარიღი</th>
            {kind === 'event' && <th>მთავარზე</th>}
            <th>სტატუსი</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.id}>
              <td className="entry-order-cell">
                {/*
                  Two one-button forms rather than one form with two submits:
                  each needs its own bound direction, and a server action's
                  argument is bound at render time.
                */}
                <form action={moveEntryAction.bind(null, entry.id, 'up')}>
                  <button
                    type="submit"
                    className="admin-btn secondary small"
                    disabled={index === 0}
                    title="ზემოთ"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveEntryAction.bind(null, entry.id, 'down')}>
                  <button
                    type="submit"
                    className="admin-btn secondary small"
                    disabled={index === entries.length - 1}
                    title="ქვემოთ"
                  >
                    ↓
                  </button>
                </form>
              </td>
              <td>
                <Link href={`/admin/news/${entry.id}`}>{entry.title}</Link>
              </td>
              <td>{(kind === 'news' ? entry.tag : entry.location) || '—'}</td>
              <td>{entry.date || '—'}</td>
              {kind === 'event' && (
                <td>
                  <form action={toggleFeaturedAction.bind(null, entry.id)}>
                    <button type="submit" className="admin-btn secondary small">
                      {entry.featured ? 'კი' : 'არა'}
                    </button>
                  </form>
                </td>
              )}
              <td>
                <form action={togglePublishedAction.bind(null, entry.id)}>
                  <button type="submit" className="admin-btn secondary small">
                    {entry.published ? 'გამოქვეყნებული' : 'დამალული'}
                  </button>
                </form>
              </td>
              <td>
                <Link
                  className="admin-btn secondary small"
                  href={`/admin/news/${entry.id}`}
                >
                  რედაქტირება
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The news and events admin list.
 *
 * A table rather than the content editor's field-by-field form, because these
 * are rows an admin creates and deletes rather than a fixed set of slots. The
 * order of the table is the order of the cards on the site, which is why the
 * arrows are here and not buried in the editor: reordering is something you do
 * while looking at the list.
 */
export default async function NewsAdminPage({ searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const query = await searchParams;
  const error = ERRORS[query?.error];
  const deleted = query?.deleted === '1';

  const entries = await listAllEvents();
  const news = entries.filter((entry) => entry.kind === 'news');
  const events = entries.filter((entry) => entry.kind === 'event');

  const featuredCount = events.filter(
    (entry) => entry.featured && entry.published
  ).length;

  return (
    <main className="admin-main">
      <header className="admin-head">
        <h1 className="admin-title">სიახლეები და ღონისძიებები</h1>
        <p className="admin-subtitle">
          აქ იმართება{' '}
          <Link href="/news" target="_blank" rel="noopener noreferrer">
            სიახლეების გვერდი
          </Link>
          . თითოეულ ჩანაწერს აქვს საკუთარი გვერდი, რაც საიტს საძიებო სისტემებში
          ეხმარება. მთავარ გვერდზე გამოჩნდება მონიშნული {FEATURED_LIMIT}{' '}
          ღონისძიება.
        </p>
      </header>

      {error && <p className="admin-msg error">{error}</p>}
      {deleted && <p className="admin-msg ok">ჩანაწერი წაიშალა.</p>}

      {featuredCount > FEATURED_LIMIT && (
        <p className="admin-msg error">
          მთავარ გვერდზე მონიშნულია {featuredCount} ღონისძიება, გამოჩნდება
          მხოლოდ პირველი {FEATURED_LIMIT}.
        </p>
      )}

      <section className="admin-panel">
        <h2>ახალი ჩანაწერი</h2>
        {/*
          Creation asks for a title and a kind and nothing else. Everything
          else has a sensible empty rendering, so opening the editor gets the
          admin to the screen where the rest belongs, instead of making them
          fill a twelve-field form before they can see anything.

          The kind is asked for here rather than in the editor because it
          decides which fields the editor shows.
        */}
        <form action={createEntryAction} className="admin-field-row">
          <div className="admin-field">
            <label htmlFor="new-title">სათაური</label>
            <input
              id="new-title"
              name="title"
              type="text"
              required
              maxLength={200}
              placeholder="მაგ. ზაფხულის საფეხბურთო ბანაკი"
            />
          </div>
          <div className="admin-field">
            <label htmlFor="new-kind">ტიპი</label>
            <select id="new-kind" name="kind" defaultValue="news">
              <option value="news">{KIND_LABELS.news}</option>
              <option value="event">{KIND_LABELS.event}</option>
            </select>
          </div>
          <div className="admin-panel-actions">
            <button type="submit" className="admin-btn">
              დამატება
            </button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h2>სიახლეები ({news.length})</h2>
        <p className="admin-subtitle">
          ესენი ჩანს სიახლეების გვერდზე, ბლოგის ბარათების სახით.
        </p>
        <EntryTable
          kind="news"
          entries={news}
          emptyText="სიახლე ჯერ არ არის. დაამატეთ პირველი ზემოთ."
        />
      </section>

      <section className="admin-panel">
        <h2>ღონისძიებები ({events.length})</h2>
        <p className="admin-subtitle">
          ესენი ჩანს განრიგის ბარათებად. მონიშნული {FEATURED_LIMIT} გამოჩნდება
          მთავარ გვერდზეც.
        </p>
        <EntryTable
          kind="event"
          entries={events}
          emptyText="ღონისძიება ჯერ არ არის. დაამატეთ პირველი ზემოთ."
        />
      </section>
    </main>
  );
}
