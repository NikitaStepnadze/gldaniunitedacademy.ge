/**
 * The confirmation card shown after a registration is accepted.
 *
 * Both registration entry points -- the page form and the hero wizard -- used
 * to report success as one line of text under a long form, which is easy to
 * miss after the page scrolls or the wizard resets to step one. A modal takes
 * the parent's attention instead, and states the one thing they want to know:
 * the application arrived and the director will call them.
 *
 * Built in plain DOM for the same reason the forms are: the markup around it is
 * static theme HTML excluded from hydration, so there is no React tree to mount
 * into. Styling lives in custom.css under "Registration success modal".
 */

/** How long the exit animation runs; must match the CSS transition. */
const EXIT_MS = 220;

const COPY = {
  title: 'განაცხადი წარმატებით გაიგზავნა!',
  body: 'მადლობა! თქვენი განაცხადი მიღებულია. სკოლის დირექტორი მალე დაგიკავშირდებათ ვარჯიშის დროის შესათანხმებლად.',
  close: 'დახურვა',
  closeLabel: 'ფანჯრის დახურვა',
};

/**
 * Opens the confirmation modal.
 *
 * `returnFocusTo` is the element focus goes back to on close -- normally the
 * submit button the parent just pressed, so a keyboard user is not dropped at
 * the top of the document.
 */
export function showSuccessModal({ returnFocusTo } = {}) {
  // A second success while one card is open would stack two overlays.
  document.querySelector('.success-modal')?.remove();

  const previouslyFocused =
    returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const overlay = document.createElement('div');
  overlay.className = 'success-modal';
  overlay.innerHTML = `
    <div class="success-modal-backdrop" data-close></div>
    <div class="success-modal-card" role="dialog" aria-modal="true"
         aria-labelledby="success-modal-title" aria-describedby="success-modal-body">
      <button type="button" class="success-modal-x" data-close aria-label="${COPY.closeLabel}">&times;</button>
      <div class="success-modal-icon" aria-hidden="true">
        <svg viewBox="0 0 52 52" role="presentation" focusable="false">
          <circle class="success-modal-ring" cx="26" cy="26" r="24" />
          <path class="success-modal-tick" d="M15 27.5 L22.5 35 L37 19" />
        </svg>
      </div>
      <h3 class="success-modal-title" id="success-modal-title">${COPY.title}</h3>
      <p class="success-modal-body" id="success-modal-body">${COPY.body}</p>
      <button type="button" class="success-modal-ok" data-close>${COPY.close}</button>
    </div>
  `;

  document.body.appendChild(overlay);

  /* The page behind must not scroll while the card is up. The scrollbar's width
     is padded back on so the layout does not jump sideways as it disappears. */
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  const previousOverflow = document.body.style.overflow;
  const previousPadding = document.body.style.paddingRight;
  document.body.style.overflow = 'hidden';
  if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

  // Added on the next frame so the browser paints the "from" state first and
  // the transition actually runs, rather than the card appearing finished.
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const okButton = overlay.querySelector('.success-modal-ok');
  okButton?.focus();

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;

    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown, true);

    window.setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      previouslyFocused?.focus?.();
    }, EXIT_MS);
  }

  /**
   * Escape closes, and Tab is kept inside the card -- with the rest of the page
   * inert behind an overlay, tabbing out lands on controls the parent cannot
   * see.
   */
  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...overlay.querySelectorAll('button')];
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !overlay.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.querySelectorAll('[data-close]').forEach((element) => {
    element.addEventListener('click', close);
  });
  document.addEventListener('keydown', onKeydown, true);

  return close;
}
