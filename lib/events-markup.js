/**
 * Builds the card markup the theme expects for an admin-created entry.
 *
 * Two layouts, both of them the theme's own. The schedule card
 * (`.widget-event .item`) carries a photo, three meta lines and a price panel;
 * it appears in the home page's events section and at the top of /news. The
 * news card (`.entry-item`) carries a photo, a tag, a headline and a byline;
 * it is what the rest of /news lists.
 *
 * Both are generated here rather than written into the page HTML, which is the
 * change that makes them editable: the two schedule cards and the four news
 * posts used to be markup in content/pages/index.html, so adding a seventh
 * meant a deploy.
 *
 * The markup is produced as a string because that is what the rest of this site
 * renders: pages are theme HTML injected with dangerouslySetInnerHTML, and a
 * React component tree here would have to be spliced into the middle of one.
 * Every interpolated value is escaped on the way in -- an admin's headline is
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

/** The photo shown for an entry whose image field is empty or unsafe. */
export const DEFAULT_EVENT_IMAGE = '/images/evtent/event4.jpg';

function imageFor(event) {
  const value = String(event.image ?? '').trim();
  return value !== '' && isSafeImageSrc(value) ? value : DEFAULT_EVENT_IMAGE;
}

/** The public URL of one entry's own page. */
export function eventHref(event) {
  return `/news/${encodeURIComponent(event.slug)}`;
}

/*
 * The three meta icons, lifted verbatim from the theme's own event card.
 *
 * Inline rather than sprited because that is how the theme ships them, and
 * because the fill colour is baked into the path: an <img> or a sprite would
 * lose it against the card's dark plate.
 */
const ICON_LOCATION = `<svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0.5C6.81273 0.502481 4.71575 1.37247 3.16911 2.91911C1.62247 4.46575 0.752481 6.56273 0.75 8.75C0.75 15.8094 8.25 21.1409 8.56969 21.3641C8.69579 21.4524 8.84603 21.4998 9 21.4998C9.15397 21.4998 9.30421 21.4524 9.43031 21.3641C9.75 21.1409 17.25 15.8094 17.25 8.75C17.2475 6.56273 16.3775 4.46575 14.8309 2.91911C13.2843 1.37247 11.1873 0.502481 9 0.5ZM9 5.75C9.59334 5.75 10.1734 5.92595 10.6667 6.25559C11.1601 6.58524 11.5446 7.05377 11.7716 7.60195C11.9987 8.15013 12.0581 8.75333 11.9424 9.33527C11.8266 9.91721 11.5409 10.4518 11.1213 10.8713C10.7018 11.2909 10.1672 11.5766 9.58527 11.6924C9.00333 11.8081 8.40013 11.7487 7.85195 11.5216C7.30377 11.2946 6.83524 10.9101 6.50559 10.4167C6.17595 9.92336 6 9.34334 6 8.75C6 7.95435 6.31607 7.19129 6.87868 6.62868C7.44129 6.06607 8.20435 5.75 9 5.75Z" fill="#C3E92D" /></svg>`;

const ICON_DATE = `<svg width="18" height="20" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 2H14.25V1.25C14.25 1.05109 14.171 0.860322 14.0303 0.71967C13.8897 0.579018 13.6989 0.5 13.5 0.5C13.3011 0.5 13.1103 0.579018 12.9697 0.71967C12.829 0.860322 12.75 1.05109 12.75 1.25V2H5.25V1.25C5.25 1.05109 5.17098 0.860322 5.03033 0.71967C4.88968 0.579018 4.69891 0.5 4.5 0.5C4.30109 0.5 4.11032 0.579018 3.96967 0.71967C3.82902 0.860322 3.75 1.05109 3.75 1.25V2H1.5C1.10218 2 0.720644 2.15804 0.43934 2.43934C0.158035 2.72064 0 3.10218 0 3.5V18.5C0 18.8978 0.158035 19.2794 0.43934 19.5607C0.720644 19.842 1.10218 20 1.5 20H16.5C16.8978 20 17.2794 19.842 17.5607 19.5607C17.842 19.2794 18 18.8978 18 18.5V3.5C18 3.10218 17.842 2.72064 17.5607 2.43934C17.2794 2.15804 16.8978 2 16.5 2ZM16.5 6.5H1.5V3.5H3.75V4.25C3.75 4.44891 3.82902 4.63968 3.96967 4.78033C4.11032 4.92098 4.30109 5 4.5 5C4.69891 5 4.88968 4.92098 5.03033 4.78033C5.17098 4.63968 5.25 4.44891 5.25 4.25V3.5H12.75V4.25C12.75 4.44891 12.829 4.63968 12.9697 4.78033C13.1103 4.92098 13.3011 5 13.5 5C13.6989 5 13.8897 4.92098 14.0303 4.78033C14.171 4.63968 14.25 4.44891 14.25 4.25V3.5H16.5V6.5Z" fill="#C3E92D" /></svg>`;

