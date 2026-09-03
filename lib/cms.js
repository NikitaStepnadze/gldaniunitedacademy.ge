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
