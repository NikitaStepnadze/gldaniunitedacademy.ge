'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ImageField from './ImageField';
import { saveContent } from './actions';

/**
 * The text and photo editor, with a live preview beside it.
 *
 * The whole point of this screen is that the admin never has to guess: every
 * keystroke is pushed into the preview iframe over postMessage and applied to
 * the real theme markup there, so what they are looking at is the actual site
 * with their unsaved change already in it. Nothing is written until Save.
 *
 * Draft state lives here rather than in the DOM because two things read it:
 * the inputs and the preview. Keeping it in one place is what lets "clear the
 * field" mean the same thing in both -- fall back to the theme's own copy.
 */

/** Page tabs, in the order they appear in the site's own navigation. */
const PAGES = [
  { id: 'home', route: 'index', label: 'მთავარი' },
  { id: 'about', route: 'about', label: 'ჩვენ შესახებ' },
  { id: 'contact', route: 'contact', label: 'კონტაქტი' },
  { id: 'registration', route: 'registration', label: 'რეგისტრაცია' },
];

/** Debounce for pushing the draft into the preview, in ms. */
const PREVIEW_DELAY = 120;

export default function ContentEditor({ rows }) {
  const [activePage, setActivePage] = useState(PAGES[0].id);
  const [device, setDevice] = useState('desktop');

  /** rowId -> the admin's current value, saved or not. */
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(rows.map((row) => [row.$id, row.value ?? '']))
  );

  /** The values as they are in the database, to tell "changed" from "same". */
  const [saved, setSaved] = useState(() =>
    Object.fromEntries(rows.map((row) => [row.$id, row.value ?? '']))
  );

  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const frameRef = useRef(null);

  /** Which preview route has announced it can receive drafts, if any. */
  const [readyRoute, setReadyRoute] = useState(null);

  const activeRoute = PAGES.find((page) => page.id === activePage)?.route ?? 'index';

  /*
   * The bridge is live only when the route that announced itself is the one
   * currently open. Switching pages therefore un-readies the preview on its
   * own, with no effect needed to reset anything -- which is what keeps a
   * late 'ready' from the previous page out of the way.
   */
  const frameReady = readyRoute === activeRoute;

  const byId = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.$id, row])),
    [rows]
  );

  const changedIds = useMemo(
    () => Object.keys(draft).filter((id) => draft[id] !== saved[id]),
    [draft, saved]
  );

  /** Rows for the open tab, grouped into the sections of that page. */
  const sections = useMemo(() => {
    const groups = new Map();

    for (const row of rows) {
      if (row.page !== activePage) continue;
      const name = row.group || row.page;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(row);
    }

    return [...groups.entries()].map(([name, items]) => ({
      name,
      // Every field of a section shares its label prefix ("სლაიდი 1 — ..."), so
      // the prefix is the section heading and is stripped from each field.
      title: items[0]?.label?.split(' — ')[0] ?? name,
      items,
    }));
  }, [rows, activePage]);

  /**
   * The draft keyed the way the preview needs it.
   *
   * The preview matches elements by their `data-cms` key, but the editor keys
   * everything by row id, because that is what the save action writes. So the
   * bridge between the two happens here, once per change.
   */
  const draftByKey = useMemo(() => {
    const out = {};
    for (const [rowId, value] of Object.entries(draft)) {
      const row = byId[rowId];
      if (row) out[row.key] = value;
    }
    return out;
  }, [draft, byId]);

  const post = useCallback((message) => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      { source: 'gua-admin', ...message },
      window.location.origin
    );
  }, []);

  /*
   * Push the draft to the preview, debounced.
   *
   * Debounced because a fast typist would otherwise post on every keypress and
   * the preview would spend its time re-walking the DOM instead of painting.
   * 120ms is below the threshold where the update stops feeling immediate.
   *
   * `frameReady` is state, not a ref, and that matters: an edit made before the
   * frame announced itself has to be re-sent once it does. With a ref, becoming
   * ready caused no re-render, this effect never re-ran, and the draft that was
   * dropped stayed dropped -- so the first thing an admin typed after opening
   * the page silently failed to preview until they typed something else.
   */
  useEffect(() => {
    if (!frameReady) return;
    const timer = setTimeout(() => post({ type: 'draft', content: draftByKey }), PREVIEW_DELAY);
    return () => clearTimeout(timer);
  }, [draftByKey, post, frameReady]);

  /*
   * The frame tells us when it can receive; until then messages are dropped.
   *
   * What is stored is *which route* announced itself, not a bare boolean, and
   * that is what makes switching pages safe. With a boolean plus an effect that
   * reset it on activePage, the reset ran after mount -- so a 'ready' arriving
   * in that window was set and then immediately cleared, while the frame had
   * already stopped retrying. The preview then sat behind its loading overlay
   * forever. Deriving readiness from the route removes the ordering question:
   * a stale announcement simply names a route that is no longer open.
   */
  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== 'gua-preview') return;

      if (event.data.type === 'ready') {
        setReadyRoute(event.data.route ?? null);

        /*
         * Answer the announcement from inside the handler.
         *
         * This is what lets the frame stop announcing, and it is sent from
         * here specifically because arriving here is the only proof that this
         * listener is attached and has seen the message. The frame used to
         * treat the 'draft' posted by the iframe's onLoad as its
         * acknowledgement, but that fires independently of this effect -- and
         * when the frame won the race, the frame stopped announcing while this
         * component had never received a 'ready'. The preview then sat behind
         * its loading overlay with no way out.
         *
         * Posted straight back at the source window rather than through
         * `post`, because the ref may not point at this frame yet on the very
         * first message.
         */
        event.source?.postMessage(
          { source: 'gua-admin', type: 'ready-ack' },
          window.location.origin
        );
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /** Warns before leaving with unsaved work. */
  useEffect(() => {
    if (changedIds.length === 0) return;

    function onBeforeUnload(event) {
      event.preventDefault();
      // Required by Chrome; the string itself is not shown any more.
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [changedIds.length]);

  function setValue(rowId, value) {
    setDraft((current) => ({ ...current, [rowId]: value }));
    setStatus(null);
  }

  /** Scrolls the preview to whatever field just took focus. */
  function focusInPreview(rowId) {
    const row = byId[rowId];
    if (row) post({ type: 'focus', key: row.key });
  }

  async function onSave() {
    if (changedIds.length === 0 || saving) return;

    setSaving(true);
    setStatus(null);

    const changes = Object.fromEntries(changedIds.map((id) => [id, draft[id]]));
    const result = await saveContent(changes);

    if (result.ok) {
      // Only what was actually sent becomes the new baseline; anything the
      // admin typed while the save was in flight stays marked as changed.
      setSaved((current) => ({ ...current, ...changes }));
    }

    setStatus(result);
    setSaving(false);
  }

  function onRevert() {
    setDraft({ ...saved });
    setStatus(null);
  }

  return (
    <div className="editor">
      <div className="editor-bar">
        <nav className="editor-tabs">
          {PAGES.map((page) => {
            const count = rows.filter(
              (row) => row.page === page.id && draft[row.$id] !== saved[row.$id]
            ).length;

            return (
              <button
                key={page.id}
                type="button"
                className={page.id === activePage ? 'active' : ''}
                onClick={() => setActivePage(page.id)}
              >
                {page.label}
                {count > 0 && <span className="tab-badge">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="editor-actions">
          {changedIds.length > 0 && (
            <span className="editor-dirty">{changedIds.length} შეუნახავი ცვლილება</span>
          )}
          <button
            type="button"
            className="admin-btn secondary"
            onClick={onRevert}
            disabled={changedIds.length === 0 || saving}
          >
            გაუქმება
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={onSave}
            disabled={changedIds.length === 0 || saving}
          >
            {saving ? 'ინახება…' : 'შენახვა'}
          </button>
        </div>
      </div>

      {status && (
        <p className={`admin-msg ${status.ok ? 'ok' : 'error'}`}>{status.message}</p>
      )}

      <div className="editor-split">
        <div className="editor-fields">
          {sections.length === 0 && (
            <p className="admin-subtitle">ამ გვერდზე რედაქტირებადი ველი არ არის.</p>
          )}

          {sections.map((section) => (
            <section className="admin-panel" key={section.name}>
              <h2>{section.title}</h2>

              {section.items.map((row) => {
                const value = draft[row.$id] ?? '';
                const changed = value !== saved[row.$id];
                // The section name is already the heading above.
                const fieldLabel = row.label?.includes(' — ')
                  ? row.label.split(' — ').slice(1).join(' — ')
                  : row.label || row.key;

                return (
                  <div className={`admin-field${changed ? ' changed' : ''}`} key={row.$id}>
                    <label htmlFor={row.$id}>
                      {fieldLabel}
                      {changed && <span className="field-dot" title="შეუნახავი" />}
                    </label>

                    {row.kind === 'image' ? (
                      <ImageField
                        id={row.$id}
                        value={value}
                        onChange={(next) => setValue(row.$id, next)}
                        onFocus={() => focusInPreview(row.$id)}
                      />
                    ) : row.kind === 'textarea' ? (
                      <textarea
                        id={row.$id}
                        rows={4}
                        value={value}
                        placeholder="საწყისი ტექსტი რჩება"
                        onChange={(event) => setValue(row.$id, event.target.value)}
                        onFocus={() => focusInPreview(row.$id)}
                      />
                    ) : (
                      <input
                        id={row.$id}
                        type="text"
                        value={value}
                        placeholder="საწყისი ტექსტი რჩება"
                        onChange={(event) => setValue(row.$id, event.target.value)}
                        onFocus={() => focusInPreview(row.$id)}
                      />
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <div className="editor-preview">
          <div className="preview-head">
            <span className="preview-label">ცოცხალი გადახედვა</span>
            <div className="preview-devices">
              {[
                { id: 'desktop', label: 'დესკტოპი' },
                { id: 'tablet', label: 'ტაბლეტი' },
                { id: 'mobile', label: 'მობილური' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={device === option.id ? 'active' : ''}
                  onClick={() => setDevice(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`preview-stage ${device}`}>
            {!frameReady && <div className="preview-loading">გადახედვა იტვირთება…</div>}
            <iframe
              ref={frameRef}
              // Keyed by route so switching pages remounts rather than
              // navigating -- the theme's scripts do not survive a re-init.
              key={activeRoute}
              title="გადახედვა"
              src={`/admin-preview/${activeRoute}`}
              /*
               * Mirrors the handshake into the DOM. It drives the loading
               * overlay above, and gives anything automating this screen a
               * reliable "the bridge is live" signal instead of a guess at how
               * long the frame takes to compile and boot.
               */
              data-ready={frameReady ? '1' : '0'}
              onLoad={() => post({ type: 'draft', content: draftByKey })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
