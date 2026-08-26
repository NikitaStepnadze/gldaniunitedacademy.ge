'use client';

import { useEffect } from 'react';

import { enhanceDateInput, enhanceTimeInput } from './datePickers';
import { showSuccessModal } from './successModal';

/**
 * Drives the hero slider's multi-step registration card.
 *
 * The card used to hold a four-field enquiry form posting to /api/contact,
 * which meant the home page and the registration page asked for different
 * things and produced different records. This form posts the full application
 * to /api/registration, the same endpoint the registration page uses, split
 * across four steps so the card keeps roughly the height it had.
 *
 * Same pattern as RegistrationForm: the markup lives in the theme HTML,
 * injected verbatim and excluded from hydration (see ThemePage), so this
 * component renders nothing and attaches listeners to the form in the DOM.
 *
 * Three things the card had to solve that the registration page does not:
 *
 *  - Only slide 1 carries a live form. Slides 2 and 3 now hold a CTA linking
 *    to /registration, so there is one form instance, one set of ids and one
 *    set of step state rather than three copies drifting apart.
 *  - The hero Swiper has no autoplay (main.js only wires pagination), so a
 *    slide cannot advance under a parent mid-typing. Changing slides away and
 *    back leaves the form exactly as it was, because the DOM node persists.
 *  - Validation runs per step, on Continue. A parent is never sent back to a
 *    step they have already passed, and never reaches step 4 only to be told
 *    the personal number on step 1 was short.
 *
 * The rules mirror validateRegistration() on the server, as
 * RegistrationForm.jsx does. The server stays the authority.
 */
const MESSAGES = {
  sending: 'იგზავნება...',
  success:
    'მადლობა! განაცხადი მიღებულია. დაგიკავშირდებით 1–2 სამუშაო დღეში ვარჯიშის შესათანხმებლად.',
  error: 'გაგზავნა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.',
  rateLimited: 'ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ ერთი წუთის შემდეგ.',
  validation: 'გთხოვთ შეასწოროთ მონიშნული ველები.',

  file_too_large: 'ფაილი ძალიან დიდია. მაქსიმუმი 10 MB.',
  file_type_not_allowed: 'დაშვებულია მხოლოდ PDF, JPG, PNG, WebP და HEIC.',
  too_many_files: 'ფაილების რაოდენობა აღემატება ლიმიტს.',
  photo_required: 'ბავშვის ფოტო სავალდებულოა.',
  photo_type_not_allowed: 'ფოტო უნდა იყოს JPG, PNG, WebP ან HEIC.',
  form100_required: 'ფორმა 100 სავალდებულოა.',
};

/** Per-field messages, keyed by field name then by the reason it failed. */
const FIELD_MESSAGES = {
  childFirstName: { required: 'შეიყვანეთ სახელი' },
  childLastName: { required: 'შეიყვანეთ გვარი' },
  childIdNumber: { required: 'შეიყვანეთ პირადი ნომერი', invalid: '11 ციფრი' },
  childDob: {
    required: 'აირჩიეთ თარიღი',
    invalid: 'თარიღი არასწორია',
    out_of_range: '4-დან 17 წლამდე',
  },
  address: { required: 'შეიყვანეთ მისამართი' },
  schoolFrom: { required: 'მიუთითეთ დრო', invalid: 'დრო არასწორია' },
  schoolTo: {
    required: 'მიუთითეთ დრო',
    invalid: 'დრო არასწორია',
    order: 'უნდა იყოს დაწყებაზე გვიან',
  },

  motherFirstName: { required: 'შეიყვანეთ სახელი' },
  motherLastName: { required: 'შეიყვანეთ გვარი' },
  motherIdNumber: { required: 'შეიყვანეთ პირადი ნომერი', invalid: '11 ციფრი' },
  motherPhone: { required: 'შეიყვანეთ ტელეფონი', invalid: 'ნომერი არასწორია' },

  fatherFirstName: { required: 'შეიყვანეთ სახელი' },
  fatherLastName: { required: 'შეიყვანეთ გვარი' },
  fatherIdNumber: { required: 'შეიყვანეთ პირადი ნომერი', invalid: '11 ციფრი' },
  fatherPhone: { required: 'შეიყვანეთ ტელეფონი', invalid: 'ნომერი არასწორია' },

  photo: {
    required: 'დაურთეთ ფოტო',
    type: 'JPG, PNG, WebP ან HEIC',
    size: 'აღემატება 10 MB-ს',
  },
  form100: {
    required: 'დაურთეთ ფორმა 100',
    type: 'PDF, JPG, PNG, WebP ან HEIC',
    size: 'აღემატება 10 MB-ს',
  },
  trainingPlan: {
    required: 'აირჩიეთ ვარჯიშის გეგმა',
    invalid: 'აირჩიეთ ვარჯიშის გეგმა',
  },
  consent: { required: 'დაეთანხმეთ მონაცემთა დამუშავებას' },
};

