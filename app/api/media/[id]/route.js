import { isSiteImage } from '../../../../lib/appwrite/media';
import { downloadFile } from '../../../../lib/appwrite/files';

/**
 * Serves one site image to the public.
 *
 * Site images and enquiry attachments share a storage bucket, because the free
 * Appwrite plan allows exactly one. The bucket grants nobody any permission,
 * so nothing in it is reachable by URL, and this route is what makes a site
 * image public.
 *
 * That makes the `isSiteImage` check the security boundary of the whole
 * arrangement, not a detail: without it this route would hand any file in the
 * bucket -- including a child's birth certificate -- to anyone who guessed an
 * id. It is written as a positive test for the site-image marker, so a file is
 * served only because it was published as a site image, never merely because
 * it exists.
 *
 * Cached hard: these are content-addressed by file id, and an admin replacing
 * an image uploads a new file with a new id rather than overwriting one, so a
 * given id's bytes never change.
 */
export async function GET(_request, { params }) {
  const { id } = await params;

  if (!(await isSiteImage(id))) {
    // Deliberately identical to a genuinely missing file: a different response
    // here would let anyone probe which ids are enquiry attachments.
    return new Response('Not found', { status: 404 });
  }

  try {
    const { meta, bytes } = await downloadFile(id);

    return new Response(bytes, {
      headers: {
        'Content-Type': meta.mimeType || 'application/octet-stream',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
