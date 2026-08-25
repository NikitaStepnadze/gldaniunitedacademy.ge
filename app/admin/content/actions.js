'use server';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import { contentTableId, updateValues } from '../../../lib/appwrite/content';
import { revalidateSite } from '../../../lib/revalidate';

/**
 * Saves the editor's changed fields.
 *
 * Takes { rowId: value } for only the fields the admin actually touched, so a
 * page of 98 inputs costs as many writes as there were edits -- Appwrite has
 * no bulk update, and the free plan's quota is worth not spending on rows
 * nobody changed.
 *
 * Returns a plain result rather than redirecting: the editor stays put, keeps
 * its scroll position and its preview, and just shows a confirmation.
 */
export async function saveContent(changes) {
  // The session is re-checked here, not merely on the page that rendered the
  // form. A server action is a public endpoint -- anyone can post to it -- so
  // the page's own check protects nothing on its own.
  if (!(await isAuthenticated())) {
    return { ok: false, message: 'სესია ამოიწურა. გთხოვთ, თავიდან შეხვიდეთ.' };
  }

  const updates = Object.entries(changes ?? {})
    .filter(([rowId]) => typeof rowId === 'string' && rowId !== '')
    .map(([rowId, value]) => ({ rowId, value: String(value ?? '') }));

  if (updates.length === 0) {
    return { ok: true, saved: 0, message: 'ცვლილება არ იყო.' };
  }

  try {
    await updateValues(contentTableId, updates);
  } catch (error) {
    console.error('[admin] save failed:', error.message);
    return { ok: false, message: 'შენახვა ვერ მოხერხდა. სცადეთ თავიდან.' };
  }

  /*
   * Drops every cache holding CMS content so the public pages pick the edit up
   * on the next request rather than up to an hour later. See revalidateSite
   * for why clearing the tag alone was not enough -- that was the bug where a
   * save showed correctly in the preview but not on the real site.
   */
  const fullyRevalidated = revalidateSite();

  return {
    ok: true,
    saved: updates.length,
    /*
     * The message distinguishes the two outcomes, because they need different
     * things from the admin. A clean save is finished. A partial revalidation
     * means the edit *is* stored and will appear within the hour -- so the
     * honest message says saved, and warns rather than claiming failure.
     */
    message: fullyRevalidated
      ? `${updates.length} ცვლილება შენახულია.`
      : `${updates.length} ცვლილება შენახულია, თუმცა საიტის განახლება დაგვიანდება.`,
  };
}
