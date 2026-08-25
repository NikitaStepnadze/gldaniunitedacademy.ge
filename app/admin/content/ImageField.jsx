'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * One editable photo: a thumbnail, an upload button and a picker of images
 * already uploaded.
 *
 * The field's stored value is a URL string, which is what the CMS row holds
 * and what the theme's <img src> is rewritten to. An empty value means "keep
 * the photo the theme shipped with", the same rule the text fields follow, so
 * "restore original" is just clearing the field.
 *
 * Uploading posts to /api/admin/media rather than going through a server
 * action, so the admin gets the new URL back without a navigation -- the
 * preview updates in place and the rest of the form keeps its state.
 */
export default function ImageField({ id, value, onChange, onFocus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [picking, setPicking] = useState(false);
  const [library, setLibrary] = useState(null);

  const inputRef = useRef(null);

  /* The library is fetched the first time the picker opens, not on mount:
     most fields are never opened, and each fetch lists the whole bucket. */
  useEffect(() => {
    if (!picking || library) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/admin/media');
        const data = await response.json();
        if (!cancelled) setLibrary(data.ok ? data.images : []);
      } catch {
        if (!cancelled) setLibrary([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [picking, library]);

  async function upload(file) {
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/admin/media', { method: 'POST', body });
      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? 'ატვირთვა ვერ მოხერხდა.');
      } else {
        onChange(data.image.url);
        // Drop the cached list so the new file shows up next time the picker
        // is opened rather than after a reload.
        setLibrary(null);
      }
    } catch {
      setError('ატვირთვა ვერ მოხერხდა. შეამოწმეთ ინტერნეტი.');
    } finally {
      setBusy(false);
      // Let the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    /*
     * `onClick` as well as `onFocus`.
     *
     * onFocus alone only fires when a focusable child receives focus, and the
     * only focusable children here are the file input -- which is `hidden`,
     * so it never takes focus -- and the three buttons, which do something
     * else when clicked. That left a photo field with no way to say "show me
     * this one in the preview": clicking the thumbnail did nothing, and the
     * admin could not find the component they were editing.
     *
     * Clicking anywhere in the field now locates it, which is the same gesture
     * that already works for a text field.
     */
    <div className="image-field" onFocus={onFocus} onClick={onFocus}>
      <div className="image-field-main">
        <button
          type="button"
          className="image-thumb"
          onClick={onFocus}
          title="გვერდზე ჩვენება"
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" />
          ) : (
            <span className="image-thumb-empty">საწყისი სურათი</span>
          )}
        </button>

        <div className="image-field-controls">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            hidden
            onChange={(event) => upload(event.target.files?.[0])}
          />

          <button
            type="button"
            className="admin-btn secondary small"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'იტვირთება…' : 'ატვირთვა'}
          </button>

          <button
            type="button"
            className="admin-btn secondary small"
            onClick={() => setPicking((open) => !open)}
            disabled={busy}
          >
            ატვირთულებიდან
          </button>

          {value && (
            <button
              type="button"
              className="admin-btn secondary small"
              onClick={() => onChange('')}
              disabled={busy}
            >
              საწყისზე დაბრუნება
            </button>
          )}
        </div>
      </div>

      {error && <p className="image-field-error">{error}</p>}

      {picking && (
        <div className="image-library">
          {library === null && <p className="image-library-empty">იტვირთება…</p>}

          {library?.length === 0 && (
            <p className="image-library-empty">ატვირთული სურათი ჯერ არ არის.</p>
          )}

          {library?.map((image) => (
            <button
              key={image.id}
              type="button"
              className={`image-library-item${image.url === value ? ' active' : ''}`}
              title={image.name}
              onClick={() => {
                onChange(image.url);
                setPicking(false);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