const PHONE_DIGITS = /^\d{9,15}$/;
const ID_DIGITS = /^\d{11}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const DOC_TYPES = [...PHOTO_TYPES, 'application/pdf'];

const MIN_AGE = 4;
const MAX_AGE = 17;

const FIRST_STEP = 1;
const LAST_STEP = 4;

/** Every text field posted to the API. Both parent blocks are always sent. */
const TEXT_FIELDS = [
  'childFirstName',
  'childLastName',
  'childIdNumber',
  'childDob',
  'address',
  'schoolFrom',
  'schoolTo',
  'motherFirstName',
  'motherLastName',
  'motherIdNumber',
  'motherPhone',
  'fatherFirstName',
  'fatherLastName',
  'fatherIdNumber',
  'fatherPhone',
];

/** The four inputs making up one parent's block. */
const PARENT_SUFFIXES = ['FirstName', 'LastName', 'IdNumber', 'Phone'];

function digitsOnly(value) {
  return value.replace(/[\s\-()+]/g, '');
}

function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Whole-years age on `now` for a YYYY-MM-DD date, or null if unparseable. */
function ageFromDob(value, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Catches impossible days such as 2020-02-31, which Date silently rolls over.
  if (parsed.toISOString().slice(0, 10) !== value) return null;

  let age = now.getFullYear() - parsed.getUTCFullYear();
  const monthDiff = now.getMonth() - parsed.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getUTCDate())) age -= 1;
  return age;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A file's type as the browser reports it, falling back to its extension --
 * some browsers report an empty `type` for HEIC. The server checks the real
 * type regardless; this is a UX guard, not the security boundary.
 */
function looksAllowed(file, allowed) {
  if (allowed.includes(file.type)) return true;
  if (file.type) return false;
  return /\.(pdf|jpe?g|png|webp|heic)$/i.test(file.name);
}

