import { createEnquiry, validateEnquiry } from '../../../lib/appwrite/enquiries';
import { deleteFiles, fileLimits, uploadEnquiryFiles } from '../../../lib/appwrite/files';

/**
 * Receives a contact-form submission and stores it in Appwrite.
 *
 * The write happens here rather than in the browser so the API key stays on
 * the server and the enquiries table needs no public create permission.
 *
 * Accepts either JSON (the hero form, which has no file field) or multipart
 * form data (the contact page, which does).
 *
 * `force-dynamic` keeps this off the static path -- the route must run per
 * request, and it reads a secret that must not be captured at build time.
 */
export const dynamic = 'force-dynamic';

/**
 * Coarse per-IP throttle. In-memory, so it resets on redeploy and is per
 * instance -- enough to blunt casual form spam, not a substitute for a real
 * rate limiter if this ever sees serious abuse.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.set(ip, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }

  return recent.length >= MAX_PER_WINDOW;
}

/**
 * Counts one attempt against the window. Called only once a request reaches
 * the write path -- a rejected bot or a typo in an email should not spend the
 * quota of a real visitor sharing the same IP behind NAT or a proxy.
 */
function recordAttempt(ip) {
  const recent = hits.get(ip) ?? [];
  recent.push(Date.now());
  hits.set(ip, recent);
}

/** Normalises either body format into { fields, files }. */
async function readPayload(request) {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size > 0);
    return {
      fields: {
        name: form.get('name'),
        email: form.get('email'),
        phone: form.get('phone'),
        childAge: form.get('childAge') ?? form.get('site'),
        message: form.get('message'),
        website: form.get('website'),
      },
      files,
    };
  }

  return { fields: await request.json(), files: [] };
}

export async function POST(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (isRateLimited(ip)) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  let fields;
  let files;
  try {
    ({ fields, files } = await readPayload(request));
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Honeypot: a field hidden from users, so anything filling it is a bot.
  // Answer 200 so the bot cannot tell it was rejected.
  if (typeof fields?.website === 'string' && fields.website.trim() !== '') {
    return Response.json({ ok: true });
  }

  const { data, errors } = validateEnquiry(fields);
  if (errors) {
    return Response.json({ error: 'validation_failed', fields: errors }, { status: 400 });
  }

  if (files.length > fileLimits.maxFiles) {
    return Response.json({ error: 'too_many_files' }, { status: 400 });
  }

  recordAttempt(ip);

  // Files are uploaded before the row so a storage failure means no orphaned
  // enquiry pointing at files that were never stored.
  let fileIds = [];
  try {
    fileIds = await uploadEnquiryFiles(files);
  } catch (error) {
    const known = ['file_too_large', 'file_type_not_allowed', 'too_many_files'];
    if (known.includes(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('[contact] file upload failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  try {
    const id = await createEnquiry({ ...data, fileIds });
    return Response.json({ ok: true, id });
  } catch (error) {
    // The row failed but its files are already in the bucket; remove them so
    // the bucket does not accumulate uploads no enquiry refers to.
    await deleteFiles(fileIds);

    // Log server-side; the response stays generic so Appwrite ids, table names
    // and key problems are not disclosed to the caller.
    console.error('[contact] failed to store enquiry:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
