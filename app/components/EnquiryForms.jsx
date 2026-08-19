'use client';

import { useEffect } from 'react';

/**
 * Wires the theme's static enquiry forms up to /api/contact.
 *
 * The form markup comes from the theme HTML, which is injected verbatim and
 * deliberately left out of hydration (see ThemePage). So rather than rendering
 * React forms -- which would mean duplicating the theme's markup and keeping
 * the copies in step -- this component renders nothing and attaches submit
 * listeners to the forms already in the DOM.
 *
 * Two shapes are handled:
 *
 *  - the contact page form, whose child-age input is `name="site"` (a leftover
 *    from the original template);
 *  - the hero registration form, which appears three times because the slider
 *    repeats it on every slide. All three are bound, and a success on one is
 *    mirrored to the others so the message is still visible after the carousel
 *    advances.
 */
const MESSAGES = {
  sending: 'იგზავნება...',
  success: 'მადლობა! თქვენი განაცხადი მიღებულია. მალე დაგიკავშირდებით.',
  validation: 'გთხოვთ შეავსოთ სახელი, ელფოსტა და ტელეფონი სწორად.',
  rateLimited: 'ძალიან ბევრი მცდელობა. გთხოვთ სცადოთ ერთი წუთის შემდეგ.',
  error: 'გაგზავნა ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.',
  // Keyed by the error code the API returns for file problems.
  file_too_large: 'ფაილი ძალიან დიდია. მაქსიმუმი 10 MB.',
  file_type_not_allowed: 'დაშვებულია მხოლოდ PDF, JPG, PNG, WebP და HEIC.',
  too_many_files: 'მაქსიმუმ 5 ფაილი.',
};

/** Field name for the child's age differs between the two form variants. */
const AGE_FIELD = { '#contactform-page': 'site', '.hero-register-form': 'childAge' };

export default function EnquiryForms() {
  useEffect(() => {
    const cleanups = [];

    for (const [selector, ageField] of Object.entries(AGE_FIELD)) {
      const forms = document.querySelectorAll(selector);

      forms.forEach((form) => {
        const button = form.querySelector('button[type="submit"]');
        const buttonLabel = button?.querySelector('span');
        const originalLabel = buttonLabel?.textContent ?? '';

        // A honeypot the theme markup has no field for. Bots that fill every
        // input give themselves away; it is hidden from users and screen
        // readers alike.
        const honeypot = document.createElement('input');
        honeypot.type = 'text';
        honeypot.name = 'website';
        honeypot.tabIndex = -1;
        honeypot.autocomplete = 'off';
        honeypot.setAttribute('aria-hidden', 'true');
        honeypot.style.cssText =
          'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
        form.appendChild(honeypot);

        const status = document.createElement('p');
        status.className = form.matches('.hero-register-form')
          ? 'hero-register-status'
          : '';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.style.display = 'none';
        if (!status.className) status.style.cssText += 'margin-top:15px;';
        form.appendChild(status);

        function showStatus(text, ok) {
          status.textContent = text;
          status.dataset.state = ok ? 'ok' : 'error';
          // The contact form has no stylesheet rules, so colour it inline.
          if (!status.className) status.style.color = ok ? '#2e7d32' : '#c62828';
          status.style.display = 'block';
        }

        function setBusy(busy) {
          if (button) button.disabled = busy;
          if (buttonLabel) {
            buttonLabel.textContent = busy ? MESSAGES.sending : originalLabel;
          }
        }

        async function handleSubmit(event) {
          event.preventDefault();

          const fields = new FormData(form);
          const chosen = fields.getAll('files').filter((f) => f && f.size > 0);

          // Multipart only when there are files: the hero form has no file
          // input, and JSON keeps that request small.
          let request;
          if (chosen.length > 0) {
            const body = new FormData();
            body.set('name', fields.get('name') ?? '');
            body.set('email', fields.get('email') ?? '');
            body.set('phone', fields.get('phone') ?? '');
            body.set('childAge', fields.get(ageField) ?? '');
            body.set('message', fields.get('message') ?? '');
            body.set('website', fields.get('website') ?? '');
            chosen.forEach((file) => body.append('files', file));
            // No Content-Type header: the browser must set the multipart
            // boundary itself.
            request = { method: 'POST', body };
          } else {
            request = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: fields.get('name') ?? '',
                email: fields.get('email') ?? '',
                phone: fields.get('phone') ?? '',
                childAge: fields.get(ageField) ?? '',
                message: fields.get('message') ?? '',
                website: fields.get('website') ?? '',
              }),
            };
          }

          setBusy(true);
          status.style.display = 'none';

          try {
            const response = await fetch('/api/contact', request);
            const result = await response.json().catch(() => ({}));

            if (response.ok && result.ok) {
              form.reset();
              showStatus(MESSAGES.success, true);
              // The hero form is duplicated across slides; clear the others so
              // a stale half-filled copy is not waiting on the next slide.
              if (form.matches('.hero-register-form')) {
                document.querySelectorAll('.hero-register-form').forEach((other) => {
                  if (other !== form) other.reset();
                });
              }
            } else if (response.status === 400) {
              // File problems get their own message -- "check your name and
              // email" is misleading when the real issue is a 20 MB scan.
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
        cleanups.push(() => {
          form.removeEventListener('submit', handleSubmit);
          honeypot.remove();
          status.remove();
        });
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
