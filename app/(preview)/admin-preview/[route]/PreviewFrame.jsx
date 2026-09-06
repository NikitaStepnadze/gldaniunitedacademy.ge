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
 * Carousel autoplay is switched off here, unlike on the public site: a slider
 * that advances on its own would carry the text being edited out of view
 * mid-keystroke. See `freezeCarousels`.
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

    function rememberAttr(attr, key, element) {
      const cacheKey = `${attr}:${key}`;
      if (!originals.has(cacheKey)) originals.set(cacheKey, element.getAttribute(attr) ?? '');
      return originals.get(cacheKey);
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

      // `data-cms-attr="attr:key"` mirrors the same override onto a bare
      // attribute -- see lib/cms.js for why the counters need this.
      for (const element of document.querySelectorAll('[data-cms-attr]')) {
        const [attr, key] = element.getAttribute('data-cms-attr').split(':');
        if (!attr || !key) continue;

        const original = rememberAttr(attr, key, element);
        const next = draft[key];

        const value = typeof next === 'string' && next.trim() !== '' ? next : original;
        if (element.getAttribute(attr) !== value) element.setAttribute(attr, value);
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
     * Brings a carousel slide to the front before we try to scroll to it.
     *
     * Marked elements are not all sitting in the normal flow. The hero is a
     * Swiper with `effect: "fade"`, so its off-screen slides are stacked on top
     * of each other at opacity 0, and the testimonials are an Owl carousel,
     * which translates its track sideways and clones slides to fake the loop.
     * In both cases scrolling to a hidden slide lands on the slider's top edge
     * -- which is what made every component except slide 1 appear to "scroll
     * to the top" instead of to itself.
     *
     * So the slide is activated first, through the carousel's own API where one
     * is exposed, because that is what also moves the pagination bullets and
     * leaves the widget in a state it can carry on animating from. Returns the
     * number of ms to wait for that transition before measuring a scroll
     * position, since a mid-transition element reports the wrong one.
     */
    function revealSlide(element) {
      let delay = 0;

      // --- Swiper (the hero, and any other .swiper on the page) ---
      const swiperSlide = element.closest('.swiper-slide');
      const swiperRoot = swiperSlide?.closest('.swiper');

      if (swiperSlide && swiperRoot) {
        // Swiper 6+ hangs its instance off the element; older builds do not,
        // hence the fallback below rather than assuming it is there.
        const instance = swiperRoot.swiper;
        const slides = [...swiperRoot.querySelectorAll(':scope > .swiper-wrapper > .swiper-slide')];
        const index = slides.indexOf(swiperSlide);

        if (instance && index >= 0 && typeof instance.slideTo === 'function') {
          // `slideToLoop` is the correct call on a looped Swiper: with
          // duplicated slides the raw DOM index points at a clone.
          if (instance.params?.loop && typeof instance.slideToLoop === 'function') {
            instance.slideToLoop(instance.realIndex >= 0 ? index % slides.length : index);
          } else {
            instance.slideTo(index);
          }
          delay = Math.max(delay, (instance.params?.speed ?? 300) + 60);
        } else if (index >= 0) {
          /*
           * No instance to drive: click the matching pagination bullet, which
           * is what a visitor would do. Falling back this way keeps the
           * carousel's own state consistent -- forcing opacity by hand would
           * show the slide but leave Swiper convinced a different one is
           * active, and the next autoplay tick would snap it away.
           */
          const bullet = swiperRoot.querySelectorAll('.swiper-pagination-bullet')[index];
          if (bullet) {
            bullet.click();
            delay = Math.max(delay, 400);
          }
        }
      }

      // --- Owl Carousel (the testimonials) ---
      const owlItem = element.closest('.owl-item');
      const owlRoot = owlItem?.closest('.owl-carousel');

      if (owlItem && owlRoot && window.jQuery) {
        const $owl = window.jQuery(owlRoot);
        const items = [...owlRoot.querySelectorAll('.owl-stage > .owl-item')];
        const index = items.indexOf(owlItem);

        if (index >= 0) {
          // `to` rather than `goTo`: this is Owl 2's API, and it accepts the
          // stage index directly, clones included.
          $owl.trigger('to.owl.carousel', [index, 300, true]);
          delay = Math.max(delay, 400);
        }
      }

      return delay;
    }

    /**
     * Scrolls the section being edited into view and rings it.
     *
     * Without this the admin edits the footer while the preview sits at the
     * hero, and the change appears to do nothing.
     */
    function focusKey(key) {
      const selector =
        `[data-cms="${CSS.escape(key)}"], [data-cms-img="${CSS.escape(key)}"]`;

      /*
       * All matches, not the first one.
       *
       * Owl clones its slides to fake an infinite loop, so a key inside the
       * testimonial carousel exists two or three times in the DOM, and
       * `querySelector` hands back whichever clone happens to come first --
       * usually one parked outside the viewport. The same key is also allowed
       * to appear twice in the markup by design (the hero photo is reused
       * further down the page). Preferring a visible match fixes both.
       */
      const matches = [...document.querySelectorAll(selector)];
      if (matches.length === 0) return;

      const element =
        matches.find((node) => {
          // offsetParent is null for display:none and for anything inside it,
          // which is exactly the clone/hidden case we want to skip. A
          // zero-sized box is hidden in practice too.
          if (node.offsetParent === null && node.offsetWidth === 0) return false;
          return !node.closest('.owl-item.cloned');
        }) ?? matches[0];

      const delay = revealSlide(element);

      /*
       * Re-freeze after driving the widget.
       *
       * Both engines can re-arm their timer as a side effect of being moved:
       * Owl restarts autoplay when a `to.owl.carousel` lands, and Swiper's
       * `slideTo` does the same on a build where the module is active. Without
       * this, clicking a slide field turned autoplay back on and the carousel
       * slid away from the very slide the click had just brought up.
       */
      freezeCarousels();
      window.clearTimeout(pendingFreeze);
      pendingFreeze = window.setTimeout(freezeCarousels, delay + 50);

      // Highlight immediately so the click feels answered even while the
      // carousel is still transitioning underneath.
      markFocused(element);

      /*
       * Measure after the carousel has settled. Scrolling while a slide is
       * still fading or sliding reads a position it is about to leave, which
       * put the page a few hundred pixels off -- or, for a slide that had not
       * started moving yet, at the top of the slider.
       */
      window.clearTimeout(pendingScroll);
      pendingScroll = window.setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, delay);
    }

    /** The yellow ring, kept to one element at a time. */
    let clearMark;

    /** The deferred scroll, so a second click cancels the first one's. */
    let pendingScroll;

    /** The re-freeze queued behind a carousel transition, for the same reason. */
    let pendingFreeze;

    function markFocused(element) {
      window.clearTimeout(clearMark);
      for (const node of document.querySelectorAll('.cms-preview-focus')) {
        node.classList.remove('cms-preview-focus');
      }

      element.classList.add('cms-preview-focus');
      clearMark = window.setTimeout(
        () => element.classList.remove('cms-preview-focus'),
        2600
      );
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

    /**
     * Stops every carousel on the page from advancing on its own.
     *
     * The preview is an editing surface, not the site: while the admin is
     * typing into "slide 2", the theme's autoplay was sliding slide 3 into
     * view underneath them, taking the edited text -- and the yellow ring
     * pointing at it -- off screen mid-keystroke. There is no version of that
     * which is useful here, so autoplay is off for the whole session rather
     * than merely paused; the admin moves between slides by clicking the field
     * they want, which `focusKey` already answers by revealing that slide.
     *
     * Both engines are handled, and neither is assumed to exist: the page is
     * the theme's own markup, so what is on it depends on the route.
     *
     *   - Owl (`.swiper-testimonial`, `.sologan-logo`, `.owl-themes`) is the
     *     one that actually rotates today. `stop.owl.autoplay` is Owl 2's own
     *     API, so the widget stays internally consistent and its nav arrows
     *     keep working -- unlike ripping the plugin's timer out by hand.
     *   - Swiper (the hero) is configured without autoplay in main.js today,
     *     so that branch is insurance rather than a fix: it costs one call per
     *     instance and means enabling autoplay on the public hero later cannot
     *     quietly break editing.
     *
     * `disableOnInteraction` is deliberately not used: it only pauses until
     * the next interaction, and applying a draft counts as none, so autoplay
     * would resume on its own a few seconds into an edit.
     */
    function freezeCarousels() {
      for (const root of document.querySelectorAll('.swiper')) {
        const instance = root.swiper;
        // `.autoplay` is absent unless the build includes the module, and
        // `stop` is absent on older ones -- both are checked because the theme
        // ships a bundle it does not pin.
        if (typeof instance?.autoplay?.stop === 'function') instance.autoplay.stop();
        // Keeps a later `slideTo` from re-arming the timer on builds where
        // stopping alone does not clear the flag.
        if (instance?.params) instance.params.autoplay = false;
      }

      if (window.jQuery) {
        for (const root of document.querySelectorAll('.owl-carousel')) {
          // Only initialised widgets answer; Owl stores its instance under this
          // key as it boots, so its presence doubles as the readiness check.
          const owl = window.jQuery(root).data('owlCarousel');
          if (!owl) continue;

          /*
           * Clearing the flag matters more than stopping the timer.
           *
           * `stop.owl.autoplay` only calls `clearInterval`, and Owl re-arms
           * itself on every `translated.owl.carousel` and
           * `refreshed.owl.carousel` for as long as `settings.autoplay` is
           * truthy -- so a bare stop is undone by the next transition, which
           * on this page is the one `revealSlide` just triggered.
           *
           * `options` has to be cleared alongside `settings` because
           * `Owl.setup()` rebuilds `settings` from `options` whenever the
           * viewport crosses a responsive breakpoint, and the testimonial and
           * logo carousels both define breakpoints. Clearing only `settings`
           * meant resizing the preview -- or flipping the editor's own
           * desktop/mobile toggle, which resizes the iframe -- brought
           * autoplay back.
           */
          if (owl.settings) owl.settings.autoplay = false;
          if (owl.options) owl.options.autoplay = false;
          window.jQuery(root).trigger('stop.owl.autoplay');
        }
      }
    }

    /*
     * Freeze on a schedule, not just once.
     *
     * The theme's scripts are deferred and jQuery-gated, so at the moment this
     * effect runs not one carousel exists yet -- a single call here would find
     * nothing and the page would rotate anyway. Owl also re-arms its timer
     * when the window resizes, and Swiper re-inits on breakpoint changes, so
     * the freeze has to be re-applied rather than assumed permanent.
     *
     * A short poll covers initialisation whenever it lands, then hands over to
     * the resize handler, which is the only thing that revives autoplay after
     * boot. Polling ten times a second for six seconds on an admin-only page
     * is cheaper than the MutationObserver it would otherwise take to notice
     * a carousel appearing.
     */
    freezeCarousels();
    const freezePoll = window.setInterval(freezeCarousels, 100);
    const stopFreezePoll = window.setTimeout(() => window.clearInterval(freezePoll), 6000);
    window.addEventListener('resize', freezeCarousels);

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

    /*
     * Stop after 30s rather than 5.
     *
     * The old 5s budget assumed the editor was already listening and this was
     * only closing a millisecond-scale race. In development the editor's chunk
     * can take longer than that to compile and mount on a cold route, and once
     * the retries were spent nothing ever announced again -- the preview stayed
     * behind its overlay until a manual reload. Announcing costs one
     * postMessage every 250ms into our own parent, so a longer budget is
     * cheap; the ack below normally ends it within a few frames anyway.
     *
     * There is still a stop, because with no editor at all -- the frame opened
     * directly in a tab -- there is nobody to answer and no reason to post
     * forever.
     */
    const stopRetrying = window.setTimeout(() => window.clearInterval(retry), 30000);

    /*
     * Announce again as soon as the tab is looked at.
     *
     * Background tabs have their timers throttled hard, so a preview opened and
     * left in the background can burn its whole retry budget without the editor
     * having mounted. Re-announcing on focus makes returning to the tab fix it,
     * rather than needing a reload.
     */
    function reannounce() {
      if (document.visibilityState === 'visible') announce();
    }
    document.addEventListener('visibilitychange', reannounce);
    window.addEventListener('focus', reannounce);

    /*
     * Only an explicit 'ready-ack' ends the retries.
     *
     * Neither of the editor's other messages proves what the retries need to
     * know. The editor posts a 'draft' from the iframe's own `onLoad`, which
     * fires whether or not its `message` listener has been attached yet -- and
     * in React 19's Strict Mode the frame regularly loads first. Treating that
     * draft as the acknowledgement stopped the retries while the editor had
     * still never seen an announcement, so `readyRoute` stayed null, the
     * loading overlay never lifted and no keystroke ever reached the preview.
     * A 'focus' is no better, for the same reason.
     *
     * 'ready-ack' is sent from the editor's own message handler, so receiving
     * it is proof that the handler exists and has processed our announcement.
     * That is the only thing that makes it safe to stop announcing.
     */
    function onAcknowledged(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source === 'gua-admin' && event.data.type === 'ready-ack') {
        window.clearInterval(retry);
      }
    }
    window.addEventListener('message', onAcknowledged);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onAcknowledged);
      document.removeEventListener('visibilitychange', reannounce);
      window.removeEventListener('focus', reannounce);
      window.removeEventListener('resize', freezeCarousels);
      window.clearInterval(freezePoll);
      window.clearTimeout(stopFreezePoll);
      window.clearInterval(retry);
      window.clearTimeout(stopRetrying);
      // The focus handlers leave two timers in flight -- one to scroll after a
      // carousel settles, one to drop the ring. Both touch the DOM, so they
      // have to go when the effect does.
      window.clearTimeout(clearMark);
      window.clearTimeout(pendingScroll);
      window.clearTimeout(pendingFreeze);
    };
  }, [route]);

  return (
    <style>{`
      /*
       * Marks the element the admin is editing, so it is findable at a glance.
       *
       * outline rather than border: it is drawn outside the box and takes no
       * space, so ringing an element cannot reflow the layout being previewed.
       * The offset keeps the ring clear of the text itself, and the shadow
       * lifts it off busy photographs, where a thin gold line on its own
       * disappears into the image.
       */
      .cms-preview-focus {
        outline: 3px solid #ffd21f !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 6px rgba(255, 210, 31, .35) !important;
        border-radius: 2px;
        animation: cms-preview-pulse 1.2s ease-out 2;
        /* Photographs and slides sit in stacking contexts of their own; without
           this the ring is painted behind the next slide and never seen. */
        position: relative;
        z-index: 9999;
      }

      @keyframes cms-preview-pulse {
        0%   { box-shadow: 0 0 0 3px rgba(255, 210, 31, .9); }
        70%  { box-shadow: 0 0 0 12px rgba(255, 210, 31, 0); }
        100% { box-shadow: 0 0 0 6px rgba(255, 210, 31, .35); }
      }

      /* The admin is looking for the element, not watching an animation --
         respect a reduced-motion preference by keeping only the ring. */
      @media (prefers-reduced-motion: reduce) {
        .cms-preview-focus { animation: none; }
      }
    `}</style>
  );
}