const ICON_TIME = `<svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3.75C7.21997 3.75 5.47991 4.27784 3.99987 5.26677C2.51983 6.25571 1.36628 7.66131 0.685088 9.30585C0.00389957 10.9504 -0.17433 12.76 0.172937 14.5058C0.520204 16.2516 1.37737 17.8553 2.63604 19.114C3.89472 20.3726 5.49836 21.2298 7.24419 21.5771C8.99002 21.9243 10.7996 21.7461 12.4442 21.0649C14.0887 20.3837 15.4943 19.2302 16.4832 17.7501C17.4722 16.2701 18 14.53 18 12.75C17.9973 10.3639 17.0482 8.07629 15.361 6.38905C13.6737 4.70182 11.3861 3.75273 9 3.75ZM13.2806 9.53063L9.53063 13.2806C9.46095 13.3503 9.37822 13.4056 9.28718 13.4433C9.19613 13.481 9.09855 13.5004 9 13.5004C8.90146 13.5004 8.80388 13.481 8.71283 13.4433C8.62179 13.4056 8.53906 13.3503 8.46938 13.2806C8.3997 13.2109 8.34442 13.1282 8.30671 13.0372C8.269 12.9461 8.24959 12.8485 8.24959 12.75C8.24959 12.6515 8.269 12.5539 8.30671 12.4628C8.34442 12.3718 8.3997 12.2891 8.46938 12.2194L12.2194 8.46938C12.2891 8.39969 12.3718 8.34442 12.4628 8.30671C12.5539 8.26899 12.6515 8.24958 12.75 8.24958C12.8486 8.24958 12.9461 8.26899 13.0372 8.30671C13.1282 8.34442 13.2109 8.39969 13.2806 8.46938C13.3503 8.53906 13.4056 8.62178 13.4433 8.71283C13.481 8.80387 13.5004 8.90145 13.5004 9C13.5004 9.09855 13.481 9.19613 13.4433 9.28717C13.4056 9.37822 13.3503 9.46094 13.2806 9.53063ZM6 1.5C6 1.30109 6.07902 1.11032 6.21967 0.96967C6.36033 0.829018 6.55109 0.75 6.75 0.75H11.25C11.4489 0.75 11.6397 0.829018 11.7803 0.96967C11.921 1.11032 12 1.30109 12 1.5C12 1.69891 11.921 1.88968 11.7803 2.03033C11.6397 2.17098 11.4489 2.25 11.25 2.25H6.75C6.55109 2.25 6.36033 2.17098 6.21967 2.03033C6.07902 1.88968 6 1.69891 6 1.5Z" fill="#C3E92D" /></svg>`;

/**
 * One meta line, or nothing at all when the admin left the field empty.
 *
 * Omitting the whole <p> rather than printing a bare icon matters: an entry
 * with no time set should read as a card with two lines, not as one with a
 * dangling clock pointing at nothing.
 */
function metaLine(icon, value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  return `
                            <p>
                                <span>${icon}</span>
                                ${esc(text)}
                            </p>`;
}

/**
 * The price block on the right of the card.
 *
 * Both halves are optional and the whole block is dropped when neither is set,
 * so an entry that is not about a price does not carry an empty black panel.
 */
function priceBlock(event, ctaLabel, href) {
  const label = String(event.priceLabel ?? '').trim();
  const value = String(event.priceValue ?? '').trim();

  return `
                    <div class="tf-info-price">
                        ${label === '' ? '' : `<h4>${esc(label)}</h4>`}
                        ${value === '' ? '' : `<p class="price"><span>${esc(value)}</span></p>`}
                        <a href="${esc(href)}" class="flat-button ">${esc(ctaLabel)}</a>
                        <div class="item-event-price-bg">
                        </div>
                    </div>`;
}

/** The label on an entry's own button when the admin left the field empty. */
export const DEFAULT_CTA_LABEL = 'გაიგე მეტი';

