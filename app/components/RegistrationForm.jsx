'use client';

import { useEffect } from 'react';

import { enhanceDateInput, enhanceTimeInput } from './datePickers';
import { showSuccessModal } from './successModal';

/**
 * Wires the registration page's static form up to /api/registration.
 *
 * Follows the same pattern as EnquiryForms: the markup is part of the theme
 * HTML, injected verbatim and excluded from hydration (see ThemePage), so this
 * component renders nothing and attaches listeners to the form already in the
 * DOM rather than duplicating the markup in JSX.
 *
 * It does more than EnquiryForms because this form is long and almost every
 * field is mandatory. Submitting a form this size and getting back one generic
 * "check your details" line is a bad experience, so validation happens per
 * field, inline, and the first offending field is focused.
 *
 * The rules here mirror validateRegistration() on the server. That duplication
 * is deliberate: the server is the authority, this is only the fast feedback.
 */
const MESSAGES = {
  sending: 'იგზავნება...',
  success:
    'მადლობა! განაცხადი მიღებულია. დაგიკავშირდებით 1–2 სამუშაო დღეში ვარჯიშის შესათანხმებლად.',
  error: 'გაგზავნა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.',
  rateLimited: 'ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ ერთი წუთის შემდეგ.',
  validation: 'გთხოვთ შეასწოროთ მონიშნული ველები.',

  // Server-side file rejections, keyed by the API's error code.
  file_too_large: 'ფაილი ძალიან დიდია. მაქსიმუმი 10 MB.',
  file_type_not_allowed: 'დაშვებულია მხოლოდ PDF, JPG, PNG, WebP და HEIC.',
  too_many_files: 'ფაილების რაოდენობა აღემატება ლიმიტს.',
  photo_required: 'ბავშვის ფოტო სავალდებულოა.',
  photo_type_not_allowed: 'ფოტო უნდა იყოს JPG, PNG, WebP ან HEIC.',
  form100_required: 'ფორმა 100 სავალდებულოა.',
};

/** Per-field messages, keyed by field name then by the reason it failed. */
const FIELD_MESSAGES = {
  childFirstName: { required: 'შეიყვანეთ ბავშვის სახელი' },
  childLastName: { required: 'შეიყვანეთ ბავშვის გვარი' },
  childIdNumber: {
    required: 'შეიყვანეთ პირადი ნომერი',
    invalid: 'პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან',
  },
  childDob: {
    required: 'აირჩიეთ დაბადების თარიღი',
    invalid: 'თარიღი არასწორია',
    out_of_range: 'აკადემია იღებს 4-დან 17 წლამდე ბავშვებს',
  },
  address: { required: 'შეიყვანეთ მისამართი' },
  schoolFrom: { required: 'მიუთითეთ სკოლის დაწყების დრო', invalid: 'დრო არასწორია' },
  schoolTo: {
    required: 'მიუთითეთ სკოლის დამთავრების დრო',
    invalid: 'დრო არასწორია',
    order: 'დამთავრების დრო უნდა იყოს დაწყების დროზე გვიან',
  },

  motherFirstName: {
    required: 'შეიყვანეთ დედის სახელი',
    // Shown when neither parent block was touched at all.
    parent_required: 'შეავსეთ სულ მცირე ერთი მშობლის მონაცემები',
  },
  motherLastName: { required: 'შეიყვანეთ დედის გვარი' },
  motherIdNumber: {
    required: 'შეიყვანეთ დედის პირადი ნომერი',
    invalid: 'პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან',
  },
  motherPhone: { required: 'შეიყვანეთ დედის ტელეფონი', invalid: 'ნომერი არასწორია' },

  fatherFirstName: { required: 'შეიყვანეთ მამის სახელი' },
  fatherLastName: { required: 'შეიყვანეთ მამის გვარი' },
  fatherIdNumber: {
    required: 'შეიყვანეთ მამის პირადი ნომერი',
    invalid: 'პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან',
  },
  fatherPhone: { required: 'შეიყვანეთ მამის ტელეფონი', invalid: 'ნომერი არასწორია' },

  photo: {
    required: 'დაურთეთ ბავშვის ფოტო',
    type: 'ფოტო უნდა იყოს JPG, PNG, WebP ან HEIC',
    size: 'ფოტო აღემატება 10 MB-ს',
  },
  form100: {
    required: 'დაურთეთ ფორმა 100',
    type: 'დაშვებულია PDF, JPG, PNG, WebP და HEIC',
    size: 'ფაილი აღემატება 10 MB-ს',
  },
  consent: { required: 'გთხოვთ დაეთანხმოთ მონაცემთა დამუშავებას' },
};

