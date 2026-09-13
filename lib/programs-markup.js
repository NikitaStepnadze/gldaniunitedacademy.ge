/**
 * Builds the programme-card markup the theme expects.
 *
 * The cards in the home page's programmes section and the cards on /programs
 * are the same component -- the theme's `.course-item-wrap` -- so they are
 * generated here once rather than written out twice and left to drift. The two
 * pages differ only in how many cards they ask for and what wraps them.
 *
 * The markup is produced as a string because that is what the rest of this site
 * renders: pages are theme HTML injected with dangerouslySetInnerHTML, and a
 * React component tree here would have to be spliced into the middle of one.
 * Every interpolated value is escaped on the way in -- an admin's title is
 * text, never markup, so a pasted `<script>` lands on the page as visible
 * characters rather than as script.
 *
 * No 'server-only' marker: this is a pure string transform, and the admin
 * preview route imports it on the same terms lib/cms.js is imported.
 */

/** Escapes text so an admin's input cannot inject markup into the page. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * True when a string is safe to use as an <img src>.
 *
 * Same rule as lib/cms.js: same-origin paths and https URLs only, so a
 * `javascript:` or `data:` value stored in the row cannot become script on the
 * public page.
 */
function isSafeImageSrc(value) {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  return /^https:\/\//i.test(value);
}

/**
 * The theme's own card photos, used in order for programmes that have none.
 *
 * A card is a photo with text under it, so an empty frame reads as a broken
 * page rather than as a deliberate omission. These are the three files the
 * static markup shipped with, so a site that has uploaded nothing looks exactly
 * as it did before this table existed.
 */
const FALLBACK_IMAGES = [
  '/images/retinal/tutorial1.jpg',
  '/images/retinal/tutorial2.jpg',
  '/images/retinal/tutorial3.jpg',
];

