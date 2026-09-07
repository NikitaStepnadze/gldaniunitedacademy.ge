/**
 * Applies CMS overrides to the theme's static markup.
 *
 * The theme HTML is the source of truth for layout and for the original
 * Georgian copy. A content row only takes effect when an admin has actually
 * typed something into it -- an empty value leaves the markup untouched. That
 * way the database never has to hold a duplicate of the shipped copy, and the
 * two cannot drift apart.
 *
 * Elements opt in three ways:
 *  - `data-cms="some.key"` replaces the element's text content.
 *  - `data-cms-img="some.key"` replaces an <img>'s `src` attribute.
 *  - `data-cms-attr="attr:some.key"` replaces the value of `attr` on the
 *    element. For a plain text override this is redundant with `data-cms`,
 *    but a few elements (the animated counters) carry the same number in an
 *    attribute a script reads on load, so the attribute has to move with it.
 *
 * In both cases everything else the theme wrote -- attributes, classes, nested
 * markup, surrounding structure -- is left exactly as it was.
 *
 * This module is imported by the public pages (server-side) and by the admin
 * preview route, so it deliberately has no 'server-only' marker and no
 * Appwrite dependency: it is a pure string transform.
 */

/** Escapes text so an admin's input cannot inject markup into the page. */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escapes a value destined for a double-quoted attribute.
 *
 * Narrower than escapeHtml: `<` and `>` are harmless inside an attribute, but
 * a bare `"` would end the attribute early and let the rest of the value be
 * parsed as further attributes.
 */
function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * True when a string is safe to use as an <img src>.
 *
 * Only same-origin paths and https URLs are allowed. This blocks `javascript:`
 * and `data:` URLs, which would otherwise be a stored-XSS vector through the
 * admin panel -- the admin is trusted, but a single compromised session should
 * not be able to plant script that runs for every visitor.
 */
function isSafeImageSrc(value) {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  return /^https:\/\//i.test(value);
}

/**
 * Replaces the inner text of every `data-cms` element that has an override.
 *
 * Matching is done with a regex rather than a DOM parse deliberately: the
 * markup is a 130KB trusted string that renders on every request, and parsing
 * it per request would cost far more than a targeted substitution.
 *
 * The inner group is non-greedy and the closing tag is matched by backreference
 * to the opening tag's name, so an element containing a nested tag of a
 * *different* name still matches correctly. Marked elements are leaf text nodes
 * in this theme -- headings, spans, paragraphs, buttons -- so that is enough.
 */
function applyText(markup, contentMap) {
  return markup.replace(
    /(<([a-z0-9]+)([^>]*\sdata-cms="([^"]+)"[^>]*)>)([\s\S]*?)(<\/\2>)/gi,
    (match, openTag, _tag, _attrs, key, _inner, closeTag) => {
      const override = contentMap[key];
      if (override === undefined) return match;
      return `${openTag}${escapeHtml(override)}${closeTag}`;
    }
  );
}

/**
 * Points every `data-cms-img` element at its overridden image.
 *
 * Rewrites the element's existing `src` in place rather than rebuilding the
 * tag, so `class`, `alt`, `width`, `loading` and the rest survive untouched.
 * An <img> whose override is missing, empty or unsafe keeps the theme's own
 * image -- a bad value must never leave a visitor with a broken picture.
 *
 * `srcset` is stripped when an override applies: the theme's srcset would still
 * point at the original file and the browser would prefer it over our new src.
 */
function applyImages(markup, contentMap) {
  return markup.replace(
    /<img\b[^>]*\sdata-cms-img="([^"]+)"[^>]*>/gi,
    (tag, key) => {
      const override = contentMap[key];
      if (typeof override !== 'string') return tag;

      const value = override.trim();
      if (value === '' || !isSafeImageSrc(value)) return tag;

      const withoutSrcset = tag.replace(/\ssrcset="[^"]*"/gi, '');

      if (/\ssrc="/i.test(withoutSrcset)) {
        return withoutSrcset.replace(/(\ssrc=")[^"]*(")/i, `$1${escapeAttr(value)}$2`);
      }

      // No src at all (a lazy-loaded placeholder): add one.
      return withoutSrcset.replace(/^<img\b/i, `<img src="${escapeAttr(value)}"`);
    }
  );
}

/**
 * Rewrites the named attribute of every `data-cms-attr` element that has an
 * override.
 *
 * `data-cms-attr` holds `"attr:key"`, not just `key`: unlike `data-cms-img`,
 * which attribute to touch is not implied by the marker, so it travels with
 * it. Matching is scoped to the opening tag only -- these markers exist to
 * update a bare attribute, not to imply anything about the element's content.
 */
function applyAttrs(markup, contentMap) {
  return markup.replace(
    /<([a-z0-9]+)\b([^>]*)\sdata-cms-attr="([a-zA-Z-]+):([^"]+)"([^>]*)>/gi,
    (tag, tagName, before, attr, key, after) => {
      const override = contentMap[key];
      if (override === undefined) return tag;

      const rest = `${before}${after}`;
      const value = escapeAttr(override);
      const attrPattern = new RegExp(`\\s${attr}="[^"]*"`, 'i');

      const rewritten = attrPattern.test(rest)
        ? rest.replace(attrPattern, ` ${attr}="${value}"`)
        : `${rest} ${attr}="${value}"`;

      return `<${tagName}${rewritten} data-cms-attr="${attr}:${key}">`;
    }
  );
}

/**
 * Applies text, image and attribute overrides to a page's markup.
 *
 * Exported under the original name so the existing callers keep working.
 */
