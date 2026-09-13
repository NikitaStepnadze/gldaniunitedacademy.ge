'use server';

import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import {
  createProgram,
  deleteProgram,
  getProgramById,
  listAllPrograms,
  slugify,
  trimFeatured,
  uniqueSlug,
  updateProgram,
} from '../../../lib/appwrite/programs';
import { revalidatePrograms } from '../../../lib/revalidate';

/**
 * Server actions behind the programmes admin screens.
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
 * Reads the programme fields out of a submitted form.
 *
 * Checkboxes are absent from the payload when unticked, which is why they are
 * read as a presence test rather than compared to a value: an unchecked box
 * sends no key at all, so `=== 'on'` on a missing key and `!== null` on a
 * present one are the same test written two ways, and this is the one that
 * does not depend on the browser's chosen value string.
 */
function readForm(formData) {
  const text = (name) => String(formData.get(name) ?? '').trim();

  return {
    title: text('title'),
    ageRange: text('ageRange'),
    ageUnit: text('ageUnit'),
    activityLabel: text('activityLabel'),
    frequency: text('frequency'),
    image: text('image'),
    description: text('description'),
    body: text('body'),
    priceLabel: text('priceLabel'),
    priceValue: text('priceValue'),
    featured: formData.get('featured') !== null,
    published: formData.get('published') !== null,
  };
}

/**
 * Creates a programme and goes to its editor.
 *
 * The title is the only required field: an admin adding a programme mid-thought
 * should be able to save a draft and fill the rest in, and everything else has
 * a sensible empty rendering. A programme with no title would have no heading,
 * no link text and no slug, so that one is enforced.
 */
export async function createProgramAction(formData) {
  await requireAdmin();

  const input = readForm(formData);

  if (input.title === '') {
    redirect('/admin/programs?error=title');
  }

  const existing = await listAllPrograms();
  const lastOrder = existing.reduce((max, program) => Math.max(max, program.order), 0);

  const program = await createProgram({
    ...input,
    slug: await uniqueSlug(slugify(input.title)),
    // Added at the end of the list, where a new programme belongs: the admin
    // moves it with the arrows if it should sit elsewhere.
    order: lastOrder + 1,
  });

  if (program.featured) await trimFeatured(program.id);

  revalidatePrograms();
  redirect(`/admin/programs/${program.id}?created=1`);
}

/** Saves an edit and stays on the editor. */
export async function updateProgramAction(id, formData) {
  await requireAdmin();

  const input = readForm(formData);

  if (input.title === '') {
    redirect(`/admin/programs/${id}?error=title`);
  }

  /*
   * The slug is only written when the admin actually changed it.
   *
   * It is the page's URL, so it must not drift as a side effect of editing
   * anything else -- a retitled programme keeps the address it was shared and
   * indexed under. Comparing against the stored value is what makes the field
   * editable without making it volatile.
   *
   * A field cleared to blank means "rebuild it from the title" rather than
   * "delete the URL", which is the only reading that leaves the page reachable.
   */
  const current = await getProgramById(id);
  const typed = String(formData.get('slug') ?? '').trim();
  const desired = typed === '' ? slugify(input.title) : slugify(typed);

  if (current && desired !== current.slug) {
    input.slug = await uniqueSlug(desired, id);
  }

  await updateProgram(id, input);

  if (input.featured) await trimFeatured(id);

  revalidatePrograms();
  redirect(`/admin/programs/${id}?saved=1`);
}

/**
 * Deletes a programme and returns to the list.
 *
 * No soft delete: a programme is a short, hand-curated list that an admin can
 * retype in a minute, and "unpublish" already covers the case of wanting it
 * out of sight but recoverable.
 */
export async function deleteProgramAction(id) {
  await requireAdmin();

  await deleteProgram(id);
  revalidatePrograms();
  redirect('/admin/programs?deleted=1');
}

/**
 * Moves a programme one place up or down the list.
 *
 * The whole list is renumbered from its sorted positions rather than the two
 * rows being swapped. A table where every `order` is still 0 -- which is what a
 * freshly seeded one looks like -- has no two values to exchange, so a swap
 * would appear to do nothing; assigning positions makes the first click work.
 */
export async function moveProgramAction(id, direction) {
  await requireAdmin();

  const programs = await listAllPrograms();
  const index = programs.findIndex((program) => program.id === id);
  if (index === -1) redirect('/admin/programs');

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= programs.length) redirect('/admin/programs');

  const reordered = [...programs];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  // Only the rows whose number actually changes are written, so a list that is
  // already numbered costs two updates rather than one per programme.
  await Promise.all(
    reordered.map((program, position) =>
      program.order === position + 1
        ? null
        : updateProgram(program.id, { order: position + 1 })
    )
  );

  revalidatePrograms();
  redirect('/admin/programs');
}

/** Flips one programme's published flag from the list screen. */
export async function togglePublishedAction(id) {
  await requireAdmin();

  const program = await getProgramById(id);
  if (!program) redirect('/admin/programs');

  await updateProgram(id, { published: !program.published });

  revalidatePrograms();
  redirect('/admin/programs');
}

/** Flips one programme's featured flag from the list screen. */
export async function toggleFeaturedAction(id) {
  await requireAdmin();

  const program = await getProgramById(id);
  if (!program) redirect('/admin/programs');

  await updateProgram(id, { featured: !program.featured });
  if (!program.featured) await trimFeatured(id);

  revalidatePrograms();
  redirect('/admin/programs');
}
