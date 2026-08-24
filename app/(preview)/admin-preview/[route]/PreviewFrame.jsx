'use client';

import { useEffect } from 'react';

/**
 * Applies the editor's unsaved draft to the previewed page.
 *
 * Renders nothing. It listens for the draft the editor posts on every
 * keystroke and writes the values straight into the DOM, so the admin sees the
 * change in the real layout, in the real font, before anything is saved.
 *
 * Applying in the browser -- rather than re-requesting the page per keystroke
 * -- is what makes it feel live: no network round trip, no reload, and the
 * theme's carousels and scroll animations keep whatever state they were in.
 *
 * Every element's original text is captured on first touch, so clearing a
 * field puts the theme's own copy back rather than leaving the box empty. That
 * matches what saving an empty value actually does on the public site.
 */
export default function PreviewFrame({ route }) {
  useEffect(() => {
    /** key -> the theme's own text/src, captured before we first overwrite it. */
    const originals = new Map();

    function rememberText(key, element) {
      if (!originals.has(key)) originals.set(key, element.textContent);
      return originals.get(key);
    }

    function rememberSrc(key, element) {
      if (!originals.has(key)) originals.set(key, element.getAttribute('src') ?? '');
      return originals.get(key);
    }

    function applyDraft(draft) {
      for (const element of document.querySelectorAll('[data-cms]')) {
        const key = element.getAttribute('data-cms');
        const original = rememberText(key, element);
        const next = draft[key];

        // An absent or blank draft value means "no override" -- the same rule
        // the server applies -- so restore what the theme shipped.
        const value = typeof next === 'string' && next.trim() !== '' ? next : original;
        if (element.textContent !== value) element.textContent = value;
      }

      for (const element of document.querySelectorAll('[data-cms-img]')) {
        const key = element.getAttribute('data-cms-img');
        const original = rememberSrc(key, element);
        const next = draft[key];

        const value = typeof next === 'string' && next.trim() !== '' ? next : original;
        if (element.getAttribute('src') !== value) {
          element.setAttribute('src', value);
          // The theme's srcset would otherwise outrank the src we just set and
          // the picture would not appear to change at all.
          element.removeAttribute('srcset');
        }
      }
    }

    /** Live colour overrides, so the palette previews without a save too. */
    function applyColors(colors) {
      let style = document.getElementById('cms-colors-preview');
      if (!style) {
        style = document.createElement('style');
        style.id = 'cms-colors-preview';
        document.head.append(style);
      }

      const declarations = Object.entries(colors ?? {})
        .filter(([, value]) => /^#[0-9a-fA-F]{6}$/.test(value))
        .map(([key, value]) => `--${key.replace(/^color\./, '')}:${value}`);

      style.textContent = declarations.length ? `:root{${declarations.join(';')}}` : '';
    }

    /**
     * Scrolls the section being edited into view.
     *
     * Without this the admin edits the footer while the preview sits at the
     * hero, and the change appears to do nothing.
     */
    function focusKey(key) {
      const element = document.querySelector(
        `[data-cms="${CSS.escape(key)}"], [data-cms-img="${CSS.escape(key)}"]`
      );
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      element.classList.add('cms-preview-focus');
      window.setTimeout(() => element.classList.remove('cms-preview-focus'), 1600);
    }

    function onMessage(event) {
      // Same-origin only: the editor and this frame are both served by us, so
      // a message from anywhere else is not the editor and is ignored.
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || data.source !== 'gua-admin') return;

      if (data.type === 'draft') {
        applyDraft(data.content ?? {});
        applyColors(data.colors);
      } else if (data.type === 'focus' && data.key) {
        focusKey(data.key);
      }
    }

    window.addEventListener('message', onMessage);

    /*
     * Announce readiness until the editor answers, then stop.
     *
     * A single announcement is not enough. This frame and the editor mount
     * independently, and if the frame gets there first its one message lands
     * before the editor is listening and is simply lost -- leaving the preview
     * showing saved values, with the editor convinced it may not send. Retrying
     * closes that race from this side, and the editor's own 'draft' reply is
     * the acknowledgement that ends it.
     */
    // The route is named in the announcement so the editor can tell an
    // announcement for the page it is showing from a late one for the page it
    // just navigated away from.
    const announce = () =>
      window.parent?.postMessage(
        { source: 'gua-preview', type: 'ready', route },
        window.location.origin
      );

    announce();
    const retry = window.setInterval(announce, 250);
    // Give up after a few seconds: with no editor listening -- the frame opened
    // directly in a tab, say -- there is nobody to answer and no reason to keep
    // posting.
    const stopRetrying = window.setTimeout(() => window.clearInterval(retry), 5000);

    // Only a 'draft' ends the retries. A 'focus' can arrive before the editor
    // has processed the announcement -- treating that as the acknowledgement
    // stopped the retries while the editor still believed the frame was not
    // ready, which is exactly the deadlock the retries exist to prevent.
    function onAcknowledged(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source === 'gua-admin' && event.data.type === 'draft') {
        window.clearInterval(retry);
      }
    }
    window.addEventListener('message', onAcknowledged);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onAcknowledged);
      window.clearInterval(retry);
      window.clearTimeout(stopRetrying);
    };
  }, [route]);

  return (
    <style>{`
      /* Marks the element the admin is editing, so it is findable at a glance. */
      .cms-preview-focus {
        outline: 3px solid #c9a227 !important;
        outline-offset: 3px;
        transition: outline-color .3s ease;
      }
    `}</style>
  );
}
