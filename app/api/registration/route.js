import { createEnquiry, validateRegistration } from '../../../lib/appwrite/enquiries';
import {
  deleteFiles,
  uploadChildPhoto,
  uploadEnquiryFiles,
} from '../../../lib/appwrite/files';

/**
 * Receives a full enrolment application from the registration page.
 *
 * Separate from /api/contact rather than another branch inside it: this form
 * requires the child's details, both parents' details, a photo and form 100,
 * and mixing two different sets of required fields into one handler made both
 * harder to follow. Both write to the same enquiries table, distinguished by
 * `source`.
 *
 * Always multipart. The photo and form 100 are optional, so a submission can
 * carry no files at all, but the form posts as multipart either way rather than
 * switching encodings on whether a parent had a scan to hand.
 *
 * `force-dynamic` keeps this off the static path: it must run per request and
 * reads a server-only key.
 */
export const dynamic = 'force-dynamic';

/**
 * Per-IP throttle. Deliberately tighter than the contact form's: a registration
 * is a considered, one-off act, so a handful per minute from one address is
 * already well beyond normal use.
 *
 * In-memory, so it resets on redeploy and is per instance -- enough to blunt
 * casual abuse, not a substitute for a real rate limiter.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.set(ip, recent);

  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }

  return recent.length >= MAX_PER_WINDOW;
}

/** Counted only once a request reaches the write path -- see /api/contact. */
function recordAttempt(ip) {
  const recent = hits.get(ip) ?? [];
  recent.push(Date.now());
  hits.set(ip, recent);
}

export async function POST(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (isRateLimited(ip)) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Honeypot: hidden from users, so anything filling it is a bot. Answer 200 so
  // the bot cannot tell it was rejected.
  const trap = form.get('website');
  if (typeof trap === 'string' && trap.trim() !== '') {
    return Response.json({ ok: true });
  }

  const { data, errors } = validateRegistration({
    childFirstName: form.get('childFirstName'),
    childLastName: form.get('childLastName'),
    childDob: form.get('childDob'),
    childIdNumber: form.get('childIdNumber'),
    address: form.get('address'),
    schoolFrom: form.get('schoolFrom'),
    schoolTo: form.get('schoolTo'),
    trainingPlan: form.get('trainingPlan'),
    motherFirstName: form.get('motherFirstName'),
    motherLastName: form.get('motherLastName'),
    motherIdNumber: form.get('motherIdNumber'),
    motherPhone: form.get('motherPhone'),
    fatherFirstName: form.get('fatherFirstName'),
    fatherLastName: form.get('fatherLastName'),
    fatherIdNumber: form.get('fatherIdNumber'),
    fatherPhone: form.get('fatherPhone'),
    message: form.get('message'),
  });

  if (errors) {
    return Response.json({ error: 'validation_failed', fields: errors }, { status: 400 });
  }

  /*
   * Exactly two uploads: the child's photo and form 100 (the standard Georgian
   * medical certificate). A single named input each rather than one multi-file
   * list, so the admin panel can say which document is missing instead of
   * showing a pile of attachments and leaving the reader to check.
   */
  const photo = form.get('photo');
  const form100 = form.get('form100');

  /*
   * Both are optional. Not every parent can attach a scan at the point of
   * applying -- some phone the academy and a staff member fills the form in for
   * them -- and refusing the application outright loses the enrolment over a
   * document that can be collected later. The admin panel flags a missing one
   * and can upload it afterwards.
   *
   * A file that *is* sent still has to be a valid one; that check lives in the
   * upload helpers below.
   */
  const hasPhoto = photo && typeof photo === 'object' && photo.size > 0;
  const hasForm100 = form100 && typeof form100 === 'object' && form100.size > 0;

  recordAttempt(ip);

  // Files go up before the row, so a storage failure cannot leave an
  // application pointing at documents that were never stored. Any id created
  // before a later failure is deleted again in the catch.
  let photoId = '';
  let fileIds = [];
  try {
    if (hasPhoto) photoId = await uploadChildPhoto(photo);
    // Still stored in fileIds, the column the admin file list already reads. It
    // holds at most one id, so its single entry *is* form 100.
    if (hasForm100) fileIds = await uploadEnquiryFiles([form100]);
  } catch (error) {
    await deleteFiles([photoId, ...fileIds].filter(Boolean));

    const known = [
      'file_too_large',
      'file_type_not_allowed',
      'too_many_files',
      'photo_required',
      'photo_type_not_allowed',
    ];
    if (known.includes(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error('[registration] file upload failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  try {
    const id = await createEnquiry({ ...data, photoId, fileIds });
    return Response.json({ ok: true, id });
  } catch (error) {
    // The row failed but its files are already stored; remove them so the
    // bucket does not accumulate uploads no application refers to.
    await deleteFiles([photoId, ...fileIds]);

    // Logged server-side; the response stays generic so Appwrite ids and table
    // names are not disclosed to the caller.
    console.error('[registration] failed to store application:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
