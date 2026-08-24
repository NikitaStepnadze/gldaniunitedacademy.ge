import { isAuthenticated } from '../../../../lib/appwrite/auth';
import {
  deleteSiteImage,
  listSiteImages,
  mediaLimits,
  uploadSiteImage,
} from '../../../../lib/appwrite/media';

export const dynamic = 'force-dynamic';

/**
 * Upload, list and delete site images.
 *
 * Used by the image field in the content editor. Every method checks the admin
 * session first: the underlying bucket shares space with children's documents,
 * so an unauthenticated write here would be a way to publish into it.
 *
 * Upload is its own route rather than a server action because the editor needs
 * the resulting URL back without a navigation -- the preview has to update
 * from it in place, and the admin has to be able to keep editing other fields
 * while it uploads.
 */
const MESSAGES = {
  no_file: 'ფაილი არ არის არჩეული.',
  file_too_large: `ფაილი ძალიან დიდია (მაქსიმუმ ${Math.round(
    mediaLimits.maxBytes / (1024 * 1024)
  )} MB).`,
  file_type_not_allowed: 'დაშვებულია მხოლოდ JPG, PNG, WEBP, AVIF და GIF ფაილები.',
  not_a_site_image: 'ეს ფაილი საიტის სურათი არ არის.',
};

function fail(error, status = 400) {
  const code = error?.message ?? 'unknown';
  return Response.json(
    { ok: false, error: code, message: MESSAGES[code] ?? 'ატვირთვა ვერ მოხერხდა.' },
    { status }
  );
}

/** Lists uploaded images, for the picker. */
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  return Response.json({ ok: true, images: await listSiteImages() });
}

/** Uploads one image and returns the URL to store in the CMS row. */
export async function POST(request) {
  if (!(await isAuthenticated())) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const image = await uploadSiteImage(formData.get('file'));
    return Response.json({ ok: true, image });
  } catch (error) {
    return fail(error);
  }
}

/** Deletes an uploaded image the admin no longer wants in the picker. */
export async function DELETE(request) {
  if (!(await isAuthenticated())) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail(new Error('no_file'));

  try {
    await deleteSiteImage(id);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