export default function HeroRegisterWizard() {
  useEffect(() => {
    const form = document.getElementById('hero-register-form');
    if (!form) return undefined;

    const steps = [...form.querySelectorAll('[data-step]')];
    const dots = [...form.querySelectorAll('[data-step-dot]')];
    const backButton = form.querySelector('[data-step-back]');
    const nextButton = form.querySelector('[data-step-next]');
    const submitButton = form.querySelector('[data-step-submit]');
    const currentLabel = form.querySelector('[data-step-current]');
    const submitLabel = submitButton?.querySelector('span');
    const originalSubmitLabel = submitLabel?.textContent ?? '';

    let step = FIRST_STEP;
    /* Which parent block step 3 is asking about. The API takes either, so the
       card asks for one rather than showing eight inputs. */
    let parent = 'mother';

    /* --- honeypot ---------------------------------------------------------
       A field no human sees. Bots that fill every input give themselves away. */
    const honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText =
      'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
    form.appendChild(honeypot);

    /* --- status line ----------------------------------------------------- */
    const status = document.createElement('p');
    status.className = 'hero-register-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    form.appendChild(status);

    /* Closes an open confirmation card on unmount, so a route change cannot
       leave the overlay -- and the scroll lock it sets -- behind. */
    let closeSuccessModal = null;

    function showStatus(text, ok) {
      status.textContent = text;
      status.dataset.state = ok ? 'ok' : 'error';
      status.hidden = false;
    }

    function field(name) {
      return form.querySelector(`[name="${name}"]`);
    }

    /**
     * The selected value of a radio group, or '' when none is chosen.
     *
     * `field()` returns the first element with the name, which for a radio
     * group is the first *option*, not the group's answer -- its `.value` reads
     * 'standard' even when nothing has been clicked.
     */
    function checkedValue(name) {
      return form.querySelector(`[name="${name}"]:checked`)?.value ?? '';
    }

    function valueOf(name) {
      return field(name)?.value.trim() ?? '';
    }

    function setError(name, reason) {
      const input = field(name);
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      const message = reason ? (FIELD_MESSAGES[name]?.[reason] ?? MESSAGES.validation) : '';

      if (slot) {
        slot.textContent = message;
        slot.hidden = !message;
      }
      if (input) {
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    }

    function clearErrors() {
      form.querySelectorAll('[data-error-for]').forEach((slot) => {
        slot.textContent = '';
        slot.hidden = true;
      });
      form.querySelectorAll('[aria-invalid]').forEach((input) => {
        input.removeAttribute('aria-invalid');
      });
    }

    /* --- step navigation -------------------------------------------------- */

    /**
     * Shows one step and updates the dots and the buttons around it.
     *
     * Steps are toggled with `hidden` rather than unmounted: every value the
     * parent has typed stays in the DOM, so stepping back and forth -- or
     * changing hero slide and coming back -- loses nothing, and the final
     * submit can read all four steps at once.
     */
    function render() {
      steps.forEach((element) => {
        element.hidden = Number(element.dataset.step) !== step;
      });
      dots.forEach((dot) => {
        const index = Number(dot.dataset.stepDot);
        dot.dataset.state = index === step ? 'current' : index < step ? 'done' : 'todo';
      });
      if (currentLabel) currentLabel.textContent = String(step);

      if (backButton) backButton.hidden = step === FIRST_STEP;
      if (nextButton) nextButton.hidden = step === LAST_STEP;
      if (submitButton) submitButton.hidden = step !== LAST_STEP;
    }

    /** Moves to `target`, focusing its first control so the keyboard follows. */
    function goTo(target) {
      step = Math.min(LAST_STEP, Math.max(FIRST_STEP, target));
      status.hidden = true;
      render();

      const active = steps.find((element) => Number(element.dataset.step) === step);
      // Skips the hidden parent block's inputs, which are not focusable.
      const first = active?.querySelector('input:not([hidden]), textarea');
      if (first && first.offsetParent !== null) first.focus();
    }

    /* --- attached-file lists ---------------------------------------------
       A file input shows only a filename, which is thin reassurance when the
       document is mandatory. These list what is attached, with sizes. */
    function renderFileList(name) {
      const input = field(name);
      const slot = form.querySelector(`[data-files-for="${name}"]`);
      if (!input || !slot) return;

      const files = [...(input.files ?? [])];
      if (files.length === 0) {
        slot.textContent = '';
        slot.hidden = true;
        return;
      }
      slot.hidden = false;
      slot.textContent = files
        .map((file) => `${file.name} (${formatSize(file.size)})`)
        .join(', ');
    }

    /* --- validation, per step -------------------------------------------- */

    function requireText(name, bad) {
      if (!valueOf(name)) {
        setError(name, 'required');
        bad.push(name);
      }
    }

    function requireId(name, bad) {
      const value = valueOf(name);
      if (!value) {
        setError(name, 'required');
        bad.push(name);
      } else if (!ID_DIGITS.test(digitsOnly(value))) {
        setError(name, 'invalid');
        bad.push(name);
      }
    }

    function requirePhone(name, bad) {
      const value = valueOf(name);
      if (!value) {
        setError(name, 'required');
        bad.push(name);
      } else if (!PHONE_DIGITS.test(digitsOnly(value))) {
        setError(name, 'invalid');
        bad.push(name);
      }
    }

    /*
     * Checks an attached file, if one is attached at all.
     *
     * Both documents are optional: a parent who cannot scan form 100 right now
     * should still be able to apply, and the academy collects it later. A file
     * that *is* chosen still has to be the right type and size, since that is
     * a mistake worth catching before the upload rather than after.
     */
    function checkFile(name, allowed, bad) {
      const file = [...(field(name)?.files ?? [])][0];
      if (!file) return;

      if (!looksAllowed(file, allowed)) {
        setError(name, 'type');
        bad.push(name);
      } else if (file.size > MAX_BYTES) {
        setError(name, 'size');
        bad.push(name);
      }
    }

    /** Marks every bad field on `which` step and returns the first one's name. */
    function validateStep(which) {
      const bad = [];

      if (which === 1) {
        requireText('childFirstName', bad);
        requireText('childLastName', bad);
        requireId('childIdNumber', bad);

        const dob = valueOf('childDob');
        if (!dob) {
          setError('childDob', 'required');
          bad.push('childDob');
        } else {
          const age = ageFromDob(dob, new Date());
          if (age === null) {
            setError('childDob', 'invalid');
            bad.push('childDob');
          } else if (age < MIN_AGE || age > MAX_AGE) {
            setError('childDob', 'out_of_range');
            bad.push('childDob');
          }
        }
      }

      if (which === 2) {
        requireText('address', bad);

        /* Both ends required together, and the end must come after the start --
           "from 09:00" alone says nothing about when the child is free. */
        const from = valueOf('schoolFrom');
        const to = valueOf('schoolTo');
        let fromOk = false;
        if (!from) {
          setError('schoolFrom', 'required');
          bad.push('schoolFrom');
        } else if (!TIME_PATTERN.test(from)) {
          setError('schoolFrom', 'invalid');
          bad.push('schoolFrom');
        } else {
          fromOk = true;
        }

        if (!to) {
          setError('schoolTo', 'required');
          bad.push('schoolTo');
        } else if (!TIME_PATTERN.test(to)) {
          setError('schoolTo', 'invalid');
          bad.push('schoolTo');
        } else if (fromOk && minutesOf(to) <= minutesOf(from)) {
          // Flagged on the end time, the one the parent would change.
          setError('schoolTo', 'order');
          bad.push('schoolTo');
        }
      }

      if (which === 3) {
        // The selected parent is the one the card is collecting, so it is
        // required outright -- the server needs one complete block.
        requireText(`${parent}FirstName`, bad);
        requireText(`${parent}LastName`, bad);
        requireId(`${parent}IdNumber`, bad);
        requirePhone(`${parent}Phone`, bad);

        /*
         * The other block still has to be either empty or complete, because
         * that is the server's rule and both blocks are always posted. Someone
         * who switches tabs, types a character and switches back would
         * otherwise pass this step and be rejected after the upload, with the
         * errors on fields the visible tab does not show.
         */
        const other = parent === 'mother' ? 'father' : 'mother';
        const otherFields = PARENT_SUFFIXES.map((suffix) => `${other}${suffix}`);
        if (otherFields.some((name) => valueOf(name) !== '')) {
          requireText(`${other}FirstName`, bad);
          requireText(`${other}LastName`, bad);
          requireId(`${other}IdNumber`, bad);
          requirePhone(`${other}Phone`, bad);
        }
      }

      if (which === 4) {
        checkFile('photo', PHOTO_TYPES, bad);
        checkFile('form100', DOC_TYPES, bad);

        // A radio group, so `field()` -- which returns the first match -- would
        // report the first option rather than the group's answer.
        if (!checkedValue('trainingPlan')) {
          setError('trainingPlan', 'required');
          bad.push('trainingPlan');
        }

        if (!field('consent')?.checked) {
          setError('consent', 'required');
          bad.push('consent');
        }
      }

      return bad[0] ?? null;
    }

    function setBusy(busy) {
      if (submitButton) submitButton.disabled = busy;
      if (backButton) backButton.disabled = busy;
      if (submitLabel) {
        submitLabel.textContent = busy ? MESSAGES.sending : originalSubmitLabel;
      }
    }

    /* --- parent tabs ------------------------------------------------------ */
    const tabs = [...form.querySelectorAll('[data-parent-tab]')];
    function selectParent(which) {
      parent = which;
      form.querySelectorAll('[data-parent]').forEach((block) => {
        block.hidden = block.dataset.parent !== which;
      });
      tabs.forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.parentTab === which));
      });
      /*
       * Clear the hidden block's errors only if it is now empty. A block left
       * half-filled is still a real error -- the server rejects it -- and its
       * fields are the ones the parent has to go back and finish, so the
       * markers have to survive the tab switch that hid them.
       */
      const other = which === 'mother' ? 'father' : 'mother';
      const otherFields = PARENT_SUFFIXES.map((suffix) => `${other}${suffix}`);
      if (otherFields.every((name) => valueOf(name) === '')) {
        otherFields.forEach((name) => setError(name, null));
      }
    }

    const tabHandlers = tabs.map((tab) => {
      const handler = () => selectParent(tab.dataset.parentTab);
      tab.addEventListener('click', handler);
      return { tab, handler };
    });

    /* --- buttons ---------------------------------------------------------- */
    function onNext() {
      const firstBad = validateStep(step);
      if (firstBad) {
        // On step 3 the bad field can be in the hidden parent block: a block
        // the parent started, switched away from and left incomplete.
        if (firstBad.startsWith('father')) selectParent('father');
        else if (firstBad.startsWith('mother')) selectParent('mother');

        showStatus(MESSAGES.validation, false);
        field(firstBad)?.focus();
        return;
      }
      goTo(step + 1);
    }

    function onBack() {
      goTo(step - 1);
    }

    nextButton?.addEventListener('click', onNext);
    backButton?.addEventListener('click', onBack);

    /*
     * Enter inside a text input submits the form natively. On any step but the
     * last that should advance instead, otherwise a parent pressing Enter on
     * step 1 posts a form that is three quarters empty.
     */
    function onKeyDown(event) {
      if (event.key !== 'Enter') return;
      if (event.target.tagName === 'TEXTAREA') return;
      if (step === LAST_STEP) return;
      event.preventDefault();
      onNext();
    }
    form.addEventListener('keydown', onKeyDown);

    /* --- submit ----------------------------------------------------------- */
    async function handleSubmit(event) {
      event.preventDefault();
      status.hidden = true;

      /* Re-check every step, not just the last: a parent can edit a passed step
         by going back, and the server would reject it after the upload. */
      for (let which = FIRST_STEP; which <= LAST_STEP; which += 1) {
        const firstBad = validateStep(which);
        if (firstBad) {
          // The offending field may be in the parent block the tabs are
          // hiding -- an incomplete block the parent started and left.
          if (firstBad.startsWith('father')) selectParent('father');
          else if (firstBad.startsWith('mother')) selectParent('mother');

          if (which !== step) goTo(which);
          // goTo clears the status line, so report after moving.
          showStatus(MESSAGES.validation, false);
          field(firstBad)?.focus();
          return;
        }
      }

      // Built by hand rather than from `new FormData(form)` so the consent
      // checkbox and the honeypot are handled explicitly.
      const body = new FormData();
      for (const name of TEXT_FIELDS) {
        body.set(name, field(name)?.value ?? '');
      }
      // The card has no comment box; the field exists on the API.
      body.set('message', '');
      // Set from the group's checked option, not from TEXT_FIELDS: `field()`
      // would hand back the first radio and post 'standard' whatever was picked.
      body.set('trainingPlan', checkedValue('trainingPlan'));
      body.set('website', honeypot.value);
      // Appended only when chosen: setting an absent file would post the string
      // "undefined" as the field's value, which the route would read as a file
      // that is present but unusable.
      const photoFile = [...(field('photo')?.files ?? [])][0];
      const form100File = [...(field('form100')?.files ?? [])][0];
      if (photoFile) body.set('photo', photoFile);
      if (form100File) body.set('form100', form100File);

      setBusy(true);
      try {
        // No Content-Type header: the browser must set the multipart boundary.
        const response = await fetch('/api/registration', { method: 'POST', body });
        const result = await response.json().catch(() => ({}));

        if (response.ok && result.ok) {
          form.reset();
          clearErrors();
          renderFileList('photo');
          renderFileList('form100');
          selectParent('mother');
          goTo(FIRST_STEP);
          // goTo clears the status line, and the modal is the confirmation
          // now -- the card is back on step 1 with nothing left to read.
          closeSuccessModal = showSuccessModal();
          return;
        }

        if (response.status === 400 && result.fields) {
          // The server rejected specific fields; mirror its reasons inline and
          // move to the step the first one lives on.
          for (const [name, reason] of Object.entries(result.fields)) {
            setError(name, reason);
          }
          const firstName = Object.keys(result.fields)[0];
          // A father field is invisible while the mother tab is showing, so the
          // tab has to follow the error before the step does.
          if (firstName.startsWith('father')) selectParent('father');
          else if (firstName.startsWith('mother')) selectParent('mother');

          const owner = steps.find((element) =>
            element.querySelector(`[name="${firstName}"]`)
          );
          if (owner) goTo(Number(owner.dataset.step));
          showStatus(MESSAGES.validation, false);
          field(firstName)?.focus();
        } else if (response.status === 400) {
          showStatus(MESSAGES[result.error] ?? MESSAGES.validation, false);
        } else if (response.status === 429) {
          showStatus(MESSAGES.rateLimited, false);
        } else {
          showStatus(MESSAGES.error, false);
        }
      } catch {
        showStatus(MESSAGES.error, false);
      } finally {
        setBusy(false);
      }
    }
    form.addEventListener('submit', handleSubmit);

    /* --- per-field listeners ---------------------------------------------- */
    const fileHandlers = ['photo', 'form100'].map((name) => {
      const input = field(name);
      const handler = () => {
        renderFileList(name);
        setError(name, null);
      };
      input?.addEventListener('change', handler);
      return { input, handler };
    });

    // Clearing a field's error as it is edited keeps a corrected field from
    // still looking wrong.
    const inputs = [...form.querySelectorAll('input, textarea')].filter(
      (input) => input.type !== 'file' && input !== honeypot
    );
    const onInput = (event) => setError(event.target.name, null);
    inputs.forEach((input) => input.addEventListener('input', onInput));

    /*
     * Radios and checkboxes fire `change`, not `input`, so the listener above
     * never reaches them and their errors would stay on screen after being
     * answered. This covers the consent box and the training-plan group alike.
     */
    const choiceInputs = [...form.querySelectorAll('input[type="radio"], input[type="checkbox"]')];
    const onChoice = (event) => setError(event.target.name, null);
    choiceInputs.forEach((input) => input.addEventListener('change', onChoice));

    /*
     * Swap the two native controls for select-based pickers: day/month/year in
     * the order the date is spoken, and 24-hour hour/minute lists instead of a
     * masked AM/PM field. Done here rather than in the HTML because the year
     * range is relative to today and the markup is a static file.
     *
     * Each picker keeps its field's `name` on a hidden input holding the same
     * YYYY-MM-DD / HH:MM string, so validation and submit above are unchanged.
     */
    const thisYear = new Date().getFullYear();
    const teardowns = [
      enhanceDateInput(field('childDob'), {
        minYear: thisYear - MAX_AGE - 1,
        maxYear: thisYear - MIN_AGE,
      }),
      enhanceTimeInput(field('schoolFrom')),
      enhanceTimeInput(field('schoolTo')),
    ];

    render();

    return () => {
      form.removeEventListener('submit', handleSubmit);
      form.removeEventListener('keydown', onKeyDown);
      nextButton?.removeEventListener('click', onNext);
      backButton?.removeEventListener('click', onBack);
      tabHandlers.forEach(({ tab, handler }) => tab.removeEventListener('click', handler));
      fileHandlers.forEach(({ input, handler }) =>
        input?.removeEventListener('change', handler)
      );
      inputs.forEach((input) => input.removeEventListener('input', onInput));
      choiceInputs.forEach((input) => input.removeEventListener('change', onChoice));
      teardowns.forEach((restore) => restore());
      closeSuccessModal?.();
      honeypot.remove();
      status.remove();
    };
  }, []);

  return null;
}