/**
 * One event card.
 *
 * The headline and the button both link to the entry's own page rather than to
 * /contact as the original markup did. That is the change that makes these
 * pages worth having: every card is now a crawlable link into a page of its
 * own instead of four links pointing at the same contact form.
 */
export function renderEventCard(event) {
  const href = eventHref(event);
  const ctaLabel = String(event.ctaLabel ?? '').trim() || DEFAULT_CTA_LABEL;

  return `
                <div class="item wow fadeInUp animated">
                    <div class="event-infomation">
                        <div class="info">
                            <h4><a href="${esc(href)}">${esc(event.title)}</a></h4>${metaLine(ICON_LOCATION, event.location)}${metaLine(ICON_DATE, event.date)}${metaLine(ICON_TIME, event.time)}
                        </div>
                        <img decoding="async" src="${esc(imageFor(event))}" alt="${esc(event.title)}">
                    </div>${priceBlock(event, ctaLabel, href)}
                    <div class="bg-item-event-2"></div>
                </div>`;
}

/** A run of cards, for whichever list is asking. */
export function renderEventCards(events) {
  return events.map(renderEventCard).join('\n');
}

/**
 * Turns an entry's body into paragraphs.
 *
 * The body is stored as plain text with a blank line between paragraphs --
 * what an admin types into a textarea -- so this is the whole of the
 * formatting: split on blank lines, escape, wrap. Single newlines inside a
 * paragraph become <br> so a deliberately short line survives.
 *
 * Deliberately not a markdown renderer. The admin panel offers no formatting
 * controls, so accepting markup here would only widen what an untrusted paste
 * can do without giving the admin anything they asked for.
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

export { esc as escapeHtml, imageFor as eventImage };

/* ---------------------------------------------------------------------------
 * News cards
 *
 * The other card the theme ships: photo, a tag pill, the headline, a byline and
 * a "read more" link. These were four hardcoded articles in the home page's
 * blog section; that section has moved to /news, and these are what it lists.
 * ------------------------------------------------------------------------ */

/** The photo shown for a news entry whose image field is empty or unsafe. */
export const DEFAULT_NEWS_IMAGE = '/images/blog/post-widget1.jpg';

function newsImageFor(event) {
  const value = String(event.image ?? '').trim();
  return value !== '' && isSafeImageSrc(value) ? value : DEFAULT_NEWS_IMAGE;
}

/** The label on a news card's link when the admin left the field empty. */
export const DEFAULT_NEWS_CTA = 'დეტალურად';

/**
 * One news card.
 *
 * `variant` picks between the theme's two blog layouts. 'left' is the large
 * feature article the theme puts in the left column; 'item' is the compact row
 * used in the right column. They differ in class names and in nothing else, so
 * both come out of one function rather than two that would drift.
 *
 * The tag, the byline and the date are each dropped when empty rather than
 * printed blank -- an entry with no tag should carry no pill.
 */
export function renderNewsCard(event, variant = 'item') {
  const href = eventHref(event);
  const ctaLabel = String(event.ctaLabel ?? '').trim() || DEFAULT_NEWS_CTA;
  const tag = String(event.tag ?? '').trim();
  const author = String(event.author ?? '').trim();
  const date = String(event.date ?? '').trim();

  const isFeature = variant === 'left';
  const articleClass = isFeature
    ? 'entry-widget-blog format-standard wow fadeInLeft animated'
    : 'entry-item format-standard';
  // The theme only animates the compact cards; the feature article animates as
  // a whole, so repeating the class on its children would double the effect.
  const anim = isFeature ? '' : ' wow fadeInUp animated';

  const meta = [
    author === '' ? '' : `<span class="author line">${esc(author)}</span>`,
    date === '' ? '' : `<span class="date line">${esc(date)}</span>`,
  ]
    .filter((part) => part !== '')
    .join('\n                                    ');

  return `
                        <article class="${articleClass}">
                            <div class="feature-post">
                                <img src="${esc(newsImageFor(event))}" alt="${esc(event.title)}">
                            </div><!-- /.feature-post -->
                            <div class="main-post">
                                ${
                                  tag === ''
                                    ? ''
                                    : `<div class="tag${anim}">
                                    <ul>
                                        <li><a href="/news">${esc(tag)}</a></li>
                                    </ul>
                                </div>`
                                }
                                <h2 class="entry-title${anim}"><a href="${esc(href)}">${esc(event.title)}</a></h2>
                                ${
                                  meta === ''
                                    ? ''
                                    : `<div class="entry-meta${anim}">
                                    ${meta}
                                </div>`
                                }
                                <a class="more-link${anim}" href="${esc(href)}">${esc(ctaLabel)}</a>
                            </div><!-- /.main-post -->
                        </article>`;
}