/**
 * Digits only, ignoring the +, spaces and dashes people write numbers with.
 * Georgian mobile numbers are 9 digits; the upper bound leaves room for an
 * international prefix without accepting arbitrary text.
 */
const PHONE_DIGITS = /^\d{9,15}$/;

/** Georgian personal number ("პირადი ნომერი"): exactly 11 digits. */
const ID_DIGITS = /^\d{11}$/;

/** A time as `<input type="time">` submits it: HH:MM, 24-hour. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const DOC_TYPES = [...PHOTO_TYPES, 'application/pdf'];

const MIN_AGE = 4;
const MAX_AGE = 17;

/** Strips the separators people type inside numbers before matching. */
function digitsOnly(value) {
  return value.replace(/[\s\-()+]/g, '');
}

/** Minutes since midnight, for comparing two HH:MM times. */
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

/** Human-readable size for the attached-file list. */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A file's type as the browser reports it, falling back to its extension.
 *
 * Some browsers report an empty `type` for HEIC, and for PDFs served from odd
 * sources, so a name check keeps a valid file from being rejected client-side.
 * The server checks the real type regardless -- this is a UX guard, not the
 * security boundary.
 */
function looksAllowed(file, allowed) {
  if (allowed.includes(file.type)) return true;
  if (file.type) return false;
  return /\.(pdf|jpe?g|png|webp|heic)$/i.test(file.name);
}

/** Text fields the child section requires, validated as plain non-empty. */
const REQUIRED_TEXT = ['childFirstName', 'childLastName', 'address'];

/** Every text field posted to the API, in form order. */
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
  'message',
];

/** The four inputs making up one parent's block, given 'mother' or 'father'. */
function parentFields(prefix) {
  return [`${prefix}FirstName`, `${prefix}LastName`, `${prefix}IdNumber`, `${prefix}Phone`];
}

