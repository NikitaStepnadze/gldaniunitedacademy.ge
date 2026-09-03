'use client';

import { useEffect } from 'react';

/**
 * Wires the contact page's static enquiry form up to WhatsApp.
 *
 * The form markup comes from the theme HTML, which is injected verbatim and
 * deliberately left out of hydration (see ThemePage). So rather than rendering
 * a React form -- which would mean duplicating the theme's markup and keeping
 * the copies in step -- this component renders nothing and attaches a submit
 * listener to the form already in the DOM.
 *
 * This form is for questions, not applications: name, phone, email and the
 * question itself. Instead of posting to /api/contact it composes a prefilled
 * message and hands the visitor off to WhatsApp, so the conversation starts in
 * the channel the academy actually answers on. Enrolment still goes through
 * the hero wizard and /api/registration -- see HeroRegisterWizard.
 */
const MESSAGES = {
  opening: 'იხსნება...',
  success: 'გადამისამართდით WhatsApp-ზე. თუ ის არ გაიხსნა, დააჭირეთ ღილაკს ხელახლა.',
  validation: 'გთხოვთ შეავსოთ სახელი, ტელეფონი, ელფოსტა და შეკითხვა სწორად.',
  blocked: 'WhatsApp ვერ გაიხსნა. გთხოვთ დაგვირეკოთ: 551 39 09 93.',
};

/** The academy's WhatsApp number, digits only, as wa.me expects it. */
const WHATSAPP_NUMBER = '995551390993';

/** Same shape check the API used: something@something.tld. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Georgian mobile numbers are 9 digits; allow +995 and separators. */
function hasEnoughDigits(phone) {
  return phone.replace(/\D/g, '').length >= 9;
}

export default function EnquiryForms() {
  useEffect(() => {
    const form = document.getElementById('contactform-page');
    if (!form) return undefined;

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
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    // This form has no stylesheet rules of its own, so it is styled inline.
    status.style.cssText = 'display:none;margin-top:15px;';
    form.appendChild(status);

    function showStatus(text, ok) {
      status.textContent = text;
      status.dataset.state = ok ? 'ok' : 'error';
      status.style.color = ok ? '#2e7d32' : '#c62828';
      status.style.display = 'block';
    }

    function handleSubmit(event) {
      event.preventDefault();

      const fields = new FormData(form);
      const name = String(fields.get('name') ?? '').trim();
      const phone = String(fields.get('phone') ?? '').trim();
      const email = String(fields.get('email') ?? '').trim();
      const message = String(fields.get('message') ?? '').trim();

      // A filled honeypot means a bot. Show the success line rather than an
      // error so it learns nothing from the difference.
      if (String(fields.get('website') ?? '').trim()) {
        form.reset();
        showStatus(MESSAGES.success, true);
        return;
      }

      if (
        !name ||
        !message ||
        !hasEnoughDigits(phone) ||
        !EMAIL_PATTERN.test(email)
      ) {
        showStatus(MESSAGES.validation, false);
        return;
      }

      const text = [
        'გამარჯობა! მაქვს შეკითხვა გლდანი იუნაითედ აკადემიის შესახებ.',
        '',
        `სახელი და გვარი: ${name}`,
        `ტელეფონი: ${phone}`,
        `ელფოსტა: ${email}`,
        '',
        `შეკითხვა: ${message}`,
      ].join('\n');

      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

      if (buttonLabel) buttonLabel.textContent = MESSAGES.opening;

      // A new tab keeps the contact page open behind WhatsApp. Popup
      // blockers can still refuse it even inside a click-driven submit, so
      // fall back to telling the visitor how to reach us.
      const opened = window.open(url, '_blank', 'noopener,noreferrer');

      if (buttonLabel) buttonLabel.textContent = originalLabel;

      if (opened) {
        form.reset();
        showStatus(MESSAGES.success, true);
      } else {
        showStatus(MESSAGES.blocked, false);
      }
    }

    form.addEventListener('submit', handleSubmit);

    return () => {
      form.removeEventListener('submit', handleSubmit);
      honeypot.remove();
      status.remove();
    };
  }, []);

  return null;
}