/** The photo one card shows: the admin's, or a theme default by position. */
export function programImage(program, index = 0) {
  const value = String(program?.image ?? '').trim();
  if (value !== '' && isSafeImageSrc(value)) return value;
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

/** The public URL of one programme's own page. */
export function programHref(program) {
  return `/programs/${encodeURIComponent(program.slug)}`;
}

/*
 * The two meta icons, lifted verbatim from the theme's own programme card.
 *
 * Inline rather than sprited because that is how the theme ships them. Each
 * carries a `clipPath` whose id the theme hardcoded -- fine when the markup
 * appeared three times in one static file, but these cards are now generated
 * per programme, and a duplicated id makes every later card clip against the
 * first one's path. The id is therefore parameterised per card; see iconFor.
 */
function iconActivity(uid) {
  return `<svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip_act_${uid})"><path d="M3.96938 13.1725C3.82899 13.032 3.75009 12.8415 3.75 12.6428V3.95312H12.4397C12.6383 3.95322 12.8288 4.03211 12.9694 4.1725L22.2806 13.4838C22.4212 13.6244 22.5001 13.8151 22.5001 14.0139C22.5001 14.2127 22.4212 14.4034 22.2806 14.5441L14.3438 22.4838C14.2031 22.6243 14.0124 22.7032 13.8136 22.7032C13.6148 22.7032 13.4241 22.6243 13.2834 22.4838L3.96938 13.1725Z" stroke="#121212" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M8.25 8.07812C8.25 8.28523 8.08211 8.45312 7.875 8.45312C7.66789 8.45312 7.5 8.28523 7.5 8.07812C7.5 7.87102 7.66789 7.70312 7.875 7.70312C8.08211 7.70312 8.25 7.87102 8.25 8.07812Z" stroke="#121212" stroke-width="1.5" /></g><defs><clipPath id="clip_act_${uid}"><rect width="24" height="24" fill="white" transform="translate(0 0.203125)" /></clipPath></defs></svg>`;
}

function iconFrequency(uid) {
  return `<svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip_freq_${uid})"><path d="M6.71063 13.7031L3 16.7031V4.70312C3 4.50421 3.07902 4.31345 3.21967 4.1728C3.36032 4.03214 3.55109 3.95312 3.75 3.95313H15.75C15.9489 3.95313 16.1397 4.03214 16.2803 4.1728C16.421 4.31345 16.5 4.50421 16.5 4.70312V12.9531C16.5 13.152 16.421 13.3428 16.2803 13.4835C16.1397 13.6241 15.9489 13.7031 15.75 13.7031H6.71063Z" stroke="#121212" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M7.5 13.7031V17.4531C7.5 17.652 7.57902 17.8428 7.71967 17.9835C7.86032 18.1241 8.05109 18.2031 8.25 18.2031H17.2894L21 21.2031V9.20312C21 9.00421 20.921 8.81345 20.7803 8.6728C20.6397 8.53214 20.4489 8.45312 20.25 8.45312H16.5" stroke="#121212" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></g><defs><clipPath id="clip_freq_${uid}"><rect width="24" height="24" fill="white" transform="translate(0 0.203125)" /></clipPath></defs></svg>`;
}

/**
 * A DOM-id-safe token derived from the row id.
 *
 * Appwrite ids are already alphanumeric, but the value ends up inside an
 * `id` attribute and a `url(#...)` reference, so anything unexpected is
 * stripped rather than trusted.
 */
function uidFor(program, index) {
  const base = String(program?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return base !== '' ? base : `p${index}`;
}

/**
 * One meta line, or nothing at all when the admin left the field empty.
 *
 * Omitting the whole link rather than printing a bare icon matters: a
 * programme with no frequency set should read as a card with one meta line,
 * not as one with a dangling icon pointing at nothing.
 */
function metaLink(href, icon, value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  return `
                                            <a href="${esc(href)}">
                                                ${icon}
                                                <span>${esc(text)}</span>
                                            </a>`;
}

/**
 * The age badge over the card photo.
 *
 * Two lines, number over unit, exactly as the static markup wrote it. Dropped
 * entirely when no age range is set, so a programme that is not age-banded --
 * a goalkeeping clinic, say -- does not carry an empty green tab.
 */
function ageBadge(program) {
  const range = String(program.ageRange ?? '').trim();
  if (range === '') return '';

  const unit = String(program.ageUnit ?? '').trim();
  return `
                                <span class="date-course"><span>${esc(range)}</span>${
                                  unit === '' ? '' : `<br>${esc(unit)}`
                                }</span>`;
}

/** The label on a card's button when the admin left the field empty. */
export const DEFAULT_CTA_LABEL = 'დეტალურად';

/**
 * One programme card.
 *
 * The photo, the title and the button all link to the programme's own page
 * rather than to /contact as the original markup did. That is the change that
 * makes these pages worth having: every card is now a crawlable link into a
 * page of its own instead of three links pointing at the same contact form.
 *
 * `index` positions the card in the row -- it picks the fallback photo and
 * drives the theme's stagger animation, which the static markup wrote by hand
 * as `data-wow-delay` on the second and third cards.
 */
export function renderProgramCard(program, index = 0) {
  const href = programHref(program);
  const uid = uidFor(program, index);
  const delay = index === 0 ? '' : ` data-wow-delay="${(index * 0.3).toFixed(1)}s"`;

  const meta = [
    metaLink(href, iconActivity(uid), program.activityLabel),
    metaLink(href, iconFrequency(uid), program.frequency),
  ].join('');

  return `
                    <div class="col-md-4 course">
                        <div class="course-item-wrap wow fadeInUp animated"${delay}>
                            <a href="${esc(href)}" class="image-course">${ageBadge(program)}
                                <img src="${esc(programImage(program, index))}" alt="${esc(program.title)}">
                            </a>
                            <div class="content-course">
                                <div class="meta-course">
                                    <ul>
                                        <li>${meta}
                                        </li>
                                    </ul>
                                </div>
                                <h5 class="title-course"><a href="${esc(href)}">${esc(program.title)}</a></h5>
                                <p class="description-course">${esc(program.description)}</p>
                            </div>
                            <a href="${esc(href)}" class="flat-button">${esc(DEFAULT_CTA_LABEL)}</a>
                        </div>
                    </div>`;
}

/** A run of cards, for whichever list is asking. */
export function renderProgramCards(programs) {
  return programs.map((program, index) => renderProgramCard(program, index)).join('\n');
}

/**
 * Turns a programme's body into paragraphs.
 *
 * The body is stored as plain text with a blank line between paragraphs --
 * what an admin types into a textarea -- so this is the whole of the
 * formatting: split on blank lines, escape, wrap. Single newlines inside a
 * paragraph become <br> so a deliberately short line survives.
 *
 * Deliberately not a markdown renderer, for the same reason as the events
 * version: the admin panel offers no formatting controls, so accepting markup
 * here would only widen what an untrusted paste can do.
 */
export function renderBodyParagraphs(body) {
  const text = String(body ?? '').trim();
  if (text === '') return '';

  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * One meta item on a programme's own page.
 *
 * Dropped entirely when the value is empty, so a programme that sets no price
 * shows two facts rather than three, one of them blank.
 */
function detailMeta(label, value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  return `
                        <li>
                            <span class="program-detail-meta-label">${esc(label)}</span>
                            <span class="program-detail-meta-value">${esc(text)}</span>
                        </li>`;
}

/**
 * The body of one programme's own page.
 *
 * Built from the same row the card is, so the page cannot describe a programme
 * differently from the card that links to it. The layout is the theme's own
 * two-column arrangement: the photo and the facts on one side, the prose on
 * the other, with the registration call to action underneath.
 *
 * The age line joins the range and its unit ("5-8 წელი") rather than stacking
 * them as the card's badge does -- on the card they are a two-line graphic, in
 * a list of facts they read as one value.
 */
export function renderProgramDetail(program) {
  const ageRange = String(program.ageRange ?? '').trim();
  const ageUnit = String(program.ageUnit ?? '').trim();
  const age = ageRange === '' ? '' : `${ageRange}${ageUnit === '' ? '' : ` ${ageUnit}`}`;

  const meta = [
    detailMeta('ასაკობრივი ჯგუფი', age),
    /*
     * Labelled "აქტივობა", not "ვარჯიში".
     *
     * The value here is itself usually the word "ვარჯიში", so naming the row
     * after it printed "ვარჯიში / ვარჯიში". The label has to say what kind of
     * fact this is, while the value says which one -- and the whole reason this
     * field exists is that the value is no longer always "training".
     */
    detailMeta('აქტივობა', program.activityLabel),
    detailMeta('სიხშირე', program.frequency),
    detailMeta(
      String(program.priceLabel ?? '').trim() || 'ღირებულება',
      program.priceValue
    ),
  ].join('');

  const description = String(program.description ?? '').trim();
  const body = renderBodyParagraphs(program.body);

  return `
                <div class="row">
                    <div class="col-md-12 col-lg-5">
                        <div class="program-detail-media wow fadeInLeft animated">
                            <img src="${esc(programImage(program))}" alt="${esc(program.title)}">
                        </div>
                        ${
                          meta === ''
                            ? ''
                            : `<ul class="program-detail-meta wow fadeInUp animated">${meta}
                        </ul>`
                        }
                    </div>
                    <div class="col-md-12 col-lg-7">
                        <div class="program-detail-content wow fadeInRight animated">
                            <h2 class="program-detail-title">${esc(program.title)}</h2>
                            ${
                              description === ''
                                ? ''
                                : `<p class="program-detail-lead">${esc(description)}</p>`
                            }
                            ${body}
                            <div class="program-detail-actions">
                                <a href="/registration" class="flat-button">რეგისტრაცია</a>
                                <a href="/programs" class="flat-button style-white">ყველა პროგრამა</a>
                            </div>
                        </div>
                    </div>
                </div>`;
}

export { esc as escapeHtml };
