'use server';

import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import {
  createEvent,
  deleteEvent,
  getEventById,
  listAllEvents,
  slugify,
  trimFeatured,
  uniqueSlug,
  updateEvent,
} from '../../../lib/appwrite/events';
import { revalidateNews } from '../../../lib/revalidate';

/**
 * Server actions behind the news and events admin screens.
 *
 * Every one of them re-checks the session. A server action is a public
 * endpoint -- anyone can post to it -- so the page's own check protects
 * nothing on its own; it decides what to show, never what to allow.
 */

/** Refuses the action unless the caller holds an admin session. */
async function requireAdmin() {
  if (!(await isAuthenticated())) redirect('/admin/login');
}

/**
 * Reads the entry fields out of a submitted form.
 *
 * Checkboxes are absent from the payload when unticked, which is why they are
 * read as a presence test rather than compared to a value: an unchecked box
 * sends no key at all.
 *
 * `kind` is narrowed to the two the site renders rather than stored as typed.
 * It selects a card layout, so an unrecognised value would leave an entry that
 * no list draws -- invisible on the site, with nothing in the panel to explain
 * why.
 */
function readForm(formData) {
  const text = (name) => String(formData.get(name) ?? '').trim();
  const kind = text('kind') === 'event' ? 'event' : 'news';

  return {
    title: text('title'),
    kind,
    tag: text('tag'),
    author: text('author'),
    location: text('location'),
    date: text('date'),
    time: text('time'),
    priceLabel: text('priceLabel'),
    priceValue: text('priceValue'),
    ctaLabel: text('ctaLabel'),
    image: text('image'),
    excerpt: text('excerpt'),
    body: text('body'),
    /*
     * Only a schedule entry can be featured. A news post has nowhere to appear
     * on the home page -- that section draws event cards -- so accepting the
     * flag would store a promise the site cannot keep.
     */
    featured: kind === 'event' && formData.get('featured') !== null,
    published: formData.get('published') !== null,
  };
}

/**
 * Creates an entry and goes to its editor.
 *
 * The title is the only required field: an admin adding a post mid-thought
 * should be able to save a draft and fill the rest in, and everything else has
 * a sensible empty rendering. An entry with no title would have no heading, no
 * link text and no slug, so that one is enforced.
 */
export async function createEntryAction(formData) {
  await requireAdmin();

  const input = readForm(formData);

  if (input.title === '') {
    redirect('/admin/news?error=title');
  }

  const existing = await listAllEvents();
  const lastOrder = existing.reduce((max, entry) => Math.max(max, entry.order), 0);

  const entry = await createEvent({
    ...input,
    slug: await uniqueSlug(slugify(input.title)),
    // Added at the end of the list, where a new entry belongs: the admin moves
    // it with the arrows if it should sit elsewhere.
    order: lastOrder + 1,
  });

  if (entry.featured) await trimFeatured(entry.id);

  revalidateNews();
  redirect(`/admin/news/${entry.id}?created=1`);
}

/**
 * Saves an edit and stays on the editor.
 *
 * The slug is left alone unless the entry never had one, which is what keeps an
 * indexed URL working after the headline is reworded. An admin who really wants
 * a new URL deletes the entry and writes it again -- that is the honest way to
 * say "this is a different page", and it leaves the old URL genuinely gone
 * rather than silently pointing somewhere else.
 */
export async function updateEntryAction(id, formData) {
  await requireAdmin();

  const input = readForm(formData);

  if (input.title === '') {
    redirect(`/admin/news/${id}?error=title`);
  }

  const before = await getEventById(id);
  if (!before) redirect('/admin/news');

  await updateEvent(id, {
    ...input,
    slug: before.slug || (await uniqueSlug(slugify(input.title), id)),
  });

  if (input.featured) await trimFeatured(id);

  revalidateNews();
  redirect(`/admin/news/${id}?saved=1`);
}

/**
 * Deletes an entry and returns to the list.
 *
 * No soft delete: "unpublish" already covers wanting it out of sight but
 * recoverable, and an entry kept only as a hidden row is one nobody will ever
 * find again to tidy away.
 */
export async function deleteEntryAction(id) {
  await requireAdmin();

  await deleteEvent(id);
  revalidateNews();
  redirect('/admin/news?deleted=1');
}

/**
 * Moves an entry one place up or down within its own kind.
 *
 * Ordering is per kind because the two lists are rendered separately: a news
 * post sitting between two events in `order` would make the arrow on an event
 * appear to do nothing. Swapping with the neighbour of the same kind is what
 * the admin sees on the page.
 *
 * The block is renumbered from its sorted positions rather than the two rows
 * being swapped. A table where every `order` is still 0 -- which is what a
 * freshly seeded one looks like -- has no two values to exchange, so a swap
 * would appear to do nothing; assigning positions makes the first click work.
 */
export async function moveEntryAction(id, direction) {
  await requireAdmin();

  const all = await listAllEvents();
  const entry = all.find((item) => item.id === id);
  if (!entry) redirect('/admin/news');

  const siblings = all.filter((item) => item.kind === entry.kind);
  const index = siblings.findIndex((item) => item.id === id);

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) redirect('/admin/news');

  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  /*
   * Positions are numbered from the lowest `order` already in this kind's
   * block, not from 1.
   *
   * Both kinds share one `order` column, so renumbering a kind from 1 would
   * walk its rows across the other kind's numbers and silently reorder that
   * list too. Keeping to the block's own range means a reorder inside one list
   * leaves the other exactly as it was.
   */
  const base = Math.min(...siblings.map((item) => item.order), siblings.length);

  // Only the rows whose number actually changes are written, so a list that is
  // already numbered costs two updates rather than one per entry.
  await Promise.all(
    reordered.map((item, position) =>
      item.order === base + position
        ? null
        : updateEvent(item.id, { order: base + position })
    )
  );

  revalidateNews();
  redirect('/admin/news');
}

/** Flips one entry's published flag from the list screen. */
export async function togglePublishedAction(id) {
  await requireAdmin();

  const entry = await getEventById(id);
  if (!entry) redirect('/admin/news');

  await updateEvent(id, { published: !entry.published });

  revalidateNews();
  redirect('/admin/news');
}

/**
 * Flips one entry's home-page flag from the list screen.
 *
 * Only an event can carry it -- the home section draws event cards -- so the
 * attempt is refused with a message rather than silently stored on a news post
 * that would never appear there.
 */
export async function toggleFeaturedAction(id) {
  await requireAdmin();

  const entry = await getEventById(id);
  if (!entry) redirect('/admin/news');

  if (entry.kind !== 'event') redirect('/admin/news?error=featuredKind');

  await updateEvent(id, { featured: !entry.featured });
  // Trimmed only after turning one *on*: switching one off can never leave more
  // flagged than the home page has room for.
  if (!entry.featured) await trimFeatured(id);

  revalidateNews();
  redirect('/admin/news');
}