export function applyContent(markup, contentMap) {
  if (!contentMap || Object.keys(contentMap).length === 0) return markup;
  return applyAttrs(applyImages(applyText(markup, contentMap), contentMap), contentMap);
}

/**
 * Builds a <style> block overriding the theme's colour variables.
 *
 * Emitted after the theme's stylesheets so it wins on specificity without
 * needing !important. Only keys that look like a hex colour are used -- the
 * admin form validates too, but this is the last gate before the value lands
 * in CSS.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

export function buildColorOverrides(settingsMap) {
  const declarations = [];

  for (const [key, value] of Object.entries(settingsMap ?? {})) {
    if (!key.startsWith('color.')) continue;
    if (!HEX.test(value)) continue;
    declarations.push(`--${key.slice('color.'.length)}:${value}`);
  }

  if (declarations.length === 0) return null;
  return `:root{${declarations.join(';')}}`;
}

/**
 * A conservative address shape, used to gate the `mailto:` rewrite.
 *
 * Deliberately stricter than the RFC: this is not validating an address so
 * much as refusing anything that could be a scheme, a quote or markup once it
 * lands inside an href.
 */
const EMAIL = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[a-z]{2,}$/i;

/**
 * The contact details the theme markup ships with.
 *
 * These are the exact strings written into content/pages/*.html, so they are
 * what a settings override has to replace. Kept here rather than read from the
 * markup because a substitution needs a fixed needle: once the first override
 * has been applied the markup no longer contains the original.
 *
 * `display` is how the value is written as visible text, `href` how it appears
 * inside the link that wraps it. The address has no href entry on purpose --
 * its link points at a Google Maps URL that no admin field can regenerate, so
 * only the text is overridden and the pin is left where it is.
 */
const CONTACT_DEFAULTS = {
  email: { display: 'gldani.united@gmail.com', href: 'mailto:gldani.united@gmail.com' },
  phone: { display: '551 39 09 93', href: 'tel:+995551390993' },
  address: { display: 'გლდანი 1 მიკრორაიონი, 39 საჯარო სკოლის ტერიტორია' },
};

/**
 * Turns an admin-entered phone number into a `tel:` target.
 *
 * Georgian numbers are typed with spaces ("551 39 09 93") and usually without
 * the country code, but `tel:` needs neither. Everything that is not a digit or
 * a leading `+` is stripped, and a bare 9-digit local number is given the +995
 * prefix -- otherwise a tap on mobile dials nothing.
 */
function toTelHref(value) {
  const trimmed = value.trim();
  const kept = (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
  if (kept.startsWith('+')) return `tel:${kept}`;
  if (kept.length === 9) return `tel:+995${kept}`;
  return `tel:${kept}`;
}

/**
 * Replaces the theme's hardcoded contact details with the admin's values.
 *
 * The phone, email and address are not `data-cms` markers: they appear more
 * than twenty times across the four pages -- header, footer, contact cards,
 * the registration sidebar -- and marking every one of them would mean an
 * admin editing the same number in a dozen fields. They are a single setting
 * each instead, substituted everywhere at render time.
 *
 * Both the visible text and the `mailto:` / `tel:` href are rewritten, so a
 * changed number is also the number that gets dialled. An empty setting means
 * "keep what the theme says", matching how content overrides behave.
 */
export function applyContactSettings(markup, settingsMap) {
  const settings = settingsMap ?? {};
  let out = markup;

  const email = (settings['contact.email'] ?? '').trim();
  if (email !== '') {
    /*
     * The href has to be settled before the visible text, and not only for
     * ordering's sake: the theme writes the same address in both places, so
     * `mailto:x@y` *contains* the display needle. Replacing the text first
     * would rewrite the inside of every href as a side effect -- including the
     * ones deliberately left alone below -- and produce `mailto:` targets that
     * were never validated.
     *
     * The visible text is written whatever the value looks like; worst case an
     * admin sees their own typo on the page. The href is rewritten only for
     * something that really is an address, because a value carrying a scheme or
     * a quote would otherwise turn every contact link on the site into a target
     * the admin did not intend.
     */
    // A sentinel the theme markup cannot contain and no admin value can
    // produce, so neither the text pass below nor the page itself can collide
    // with it, and it always gets substituted back out.
    const placeholder = '{{cms:email-href}}';
    out = out.replaceAll(CONTACT_DEFAULTS.email.href, placeholder);
    out = out.replaceAll(CONTACT_DEFAULTS.email.display, escapeHtml(email));
    out = out.replaceAll(
      placeholder,
      EMAIL.test(email) ? `mailto:${email}` : CONTACT_DEFAULTS.email.href
    );
  }

  const phone = (settings['contact.phone'] ?? '').trim();
  if (phone !== '') {
    // toTelHref keeps only digits and a leading +, so its result is safe in an
    // attribute by construction. The length check is about usefulness rather
    // than safety: a value that boils down to a digit or two is a typo, and
    // linking it would replace a number that works with one that cannot be
    // dialled. The theme's own number stays clickable until the field holds
    // something a phone could actually call.
    const href = toTelHref(phone);
    if (href.replace(/\D/g, '').length >= 6) {
      out = out.replaceAll(CONTACT_DEFAULTS.phone.href, href);
    }
    out = out.replaceAll(CONTACT_DEFAULTS.phone.display, escapeHtml(phone));
  }

  const address = (settings['contact.address'] ?? '').trim();
  if (address !== '') {
    out = out.replaceAll(CONTACT_DEFAULTS.address.display, escapeHtml(address));
  }

  return out;
}
