import { isAuthenticated } from '../../../../../lib/appwrite/auth';
import { downloadFile } from '../../../../../lib/appwrite/files';

export const dynamic = 'force-dynamic';

/**
 * Serves one enquiry file to a signed-in admin.
 *
 * The bucket grants no public permissions, so this proxy is the only way to
 * read a file. That is the point: these are children's documents, and a
 * guessable Appwrite URL should not be enough to open one.
 */
export async function GET(request, { params }) {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const { meta, bytes } = await downloadFile(id);

    return new Response(bytes, {
      headers: {
        'Content-Type': meta.mimeType || 'application/octet-stream',
        // `inline` so PDFs and images open in a tab rather than downloading.
        'Content-Disposition': `inline; filename="${encodeURIComponent(meta.name)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
