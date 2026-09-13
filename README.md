# gldaniunitedacademy.ge

The Zunzo HTML template running on Next.js 15 (App Router), rendered so the
output is visually identical to the original static site.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm start   # production
```

## How it works

The original template is a jQuery/Bootstrap site: 14 HTML pages plus a set of
plugins (Swiper, Owl Carousel, WOW, Magnific Popup, PhotoSwipe, Mapbox) driven
by a single `main.js`. Rewriting that markup as JSX by hand would risk visual
drift across ~22,000 lines, so instead the markup is preserved verbatim and
served through Next.js:

- `npm run sync:html` reads `zunzo-package/zunzo/` and writes
  - `content/pages/*.html` — each page's `<body>` markup, unchanged apart from
    URL rewriting
  - `content/manifest.json` — per-page title, body class, and the exact
    stylesheet/script lists in their original order
  - `public/{images,fonts,icon,stylesheets,javascript}/` — assets copied with
    their folder layout intact, because the stylesheets reference each other
    and their fonts by relative path
- `app/layout.jsx` emits every stylesheet and script from `<head>`
- `app/ThemePage.jsx` renders a page's markup
- `app/<route>/page.jsx` is a thin wrapper per route

Only URLs are rewritten during import: `about.html` → `/about`, and relative
asset paths → root-absolute. No class, attribute, or element is altered.

### Why assets live in `<head>`, not in the page

This is the part that took the most iterations to get right; three separate
constraints all point at the same answer.

1. **React 19 hoists resources.** A `<link rel="stylesheet">` or `<script src>`
   rendered inside the page tree is treated as a hoistable resource: emitted in
   place during SSR, relocated into `<head>` on the client. That relocation is
   a hydration mismatch on every page.
2. **`<script>` cannot live inside `dangerouslySetInnerHTML`.** The obvious
   workaround — appending the script tags to the markup string — fails because
   React's client-side copy of that string drops `<script>` elements, so the
   server and client strings differ by exactly the script tags.
3. **Some scripts bind to `window`'s `load` event.** `count-down.js`,
   `main.js` and `swiper-bundle.min.js` all do. Appending them from a
   `useEffect` after mount misses that event, which silently removes the
   countdown timer from `/wishlist` and `/shop-list`.

`<head>` with `defer` satisfies all three: outside the hydrated tree, real
script elements, present while the document is still parsing. `defer` also
preserves document order, which the theme depends on — every plugin assumes
`jQuery` already exists.

The stylesheet and script lists are unions across all pages. 17 of 19 sheets
and 14 of 19 scripts were already common to every page; the page-specific
remainder are library registrations (`nouislider`, `drift`, `multiple-modal`)
or self-guarding (`zoom.js` no-ops unless `.thumbs-slider` is present), and
`photoswipe.css` / `nouislider.min.css` are fully namespaced under `.pswp` /
`.noUi-`. Each union is ordered so that every page's original sequence survives
as a subsequence, which is what the cascade and the load order depend on.

`model-viewer.min.js` and `zoom.js` are ES modules in the source; the importer
records `type="module"` so they are not loaded as classic scripts (which throws
`Unexpected token 'export'` and leaves the product gallery uninitialised).

### Why `suppressHydrationWarning`

Because the theme's scripts are deferred, jQuery, Swiper, Owl and WOW all run
*before* React hydrates, and they rewrite the page subtree as they initialise —
wrapping carousels, injecting countdown markup, adding state classes. React
would compare its server-rendered string against that already-mutated DOM and
warn on every page. The markup is static server-rendered HTML that React never
re-renders, so opting its children out of hydration checking is safe.

## Routes

| Route | Source |
| --- | --- |
| `/` | `index.html` |
| `/about` | `about.html` |
| `/contact` | `contact.html` |
| `/registration` | `registration.html` |
| `/programs` | `programs.html` |
| `/programs/[slug]` | `program-detail.html` + one row of the `programs` table |
| `/news` | `news.html` |
| `/news/[slug]` | `news-single.html` + one row of the `events` table |

The last two pairs are one template each, rendered once per database row —
adding a programme or a news entry in the admin panel adds a page, with no
deploy. See [Programmes, news and events](#programmes-news-and-events).

The template's remaining pages (shop, cart, checkout, wishlist and the
alternate home layouts) were removed — the academy has no webshop, and leaving
them routable would have exposed untranslated English. Their markup still sits
unused in `content/pages/`; to bring one back, re-add `app/<route>/page.jsx`
**and translate the page first**.

## Branding

Everything club-specific lives in one place: `public/stylesheets/colors/color1.css`.
That file is loaded last in the cascade, so it overrides the vendor
stylesheets without editing them. It holds the palette, the Georgian fonts,
and the component fixes that don't follow from the variables alone.

| | |
| --- | --- |
| Navy | `#16244f` (deep `#101a3a`, soft `#22346b`) |
| Gold | `#c9a227` (light `#e0bf55`, dark `#a5821c`) |
| Display font | *Dachi The Lynx* — `public/geofont/dachi-the-lynx.otf` |
| Body font | *BPG SuperSquare* — `public/geofont/bpg-supersquare.ttf` |

Both are local files; nothing is fetched from Google Fonts. The theme's own
Jost (18 weights) and Oswald (6) `@import`s were removed from `style.css`,
since no glyph rendered in either.

Display goes on headings, hero/banner titles and the counter numerals; the
body face covers everything else. The theme hard-codes a font family in 117
rules, many more specific than a plain element selector, so the body face is
applied with a universal selector and the display face re-applied to titles
after it. Two consequences worth knowing before editing that block:

- the universal selector excludes `i[class*="icon-"]` and pins it back to
  `icomoon`. Icon fonts map glyphs to private-use codepoints, so letting them
  inherit a text face replaces every icon with a missing-glyph box.
- ID-based theme rules (`#mainnav ul li a`) outrank a universal selector, so
  the navigation is named explicitly.

Neither face ships a bold cut, so `font-synthesis: none` is set — the browser
would otherwise fake the theme's 500/600/700 requests by smearing the strokes,
which Georgian letterforms show far more than Latin does.

The theme's own `--primary` / `--black` variables are remapped to gold and
navy, which covers ~112 of the stylesheets' declarations. Gold is reserved for
large type, fills and borders; links use the darker cut, because bright gold
on white fails contrast at body sizes.

## Editing content

`content/pages/*.html` is now the source of truth. The pages have been
translated and restructured, so **do not run `npm run sync:html`** — it
regenerates from `zunzo-package/` and would overwrite the Georgian content
with the original English template.

To migrate a page to real components, replace its `app/<route>/page.jsx` with
ordinary JSX — pages can be converted one at a time, since each is independent.

### The admin editor (`/admin/content`)

An admin edits text and photos at `/admin/content`, with a live preview of the
real page beside the fields. Typing updates the preview immediately; nothing
reaches the public site until Save.

**How a field becomes editable.** The theme HTML is the source of truth for
*which* fields exist. An element opts in by carrying a marker:

```html
<h1 class="flat-title-slider" data-cms="home.slide1.title">ფეხბურთი იწყება</h1>
<img data-cms-img="home.slide1.image" src="/gua_hero.jpg" alt="...">
```

`data-cms` makes an element's text editable; `data-cms-img` makes an `<img>`'s
`src` editable. After adding or changing markers, run:

```bash
npm run appwrite:sync-cms          # create rows for new markers
npm run appwrite:sync-cms -- --prune   # also delete rows whose marker is gone
```

That reads the markers out of `content/pages/*.html` and creates one row per
key, so the database can never drift from the markup. Rows are created **empty
on purpose**: an empty value means "use whatever the theme already says", so
seeding never duplicates the Georgian copy, and clearing a field in the admin
restores the original. Keys are numbered per occurrence (`slide1`, `slide2`,
`coach3`) so repeated components stay independently editable.

**Photos.** Uploads go to Appwrite storage and are referenced as
`/api/media/<id>`.

> Site images share the `enquiry-files` bucket, because the free Appwrite plan
> allows exactly **one bucket per project**. That is only safe because the
> bucket grants nobody any permission and the two kinds are served by different
> routes: `/api/admin/files/[id]` requires an admin session, while the public
> `/api/media/[id]` serves a file **only** if its name carries the `site__`
> prefix that `uploadSiteImage` adds. An enquiry attachment therefore 404s on
> the public route. That check in `app/api/media/[id]/route.js` is a security
> boundary, not a detail — these are children's documents.

**The preview.** `/admin-preview/<route>` renders the real page with the real
theme assets and applies the editor's draft over `postMessage`. It lives in its
own route group (`app/(preview)/`) so it gets its own `<html>`; nested under the
admin layout it produced two documents and the admin stylesheet leaked in. It
404s without an admin session and is never indexed.

## Programmes, news and events

Two kinds of content are **rows an admin creates**, not markup an admin edits:
the training programmes, and the news entries and events. They work the same
way and are worth understanding together.

The difference from `data-cms` matters. A CMS row overrides text the theme
already ships, so it can reword the third programme card but never add a
fourth — which fields exist comes from the markers written into the HTML. These
are tables instead, so an admin adds a row and the site gains a card **and a
page**, with no deploy.

| | Programmes | News and events |
| --- | --- | --- |
| Table | `programs` | `events` |
| Admin | `/admin/programs` | `/admin/news` |
| Listing | `/programs` | `/news` |
| Page per row | `/programs/<slug>` | `/news/<slug>` |
| On the home page | 3 flagged programmes | 2 flagged events |
| Data layer | `lib/appwrite/programs.js` | `lib/appwrite/events.js` |
| Card markup | `lib/programs-markup.js` | `lib/events-markup.js` |

**Why a page per row.** Every entry is a crawlable URL with its own heading,
photo, body and `<title>`. Before this, six cards on the home page all linked
to the contact form, so the site offered a crawler one page where it now offers
eight. The sitemap lists each one (`app/sitemap.js`).

**Two kinds of entry.** The `events` table carries both, told apart by its
`kind` column: `event` draws the schedule card (photo, place, date, time, a
price panel) and `news` draws the blog card (photo, category, headline,
byline). One table rather than two, because everything downstream — the slug,
the page, the sitemap entry — treats them identically; only which fields a card
draws differs. The admin editor shows the fields that kind actually uses.

**Where the cards come from.** The page HTML carries a placeholder comment
(`<!--cms:events-->`, `<!--cms:news-->`, `<!--cms:programs-->`,
`<!--cms:events-all-->`) which `lib/cms.js` fills at render time. A placeholder
with nothing to show removes its whole section rather than leaving a heading
over an empty strip. `ThemePage` decides how many rows to ask for: the home
page's sections take the flagged rows, the listing pages take every published
one.

**Setup.** After `npm run appwrite:migrate` creates the tables:

```bash
npm run appwrite:seed-programs   # the three age groups the theme shipped with
npm run appwrite:seed-news       # the two events and four posts it shipped with
```

Both are idempotent — a row whose slug already exists is left alone, so a
re-run never overwrites an admin's edits and never duplicates.

**Slugs are URLs.** They are derived from the title once, on creation, and then
left alone: rewording a headline must not break a link someone shared or a page
Google has indexed. The seeds write theirs out literally for the same reason.

Georgian titles are **transliterated to Latin** (`ზაფხულის საფეხბურთო ბანაკი` →
`zapkhulis-sapekhburto-banaki`) by `lib/slug.js`, using the Georgian national
romanisation — the one on road signs and in passports. Native Georgian slugs are
valid URLs and were what the site shipped first, but Georgian is three bytes per
character in UTF-8: a 26-character headline becomes ~120 bytes of percent-encoded
hex the moment it is pasted into Facebook, WhatsApp or SMS, and that same encoded
form is what Search Console and Analytics report. Since most of this site's
traffic arrives through exactly those channels, Latin slugs win. Nothing is lost
for readers — almost nobody reads a slug, and the headline in the search result
is Georgian either way.

If a table ever holds Georgian slugs again (an old backup, a hand-typed row):

```bash
npm run appwrite:relatinise-slugs            # dry run — show what would change
npm run appwrite:relatinise-slugs -- --apply # write it
```

It rewrites only non-ASCII slugs, deriving each from its row's own title through
the same `slugify` the admin panel uses, and leaves anything already Latin alone.
**It is a one-off for URLs nobody has shared yet** — it deliberately breaks the
immutability rule above, so once the site is live, add a redirect instead.

### Placeholders to replace

Contact details are now real. Phone, email and address appear in the header,
footer and contact page, and are marked up as `tel:` / `mailto:` / map links:

| Detail | Value |
| --- | --- |
| Phone | `551 390 993` (`tel:+995551390993`) |
| Email | `gldani.united@gmail.com` |
| Address | `გლდანი 1 მიკრორაიონი, 39 საჯარო სკოლის ტერიტორია` |
| Map pin | https://maps.app.goo.gl/ZpRe6mFbU4BrJxFe8 |

The map on `/contact` and `/about` is a keyless Google embed pinned to the
coordinates behind that link (`41.7931358,44.8267380`).

Those three values above are the defaults baked into the theme markup, and they
are editable from **Admin -> Design** (`contact.email`, `contact.phone`,
`contact.address`). Each is a single setting substituted into every place the
markup mentions it -- header, footer, contact cards, the registration sidebar --
rather than a `data-cms` marker per occurrence, because the same number appears
more than twenty times across the four pages. Both the visible text and the
`mailto:` / `tel:` href are rewritten, so an edited number is also the number
that gets dialled. Leaving a field empty means "use the theme's own value", the
same rule the content rows follow.

Two things the settings deliberately do not touch: the map pin, which is a
Google Maps URL no admin field can regenerate, and the WhatsApp number in
`app/components/EnquiryForms.jsx`, which has no setting of its own.

These placeholders are still outstanding:

| Placeholder | Where |
| --- | --- |
| `[მწვრთნელის სახელი]` | coach cards on `/` and `/about` |
| `[მშობლის სახელი]` | testimonial carousel on `/` |

Social links in the header and footer still point at bare `facebook.com` /
`instagram.com` etc. and need real profile URLs.

### The about-us collage

The two slanted shapes on `/` and `/about` are windows cut out of **one**
photograph — the image continues across the gap between them.

That constraint drives the implementation, in `public/stylesheets/custom.css`.
The photo can't be an `<img>` inside each shape: two `<img>`s means two
independently-positioned pictures and the subject jumps at the seam. Instead
both shapes share one background image sized to the *whole collage*, and each
offsets it by its own position, so the two windows sample different parts of
the same continuous picture.

All the geometry lives in custom properties on `.image-wraper .media`:

```
--shape-a-w / --shape-a-h   left window
--shape-b-w / --shape-b-h   right window
--gap                       clear space between them
--slant                     the lean, as a clip-path percentage
```

Widths, background size and both offsets are derived from those, so the
windows stay in register when any of them changes — the responsive blocks
redeclare only the variables. If you change one by hand, change the
`background-position` calcs with it or the halves will slide out of alignment.

To swap the photo, replace `public/images/about/collage.jpg` (1400×900 works
well) — no CSS changes needed.

### Photography

The template shipped **flat colour swatches**, not photographs — every stock
image was a 2–11KB single-colour JPEG. Real photos are therefore needed for:

- `public/images/member/team{1..4}.jpg` (669×891) — coach portraits, currently
  branded navy/gold placeholders that read as intentional
- `public/images/testimonial/profile.jpg` (272×272) — parent avatar

Other slots are filled with crops of the three supplied pitch photos. Masters
are kept outside `public/` in `assets-source/` so they aren't served.

Source images were 4000–6000px and 7–11MB each; they are resized to 2000px
wide and re-encoded, taking the three heroes from 28MB to 0.76MB combined.
Keep that step when swapping in new photos.

## Verification

Checked against a production build (`npm run build && npm start`):

- no English left in the rendered text of any of the three pages — verified by
  stripping tags, scripts and inline SVG, then matching for Latin runs, which
  leaves only the email address
- every internal link resolves (the 45 links to the removed `/blog-single` and
  `/event-details` routes now point at `/contact`)
- no broken images on any page
- no console or page errors, and no hydration errors
- checked at 1440px and 390px; the mobile nav collapses and opens correctly

Note when rebuilding: do not run `next build` while `next dev` is running. Both
write to `.next`, and the mix leaves the server requesting chunk filenames that
no longer exist (`Cannot find module './778.js'`). If that happens, stop the
server, delete `.next`, and start again.

### Resolved: the expired Mapbox token

`map.js` shipped with the theme author's expired Mapbox token, so the maps
returned HTTP 401 and rendered as a blank grey band. Both maps are now keyless
Google Maps `<iframe>` embeds, and `map.js` / `map.min.js` / `map.min.css` were
dropped from the manifest's global lists — about 1MB of JS that every page was
loading for a broken map.