export default function RegistrationForm() {
  useEffect(() => {
    const form = document.getElementById('registration-form');
    if (!form) return undefined;

    const button = form.querySelector('button[type="submit"]');
    const buttonLabel = button?.querySelector('span');
    const originalLabel = buttonLabel?.textContent ?? '';

    /* --- honeypot ---------------------------------------------------------
       A field no human sees. Bots that fill every input give themselves away.
       Hidden from screen readers too, so it never reaches a real visitor. */
    const honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
    form.appendChild(honeypot);

    /* --- status line ----------------------------------------------------- */
    const status = document.createElement('p');
    status.className = 'registration-status';
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

    function valueOf(name) {
      return field(name)?.value.trim() ?? '';
    }

    function errorSlot(name) {
      return form.querySelector(`[data-error-for="${name}"]`);
    }

    /** Shows or clears one field's error, keeping aria-invalid in step. */
    function setError(name, reason) {
      const input = field(name);
      const slot = errorSlot(name);
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

    /* --- attached-file lists ---------------------------------------------
       A file input shows only the filename, which is not much reassurance when
       a document is mandatory. These list what is actually attached, with
       sizes. */
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

    /* --- validation ------------------------------------------------------ */

    /**
     * Checks one single-file input, pushing any failure onto `bad`.
     *
     * Both documents are optional: a parent who cannot scan form 100 at the
     * point of applying should not be blocked, and the academy collects it
     * afterwards. A file that is chosen still has to be a valid one.
     */
    function validateFile(name, allowed, bad) {
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

    /**
     * Validates one parent's block, mirroring the server's rule: an untouched
     * block is fine, a started one must be complete. Returns whether anything
     * in it was filled in, so the caller can require at least one parent.
     */
    function validateParent(prefix, bad) {
      const [firstName, lastName, idNumber, phone] = parentFields(prefix);
      const filled = parentFields(prefix).some((name) => valueOf(name) !== '');
      if (!filled) return false;

      for (const name of [firstName, lastName]) {
        if (!valueOf(name)) {
          setError(name, 'required');
          bad.push(name);
        }
      }

      const id = valueOf(idNumber);
      if (!id) {
        setError(idNumber, 'required');
        bad.push(idNumber);
      } else if (!ID_DIGITS.test(digitsOnly(id))) {
        setError(idNumber, 'invalid');
        bad.push(idNumber);
      }

      const tel = valueOf(phone);
      if (!tel) {
        setError(phone, 'required');
        bad.push(phone);
      } else if (!PHONE_DIGITS.test(digitsOnly(tel))) {
        setError(phone, 'invalid');
        bad.push(phone);
      }

      return true;
    }

    /** Validates everything, marks each bad field, returns the first bad name. */
    function validate() {
      clearErrors();
      const bad = [];

      for (const name of REQUIRED_TEXT) {
        if (!valueOf(name)) {
          setError(name, 'required');
          bad.push(name);
        }
      }

      const childId = valueOf('childIdNumber');
      if (!childId) {
        setError('childIdNumber', 'required');
        bad.push('childIdNumber');
      } else if (!ID_DIGITS.test(digitsOnly(childId))) {
        setError('childIdNumber', 'invalid');
        bad.push('childIdNumber');
      }

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

      /* School hours: both ends required together, and the end must come after
         the start -- "from 09:00" alone says nothing about when the child is
         free to train. */
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
        // Flagged on the end time, which is the one the parent would change.
        setError('schoolTo', 'order');
        bad.push('schoolTo');
      }

      const hasMother = validateParent('mother', bad);
      const hasFather = validateParent('father', bad);
      if (!hasMother && !hasFather) {
        // Reported on the mother's name, where the section starts, so focusing
        // the first bad field lands somewhere that makes sense.
        setError('motherFirstName', 'parent_required');
        bad.push('motherFirstName');
      }

      validateFile('photo', PHOTO_TYPES, bad);
      validateFile('form100', DOC_TYPES, bad);

      if (!field('consent')?.checked) {
        setError('consent', 'required');
        bad.push('consent');
      }

      return bad[0] ?? null;
    }

    function setBusy(busy) {
      if (button) button.disabled = busy;
      if (buttonLabel) buttonLabel.textContent = busy ? MESSAGES.sending : originalLabel;
    }

    /* --- submit ----------------------------------------------------------- */
    async function handleSubmit(event) {
      event.preventDefault();
      status.hidden = true;

      const firstBad = validate();
      if (firstBad) {
        showStatus(MESSAGES.validation, false);
        const input = field(firstBad);
        input?.focus();
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Built by hand rather than from `new FormData(form)` so the consent
      // checkbox and the honeypot are handled explicitly and no unexpected
      // field is forwarded.
      const body = new FormData();
      for (const name of TEXT_FIELDS) {
        body.set(name, field(name)?.value ?? '');
      }
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
          // The confirmation is the modal now; an inline line under the form
          // would only repeat it behind the card.
          status.hidden = true;
          closeSuccessModal = showSuccessModal({ returnFocusTo: button });
          return;
        }

        if (response.status === 400 && result.fields) {
          // The server rejected specific fields; mirror its reasons inline.
          for (const [name, reason] of Object.entries(result.fields)) {
            setError(name, reason);
          }
          showStatus(MESSAGES.validation, false);
          field(Object.keys(result.fields)[0])?.focus();
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

    /* --- listeners -------------------------------------------------------- */
    const fileInputs = ['photo', 'form100'];
    const fileHandlers = fileInputs.map((name) => {
      const input = field(name);
      const handler = () => {
        renderFileList(name);
        setError(name, null);
      };
      input?.addEventListener('change', handler);
      return { input, handler };
    });

    form.addEventListener('submit', handleSubmit);

    // Clearing a field's error as soon as it is edited keeps a corrected field
    // from still looking wrong while the parent works down the form.
    const textInputs = [...form.querySelectorAll('input, textarea')].filter(
      (input) => input.type !== 'file' && input !== honeypot
    );
    const onInput = (event) => {
      const { name } = event.target;
      setError(name, null);

      /*
       * Editing any field in a parent block can also clear the "fill in at
       * least one parent" error, which is reported on the mother's name -- a
       * field the parent may not be touching. Clear it from the father's block
       * too, otherwise it lingers after they have answered it.
       */
      if (name.startsWith('father')) setError('motherFirstName', null);
    };
    textInputs.forEach((input) => input.addEventListener('input', onInput));

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

    return () => {
      form.removeEventListener('submit', handleSubmit);
      fileHandlers.forEach(({ input, handler }) =>
        input?.removeEventListener('change', handler)
      );
      textInputs.forEach((input) => input.removeEventListener('input', onInput));
      teardowns.forEach((restore) => restore());
      closeSuccessModal?.();
      honeypot.remove();
      status.remove();
    };
  }, []);

  return null;
}
