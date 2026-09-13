/**
 * Turns a Georgian title into a Latin URL segment.
 *
 * Shared by the events and programmes tables so the two cannot produce
 * different URLs from the same headline. A slug is a URL, and a URL that
 * depends on which module happened to build it is a bug waiting for the first
 * person who moves a row between tables.
 *
 * ## Why transliterate rather than keep the Georgian
 *
 * A Georgian slug is perfectly valid in a URL -- browsers percent-encode it on
 * the wire and display it decoded -- and it reads natively to the audience.
 * That is what this site shipped first. It was changed for one practical
 * reason: sharing.
 *
 * Georgian is three bytes per character in UTF-8, so a 26-character headline
 * becomes roughly 120 bytes once encoded. Facebook, WhatsApp, Viber and SMS
 * routinely paste the encoded form, which turns a link a parent wanted to share
 * into a wall of hex. Analytics have the same problem: Search Console and GA
 * report the encoded path, so nobody can tell which post is which. Since most
 * of this site's traffic arrives through exactly those channels, the cost of
 * native slugs falls on the people the site is for.
 *
 * Latin slugs keep the keyword match a search engine reads, stay short enough
 * to survive a paste, and stay legible in a report. What is lost is that the
 * slug is no longer native Georgian -- but almost nobody reads a slug, and the
 * headline in the search result is Georgian either way.
 *
 * ## The transliteration
 *
 * Follows the Georgian national system (the romanisation used on road signs
 * and in passports), which is the one a Georgian reader recognises on sight.
 * It is a straight letter-for-letter map: Georgian has no case, no ligatures
 * and no context-dependent forms, so nothing here needs to look at neighbours.
 *
 * The three archaic letters that survive in older texts are included, because
 * dropping a letter silently is worse than romanising one that rarely appears.
 */

/**
 * Georgian letter -> Latin, per the national romanisation system.
 *
 * Digraphs are deliberate where the system uses them (ch, gh, kh, sh, ts, dz,
 * zh). They make a longer slug than single letters would, but they are what
 * makes the result readable back as the original word.
 */
const GEORGIAN_TO_LATIN = {
  ა: 'a',
  ბ: 'b',
  გ: 'g',
  დ: 'd',
  ე: 'e',
  ვ: 'v',
  ზ: 'z',
  თ: 't',
  ი: 'i',
  კ: 'k',
  ლ: 'l',
  მ: 'm',
  ნ: 'n',
  ო: 'o',
  პ: 'p',
  ჟ: 'zh',
  რ: 'r',
  ს: 's',
  ტ: 't',
  უ: 'u',
  ფ: 'p',
  ქ: 'k',
  ღ: 'gh',
  ყ: 'q',
  შ: 'sh',
  ჩ: 'ch',
  ც: 'ts',
  ძ: 'dz',
  წ: 'ts',
  ჭ: 'ch',
  ხ: 'kh',
  ჯ: 'j',
  ჰ: 'h',
  // Archaic letters, kept so an older spelling still romanises rather than
  // losing a character without trace.
  ჱ: 'e',
  ჲ: 'i',
  ჳ: 'vi',
  ჴ: 'qh',
  ჵ: 'o',
  ჶ: 'f',
};

/**
 * Replaces every Georgian character with its Latin equivalent.
 *
 * Characters outside the table are passed through untouched, so a headline
 * mixing Georgian with a Latin word or a number survives intact and the
 * character class in `slugify` decides what to do with the rest.
 */
export function transliterate(text) {
  let out = '';
  for (const char of String(text ?? '')) {
    out += GEORGIAN_TO_LATIN[char] ?? char;
  }
  return out;
}

/**
 * Builds a URL segment from a title.
 *
 * `fallbackPrefix` names what the row is when a title romanises to nothing --
 * a headline of pure punctuation, or of characters outside both alphabets.
 * That would otherwise produce an empty segment and an unreachable page, so a
 * timestamped fallback is used rather than refusing the save.
 *
 * The 120-character cap is well under the column's 160, leaving room for the
 * `-2` suffix `uniqueSlug` may add. Transliteration lengthens a string --
 * `შ` becomes `sh` -- so the cap is applied after it, not before.
 */
export function slugify(title, fallbackPrefix = 'post') {
  const base = transliterate(String(title ?? '').trim().toLowerCase())
    // Anything that is not a Latin letter, a digit, a space or a hyphen goes.
    // Deliberately narrower than \p{L}: after transliteration, a letter that is
    // still non-ASCII is one this table does not cover, and it has no business
    // in a slug whose whole point is surviving a paste into a chat app.
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
    // The slice can land on a hyphen, which would leave a segment ending in one.
    .replace(/-+$/, '');

  return base === '' ? `${fallbackPrefix}-${Date.now()}` : base;
}