/**
 * The whole news listing, in the theme's two-column blog layout.
 *
 * The first entry takes the left column as the feature article and the rest
 * stack in the right, which is exactly what the home page's blog section did
 * with its four posts. Above four the right column simply grows -- the theme's
 * own rules stack them, so a tenth entry needs no new layout.
 *
 * With a single entry the left column is the whole of it and the right column
 * is omitted, rather than left as an empty half-width gap.
 */
export function renderNewsList(events) {
  if (events.length === 0) return '';

  const [feature, ...rest] = events;

  const left = `
                    <div class="col-md-12 col-lg-6 col-xl-6 col-xxl-6 widget-blog-left">${renderNewsCard(
                      feature,
                      'left'
                    )}
                    </div>`;

  if (rest.length === 0) return left;

  const right = `
                    <div class="col-md-12 col-lg-6 col-xl-6 col-xxl-6 widget-blog-right">${rest
                      .map((event) => renderNewsCard(event, 'item'))
                      .join('')}
                    </div>`;

  return `${left}${right}`;
}

/* ---------------------------------------------------------------------------
 * The entry's own page
 *
 * Each entry gets a URL of its own at /news/<slug>. That is what the whole
 * table is for: a crawler that finds /news finds one indexable page per entry
 * behind it, where before there was a single home page whose cards all linked
 * to the contact form.
 * ------------------------------------------------------------------------ */

/** A fact row in the entry page's sidebar, dropped when the field is empty. */
function factRow(icon, label, value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  return `
                        <div class="news-entry-fact">
                            <span class="news-entry-fact-icon">${icon}</span>
                            <div>
                                <span class="news-entry-fact-label">${esc(label)}</span>
                                <p>${esc(text)}</p>
                            </div>
                        </div>`;
}

/**
 * The sidebar of one entry page.
 *
 * A schedule entry shows where, when and what it costs; a news post usually
 * has only a date. Both go through the same builder, and each row disappears
 * when its field is empty, so the two kinds need no separate template -- a
 * news post simply ends up with a shorter card.
 *
 * The whole aside collapses to nothing when no field is set, which is what
 * stops an entry that is purely an article from carrying an empty panel.
 */
function factsBlock(event) {
  const rows = [
    factRow(ICON_LOCATION, 'ადგილი', event.location),
    factRow(ICON_DATE, 'თარიღი', event.date),
    factRow(ICON_TIME, 'დრო', event.time),
    factRow(
      ICON_DATE,
      String(event.priceLabel ?? '').trim() || 'მონაწილეობა',
      event.priceValue
    ),
  ].filter((row) => row !== '');

  if (rows.length === 0) return '';
  return `<div class="news-entry-facts">${rows.join('')}
                    </div>`;
}

/** The entry's lead paragraph, or nothing when it has no excerpt. */
function leadBlock(event) {
  const text = String(event.excerpt ?? '').trim();
  if (text === '') return '';
  return `<p class="news-entry-lead">${esc(text)}</p>`;
}

/**
 * Fills the `<!--entry:*-->` placeholders in content/pages/news-single.html.
 *
 * The template is one page of theme markup shared by every entry, so the
 * header, footer and layout come from the same file the rest of the site uses
 * and cannot drift from it. Only the per-entry values are substituted.
 *
 * Every placeholder is replaced globally: the title appears three times (the
 * heading, the breadcrumb and the photo's alt text), and a single-shot replace
 * would leave two of them showing the raw comment.
 */
export function renderEntryPage(markup, event) {
  const body = renderBodyParagraphs(event.body);

  const values = {
    title: esc(event.title),
    image: esc(event.kind === 'event' ? imageFor(event) : newsImageFor(event)),
    lead: leadBlock(event),
    // An entry with no body still renders its lead and its facts rather than an
    // empty column, so nothing is substituted in place of the missing text.
    body,
    facts: factsBlock(event),
    cta: esc(String(event.ctaLabel ?? '').trim() || DEFAULT_CTA_LABEL),
  };

  let out = markup;
  for (const [name, value] of Object.entries(values)) {
    out = out.replaceAll(`<!--entry:${name}-->`, value);
  }
  return out;
}
