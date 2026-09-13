import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { isAuthenticated } from '../../../../lib/appwrite/auth';
import { FEATURED_LIMIT, getEventById } from '../../../../lib/appwrite/events';
import FormImagePicker from '../../FormImagePicker';

import { deleteEntryAction, updateEntryAction } from '../actions';

export const dynamic = 'force-dynamic';

/** Banner for a failed save, keyed by the `error` the action redirects with. */
const ERRORS = {
  title: 'სათაური სავალდებულოა.',
};

/**
 * The editor for one news entry or event.
 *
 * A plain form posted to a server action rather than the live-preview editor
 * used for the theme's fixed text. These are rows, not overrides of shipped
 * copy: there is no original to preview against, and the entry's own page is
 * one click away for anyone who wants to see the result.
 *
 * Which fields are shown depends on the entry's kind, because the two cards
 * draw different things -- a news post has a category and a byline, an event
 * has a place, a time and a price. Showing all of them for both would leave an
 * admin filling in boxes that nothing on the site reads.
 */
export default async function NewsEntryPage({ params, searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const { id } = await params;
  const query = await searchParams;

  const entry = await getEventById(id);
  if (!entry) notFound();

  const error = ERRORS[query?.error];
  const saved = query?.saved === '1';
  const created = query?.created === '1';

  const isEvent = entry.kind === 'event';
  const publicHref = entry.slug ? `/news/${encodeURIComponent(entry.slug)}` : null;

  return (
    <main className="admin-main">
      <header className="admin-head">
        <h1 className="admin-title">{entry.title || 'ჩანაწერი'}</h1>
        <p className="admin-subtitle">
          {isEvent ? 'ღონისძიება' : 'სიახლე'} ·{' '}
          <Link href="/admin/news">სიაში დაბრუნება</Link>
          {publicHref && (
            <>
              {' · '}
              <Link href={publicHref} target="_blank" rel="noopener noreferrer">
                გვერდის ნახვა
              </Link>
            </>
          )}
        </p>
      </header>

      {error && <p className="admin-msg error">{error}</p>}
      {saved && <p className="admin-msg ok">ცვლილება შენახულია.</p>}
      {created && (
        <p className="admin-msg ok">
          ჩანაწერი დაემატა. შეავსეთ დანარჩენი ველები და შეინახეთ.
        </p>
      )}

      <form action={updateEntryAction.bind(null, entry.id)}>
        {/*
          The kind travels with the form rather than being re-read from the
          row, because readForm decides from it whether the `featured` flag is
          even accepted. Submitting without it would silently downgrade every
          event to a news post on save.
        */}
        <input type="hidden" name="kind" value={entry.kind} />

        <section className="admin-panel">
          <h2>ძირითადი</h2>

          <div className="admin-field">
            <label htmlFor="title">სათაური</label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={200}
              defaultValue={entry.title}
            />
          </div>

          {isEvent ? (
            <>
              <div className="admin-field">
                <label htmlFor="location">ადგილი</label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  maxLength={200}
                  defaultValue={entry.location}
                  placeholder="მაგ. აკადემიის მოედანი, გლდანი"
                />
              </div>

              <div className="admin-field">
                <label htmlFor="date">თარიღი</label>
                <input
                  id="date"
                  name="date"
                  type="text"
                  maxLength={100}
                  defaultValue={entry.date}
                  placeholder="მაგ. 20 სექტემბერი"
                />
              </div>

              <div className="admin-field">
                <label htmlFor="time">დრო</label>
                <input
                  id="time"
                  name="time"
                  type="text"
                  maxLength={100}
                  defaultValue={entry.time}
                  placeholder="მაგ. დაწყება 11:00 საათზე"
                />
              </div>
            </>
          ) : (
            <>
              <div className="admin-field">
                <label htmlFor="tag">კატეგორია</label>
                <input
                  id="tag"
                  name="tag"
                  type="text"
                  maxLength={80}
                  defaultValue={entry.tag}
                  placeholder="მაგ. ვარჯიში"
                />
                <p className="hint">ბარათზე სათაურის ზემოთ ჩანს.</p>
              </div>

              <div className="admin-field">
                <label htmlFor="author">ავტორი</label>
                <input
                  id="author"
                  name="author"
                  type="text"
                  maxLength={120}
                  defaultValue={entry.author}
                  placeholder="მაგ. ავტორი: აკადემია"
                />
              </div>

              <div className="admin-field">
                <label htmlFor="date">თარიღი</label>
                <input
                  id="date"
                  name="date"
                  type="text"
                  maxLength={100}
                  defaultValue={entry.date}
                  placeholder="მაგ. 12 სექტემბერი"
                />
              </div>
            </>
          )}

          <div className="admin-field">
            <label htmlFor="ctaLabel">ღილაკის წარწერა</label>
            <input
              id="ctaLabel"
              name="ctaLabel"
              type="text"
              maxLength={80}
              defaultValue={entry.ctaLabel}
              placeholder={isEvent ? 'გაიგე მეტი' : 'დეტალურად'}
            />
            <p className="hint">ცარიელი ველი ნიშნავს, რომ დარჩება საწყისი წარწერა.</p>
          </div>
        </section>

        {isEvent && (
          <section className="admin-panel">
            <h2>მონაწილეობა</h2>
            <p className="admin-subtitle">
              ბარათის მარჯვენა მხარეს ჩანს. ორივე ცარიელი რომ იყოს, ეს ბლოკი
              საერთოდ არ გამოჩნდება.
            </p>

            <div className="admin-field">
              <label htmlFor="priceLabel">წარწერა</label>
              <input
                id="priceLabel"
                name="priceLabel"
                type="text"
                maxLength={80}
                defaultValue={entry.priceLabel}
                placeholder="მაგ. მონაწილეობა"
              />
            </div>

            <div className="admin-field">
              <label htmlFor="priceValue">მნიშვნელობა</label>
              <input
                id="priceValue"
                name="priceValue"
                type="text"
                maxLength={80}
                defaultValue={entry.priceValue}
                placeholder="მაგ. უფასო"
              />
              <p className="hint">მოკლე ტექსტი ჯობს — გრძელი რამდენიმე ხაზად გადავა.</p>
            </div>
          </section>
        )}

        <section className="admin-panel">
          <h2>სურათი</h2>
          <div className="admin-field">
            <FormImagePicker name="image" defaultValue={entry.image} />
            <p className="hint">
              ცარიელი ველი ნიშნავს, რომ დარჩება საწყისი სურათი.
            </p>
          </div>
        </section>

        <section className="admin-panel">
          <h2>ტექსტი</h2>

          <div className="admin-field">
            <label htmlFor="excerpt">მოკლე აღწერა</label>
            <textarea
              id="excerpt"
              name="excerpt"
              rows={3}
              maxLength={1000}
              defaultValue={entry.excerpt}
            />
            <p className="hint">
              ჩანს ჩანაწერის გვერდზე ტექსტის დასაწყისში და საძიებო სისტემების
              შედეგებში.
            </p>
          </div>

          <div className="admin-field">
            <label htmlFor="body">სრული ტექსტი</label>
            <textarea
              id="body"
              name="body"
              rows={14}
              maxLength={20000}
              defaultValue={entry.body}
            />
            <p className="hint">
              აბზაცის გასაყოფად დატოვეთ ცარიელი ხაზი.
            </p>
          </div>
        </section>

        <section className="admin-panel">
          <h2>გამოქვეყნება</h2>

          <div className="admin-field">
            <label className="admin-checkbox" htmlFor="published">
              <input
                id="published"
                name="published"
                type="checkbox"
                defaultChecked={entry.published}
              />{' '}
              გამოქვეყნებული
            </label>
            <p className="hint">
              მოხსნილი ჩანაწერი საიტზე არსად ჩანს და მისი გვერდიც არ იხსნება.
            </p>
          </div>

          {isEvent && (
            <div className="admin-field">
              <label className="admin-checkbox" htmlFor="featured">
                <input
                  id="featured"
                  name="featured"
                  type="checkbox"
                  defaultChecked={entry.featured}
                />{' '}
                მთავარ გვერდზე
              </label>
              <p className="hint">
                მთავარ გვერდზე {FEATURED_LIMIT} ღონისძიება ეტევა. თუ უკვე
                შევსებულია, ყველაზე ძველი მონიშვნა ავტომატურად მოიხსნება.
              </p>
            </div>
          )}
        </section>

        <div className="admin-actions">
          <button type="submit" className="admin-btn">
            შენახვა
          </button>
          <Link className="admin-btn secondary" href="/admin/news">
            გაუქმება
          </Link>
        </div>
      </form>

      {/*
        Delete is its own form, outside the one above: nesting forms is invalid
        HTML, and a delete button inside the editor would also submit the draft
        the admin is abandoning.
      */}
      <section className="admin-panel">
        <h2>წაშლა</h2>
        <p className="admin-subtitle">
          წაშლილი ჩანაწერი და მისი გვერდი აღარ აღდგება. თუ მხოლოდ დროებით გინდათ
          დამალვა, მოხსენით „გამოქვეყნებული“.
        </p>
        <form action={deleteEntryAction.bind(null, entry.id)}>
          <button type="submit" className="admin-btn danger">
            წაშლა
          </button>
        </form>
      </section>
    </main>
  );
}
