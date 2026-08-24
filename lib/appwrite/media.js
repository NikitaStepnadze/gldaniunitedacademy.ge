import 'server-only';

import { InputFile } from 'node-appwrite/file';
import { ID, Query, Storage } from 'node-appwrite';

import { enquiryFilesBucketId } from './config';
import { getServerClient } from './server';

/**
 * Photos an admin uploads to appear on the public site.
 *
 * These share the enquiry bucket, because Appwrite's free plan allows exactly
 * one bucket per project and the enquiry files have it. That sharing is only
 * safe because the bucket grants nobody any permission: no file in it is
 * reachable by URL, and the two kinds are served by different routes.
 *
 *   /api/admin/files/[id]  - any file, admin session required.
 *   /api/media/[id]        - public, but only files an admin has published
 *                            into a CMS row. See that route for the check.
 *
 * So the public path can never serve a child's document: reaching it requires
 * a CMS row pointing at the file, and only the admin editor writes those.
 *
 * Uploaded names are prefixed so the two kinds stay distinguishable in the
 * Appwrite console, where they otherwise sit in one undifferentiated list.
 */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

/** Marks a stored file as a site image rather than an enquiry attachment. */
const SITE_PREFIX = 'site__';

function getStorage() {
  return new Storage(getServerClient());
}

/**
 * The URL a site image is referenced by.
 *
 * Same-origin and relative, which matters twice over: it passes the
 * `isSafeImageSrc` check in lib/cms.js, and it keeps working if the Appwrite
 * endpoint or project id ever changes, because nothing about them is baked
 * into the stored value.
 */
export function imageUrl(fileId) {
  return `/api/media/${fileId}`;
}

/** Uploads one site image and returns its id and public URL. */
export async function uploadSiteImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) {
    throw new Error('no_file');
  }
  if (file.size > MAX_BYTES) throw new Error('file_too_large');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('file_type_not_allowed');

  const buffer = Buffer.from(await file.arrayBuffer());
  const cleanName = (file.name || 'image').replace(/[^\w.\-]/g, '_').slice(0, 100);

  const created = await getStorage().createFile({
    bucketId: enquiryFilesBucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(buffer, `${SITE_PREFIX}${cleanName}`),
  });

  return {
    id: created.$id,
    url: imageUrl(created.$id),
    name: created.name.replace(SITE_PREFIX, ''),
  };
}

/**
 * Site images already uploaded, newest first, for the admin's picker.
 *
 * An admin who has already uploaded a crest should be able to point a second
 * field at it without uploading the same file twice. Filtered by the name
 * prefix so enquiry attachments never appear in the picker.
 */
export async function listSiteImages(limit = 100) {
  try {
    const result = await getStorage().listFiles({
      bucketId: enquiryFilesBucketId,
      queries: [
        Query.startsWith('name', SITE_PREFIX),
        Query.limit(limit),
        Query.orderDesc('$createdAt'),
      ],
    });

    return result.files.map((file) => ({
      id: file.$id,
      name: file.name.replace(SITE_PREFIX, ''),
      size: file.sizeOriginal,
      url: imageUrl(file.$id),
    }));
  } catch (error) {
    // A picker that cannot list must not take the text fields on the same page
    // down with it -- they are still perfectly usable.
    console.error('[media] cannot list site images:', error.message);
    return [];
  }
}

/**
 * True when a file id is a site image, i.e. safe to serve publicly.
 *
 * This is the check the public route depends on, so it is deliberately
 * positive: a file is public only because it carries the site prefix, never
 * merely because it was asked for.
 */
export async function isSiteImage(fileId) {
  try {
    const file = await getStorage().getFile({
      bucketId: enquiryFilesBucketId,
      fileId,
    });
    return typeof file.name === 'string' && file.name.startsWith(SITE_PREFIX);
  } catch {
    return false;
  }
}

/** Deletes one uploaded site image, ignoring one already gone. */
export async function deleteSiteImage(fileId) {
  // Guarded so a mistyped id cannot delete an enquiry attachment through the
  // admin's image manager.
  if (!(await isSiteImage(fileId))) throw new Error('not_a_site_image');

  try {
    await getStorage().deleteFile({
      bucketId: enquiryFilesBucketId,
      fileId,
    });
  } catch {
    // Already deleted.
  }
}

export const mediaLimits = {
  maxBytes: MAX_BYTES,
  types: [...ALLOWED_TYPES],
};
