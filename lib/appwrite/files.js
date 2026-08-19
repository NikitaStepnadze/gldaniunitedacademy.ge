import 'server-only';

import { InputFile } from 'node-appwrite/file';
import { ID, Storage } from 'node-appwrite';

import { enquiryFilesBucketId } from './config';
import { getServerClient } from './server';

/**
 * Uploads and reads files attached to an enquiry.
 *
 * The bucket grants no permissions to anyone, so files are never fetched by
 * the browser directly -- every read is proxied by an admin-only route. These
 * are children's documents; a guessable URL should not be enough to open one.
 */
const MAX_BYTES = 10 * 1024 * 1024; // Matches the bucket's own limit.
const MAX_FILES = 5;

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

function getStorage() {
  return new Storage(getServerClient());
}

/**
 * Validates and uploads one file, returning its id.
 *
 * Both the size and the type are checked here rather than relying on the
 * bucket's own limits: failing early gives the visitor a usable message
 * instead of an opaque Appwrite error.
 */
export async function uploadEnquiryFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('invalid_file');
  }
  if (file.size > MAX_BYTES) throw new Error('file_too_large');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('file_type_not_allowed');

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = (file.name || 'upload').replace(/[^\w.\-]/g, '_').slice(0, 120);

  const created = await getStorage().createFile({
    bucketId: enquiryFilesBucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(buffer, safeName),
  });

  return created.$id;
}

/** Uploads several files, enforcing the per-submission count cap. */
export async function uploadEnquiryFiles(files) {
  const usable = files.filter((f) => f && f.size > 0);
  if (usable.length === 0) return [];
  if (usable.length > MAX_FILES) throw new Error('too_many_files');

  const ids = [];
  for (const file of usable) {
    ids.push(await uploadEnquiryFile(file));
  }
  return ids;
}

/** Metadata for a set of file ids, skipping any that no longer exist. */
export async function getFilesMeta(fileIds = []) {
  const storage = getStorage();
  const files = [];

  for (const fileId of fileIds) {
    try {
      const file = await storage.getFile({ bucketId: enquiryFilesBucketId, fileId });
      files.push({
        id: file.$id,
        name: file.name,
        size: file.sizeOriginal,
        mimeType: file.mimeType,
      });
    } catch {
      // Deleted out from under us; leave it out of the list.
    }
  }

  return files;
}

/** Raw bytes of one file, for the admin download proxy. */
export async function downloadFile(fileId) {
  const storage = getStorage();
  const [meta, bytes] = await Promise.all([
    storage.getFile({ bucketId: enquiryFilesBucketId, fileId }),
    storage.getFileDownload({ bucketId: enquiryFilesBucketId, fileId }),
  ]);

  return { meta, bytes: Buffer.from(bytes) };
}

/** Deletes files, ignoring ones already gone. */
export async function deleteFiles(fileIds = []) {
  const storage = getStorage();
  for (const fileId of fileIds) {
    try {
      await storage.deleteFile({ bucketId: enquiryFilesBucketId, fileId });
    } catch {
      // Already deleted.
    }
  }
}

export const fileLimits = { maxBytes: MAX_BYTES, maxFiles: MAX_FILES };
