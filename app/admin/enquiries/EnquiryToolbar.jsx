'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Search box, source filter and sort picker for the applications list.
 *
 * The list itself stays a server component -- it reads Appwrite and must not
 * ship the data layer to the browser -- so the controls drive it through the
 * URL. That also makes every view the admin can reach a link: a filtered,
 * sorted search can be bookmarked, shared with a colleague, or reopened by the
 * back button, and the export button below the list can mirror it exactly by
 * reading the same query string.
 *
 * Typing is debounced and routed with `replace`, not `push`. Pushing a history
 * entry per keystroke would leave the admin pressing Back a dozen times to get
 * out of one search.
 */

/** How long to wait after the last keystroke before navigating, in ms. */
const SEARCH_DELAY = 300;

export default function EnquiryToolbar({ sorts, sources, sourceLabels, total, shown }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();

  const urlSearch = searchParams.get('q') ?? '';
  const [search, setSearch] = useState(urlSearch);

  const inputRef = useRef(null);
  /*
   * Whether the pending navigation is one this box started.
   *
   * Without it the effect below cannot tell "the admin typed" from "the URL
   * changed underneath us" -- clicking a status tab, say -- and would either
   * fight the user's typing or leave the box showing a stale query.
   */
  const typing = useRef(false);

  /* Adopt the URL's value whenever the change came from outside this box. */
  useEffect(() => {
    if (!typing.current) setSearch(urlSearch);
  }, [urlSearch]);

  /** Rewrites one parameter, dropping it when it goes back to its default. */
  function apply(changes, { replace = false } = {}) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  /* Debounce the search term into the URL. */
  useEffect(() => {
    if (search === urlSearch) {
      typing.current = false;
      return;
    }

    typing.current = true;
    const timer = setTimeout(() => {
      apply({ q: search }, { replace: true });
    }, SEARCH_DELAY);

    return () => clearTimeout(timer);
    // `apply` closes over searchParams, which changes on every navigation;
    // depending on it would restart the debounce mid-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urlSearch]);

  const activeSort = searchParams.get('sort') ?? 'newest';
  const activeSource = searchParams.get('source') ?? '';
  const filtered = urlSearch !== '' || activeSource !== '';

  return (
    <div className="admin-toolbar">
      <div className="admin-search">
        <span className="admin-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ძებნა: სახელი, ტელეფონი, პირადი ნომერი, მისამართი…"
          aria-label="განაცხადების ძებნა"
          /*
           * Escape clears the box. A search input renders its own clear button
           * in some browsers and not others, so the keyboard route is the one
           * that is always there.
           */
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSearch('');
          }}
        />
        {search !== '' && (
          <button
            type="button"
            className="admin-search-clear"
            onClick={() => {
              setSearch('');
              inputRef.current?.focus();
            }}
            aria-label="ძებნის გასუფთავება"
          >
            ✕
          </button>
        )}
      </div>

      <div className="admin-toolbar-controls">
        <label className="admin-select">
          <span>ტიპი</span>
          <select
            value={activeSource}
            onChange={(event) => apply({ source: event.target.value })}
          >
            <option value="">ყველა</option>
            {sources.map((value) => (
              <option key={value} value={value}>
                {sourceLabels[value] ?? value}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-select">
          <span>დალაგება</span>
          <select
            value={activeSort}
            onChange={(event) => apply({ sort: event.target.value })}
          >
            {Object.entries(sorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        * The result count, and a way out of a search that found nothing.
        * `aria-live` because the list updates without a page load -- a screen
        * reader would otherwise get no announcement that the results changed.
        */}
      <p className="admin-result-count" aria-live="polite" data-pending={isPending ? '1' : '0'}>
        {/*
          * Each half is wrapped in its own element so the row's `gap` applies
          * between them. Bare text nodes are not flex items, so without this
          * the count ran straight into the "clear" link with no space at all.
          */}
        {filtered ? (
          <>
            <span>
              ნაპოვნია <strong>{shown}</strong> / {total}
            </span>
            <button
              type="button"
              className="admin-clear-filters"
              onClick={() => apply({ q: '', source: '' })}
            >
              ფილტრის მოხსნა
            </button>
          </>
        ) : (
          <span>
            სულ <strong>{total}</strong> განაცხადი
          </span>
        )}
      </p>
    </div>
  );
}
