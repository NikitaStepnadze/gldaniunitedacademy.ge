'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import {
  CMS_TAG,
  contentTableId,
  updateValues,
} from '../../../lib/appwrite/content';

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
   * Drops the cached CMS reads so the public pages pick the edit up on their
   * next request.
   *
   * Both calls are needed. revalidateTag clears the content map itself, but
   * each public page also carries `export const revalidate = 3600`, so its own
   * rendered output would stay in the full route cache for up to an hour and
   * keep serving the old copy from a cache that never re-reads the tag.
   */
  revalidateTag(CMS_TAG);
  revalidatePath('/', 'layout');

  return {
    ok: true,
    saved: updates.length,
    message: `${updates.length} ცვლილება შენახულია.`,
  };
}
