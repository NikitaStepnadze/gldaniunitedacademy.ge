import 'server-only';

/**
 * Applies CMS overrides to the theme's static markup.
 *
 * The theme HTML is the source of truth for layout and for the original
 * Georgian copy. A content row only takes effect when an admin has actually
 * typed something into it -- an empty value leaves the markup untouched. That
 * way the database never has to hold a duplicate of the shipped copy, and the
 * two cannot drift apart.
 *
 * Elements opt in by carrying `data-cms="some.key"`. Only their text content is
 * replaced; attributes, nested markup and the surrounding structure are left
 * exactly as the theme wrote them.
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
 * Replaces the inner text of every `data-cms` element that has an override.
 *
 * Matching is done with a regex rather than a DOM parse deliberately: the
 * markup is a 130KB trusted string that renders on every request, and parsing
 * it per request would cost far more than a targeted substitution.
 */
export function applyContent(markup, contentMap) {
  if (!contentMap || Object.keys(contentMap).length === 0) return markup;

  return markup.replace(
    /(<([a-z0-9]+)([^>]*\sdata-cms="([^"]+)"[^>]*)>)([\s\S]*?)(<\/\2>)/gi,
    (match, openTag, _tag, _attrs, key, inner, closeTag) => {
      const override = contentMap[key];
      if (override === undefined) return match;
      return `${openTag}${escapeHtml(override)}${closeTag}`;
    }
  );
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
