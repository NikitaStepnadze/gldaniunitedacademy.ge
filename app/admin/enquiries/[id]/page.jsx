import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { isAuthenticated } from '../../../../lib/appwrite/auth';
import {
  deleteEnquiry,
  getEnquiry,
  markEnquirySeen,
  setEnquiryFiles,
  STATUSES,
  STATUS_LABELS,
  TRAINING_PLANS,
  trainingPlanLabel,
  updateEnquiry,
  updateEnquiryDetails,
  validateEnquiryEdit,
} from '../../../../lib/appwrite/enquiries';
import {
  deleteFiles,
  getFilesMeta,
  uploadChildPhoto,
  uploadEnquiryFile,
} from '../../../../lib/appwrite/files';

export const dynamic = 'force-dynamic';

function formatDate(iso) {
  return new Date(iso).toLocaleString('ka-GE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Per-field messages for a rejected edit, keyed by field then reason.
 *
 * Mirrors validateEnquiryEdit's reasons. The editor is laxer than the public
 * form -- blank is allowed everywhere -- so there is no 'required' variant
 * here; only values that are present and malformed are reported.
 */
const EDIT_ERRORS = {
  childIdNumber: { invalid: 'პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან' },
  childDob: {
    invalid: 'თარიღი არასწორია',
    out_of_range: 'აკადემია იღებს 4-დან 17 წლამდე ბავშვებს',
  },
  schoolFrom: { invalid: 'დრო არასწორია (სთ:წთ)' },
  schoolTo: {
    invalid: 'დრო არასწორია (სთ:წთ)',
    order: 'დამთავრების დრო უნდა იყოს დაწყების დროზე გვიან',
  },
  motherIdNumber: { invalid: 'პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან' },
  motherPhone: { invalid: 'ნომერი არასწორია' },
  fatherIdNumber: { invalid: 'პირადი ნომერი უნდა შედგებოდეს 11 ციფრისგან' },
  fatherPhone: { invalid: 'ნომერი არასწორია' },
  email: { invalid: 'ელფოსტა არასწორია' },
  phone: { invalid: 'ნომერი არასწორია' },
  trainingPlan: { invalid: 'აირჩიეთ ვარჯიშის გეგმა' },
};

/** Messages for a rejected upload, keyed by the helper's error code. */
const UPLOAD_ERRORS = {
  file_too_large: 'ფაილი ძალიან დიდია. მაქსიმუმი 10 MB.',
  file_type_not_allowed: 'დაშვებულია მხოლოდ PDF, JPG, PNG, WebP და HEIC.',
  photo_type_not_allowed: 'ფოტო უნდა იყოს JPG, PNG, WebP ან HEIC.',
  photo_required: 'აირჩიეთ ფაილი.',
  invalid_file: 'აირჩიეთ ფაილი.',
  no_file: 'აირჩიეთ ფაილი.',
};

/**
 * Renders one editable text field, with its error slot.
 *
 * A helper rather than repeated JSX: the editor has twenty of these and the
 * label/input/error trio has to stay identical across all of them.
 */
function Field({ name, label, value, type = 'text', errors, ...rest }) {
  const reason = errors?.[name];
  const message = reason ? (EDIT_ERRORS[name]?.[reason] ?? 'მნიშვნელობა არასწორია') : '';

  return (
    <div className="admin-field">
      <label htmlFor={`edit-${name}`}>{label}</label>
      <input
        id={`edit-${name}`}
        name={name}
        type={type}
        defaultValue={value ?? ''}
        aria-invalid={message ? 'true' : undefined}
        {...rest}
      />
      {message && <span className="admin-error">{message}</span>}
    </div>
  );
}

export default async function EnquiryDetailPage({ params, searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const { id } = await params;
  const query = await searchParams;

  let enquiry;
  try {
    enquiry = await getEnquiry(id);
  } catch {
    return (
      <main className="admin-main">
        <p className="admin-msg error">განაცხადი ვერ მოიძებნა.</p>
        <Link href="/admin/enquiries" className="admin-btn secondary">
          ← სიაში დაბრუნება
        </Link>
      </main>
    );
  }

  /*
   * Opening the page is what marks the application as seen, so the list can
   * colour the ones nobody has looked at yet.
   *
   * Fired after the read above, and the already-fetched `enquiry` is what the
   * page renders, so this never changes what the reader sees on the visit that
   * set it. It is also skipped when the flag is already set, to avoid a write
   * on every revisit.
   *
   * Not awaited before rendering matters little either way -- it is awaited so
   * the write cannot be cut short when the response finishes, which on a
   * serverless host can kill work still in flight.
   */
  if (!enquiry.seen) await markEnquirySeen(id);

  const files = await getFilesMeta(enquiry.fileIds ?? []);

  // The child's photo is stored in its own column so it can be shown as a
  // portrait rather than as one more row in the attachment list.
  const [photo] = enquiry.photoId ? await getFilesMeta([enquiry.photoId]) : [];

  /*
   * Editor state, carried in the URL.
   *
   * `edit=1` opens the form; a rejected save redirects back with it set so the
   * reader lands on the form rather than on the read-only view. `err` is the
   * packed `field:reason` list validateEnquiryEdit produced.
   */
  const isEditing = query?.edit === '1';

  const editErrors = Object.fromEntries(
    String(query?.err ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => pair.split(':'))
      .filter(([field, reason]) => field && reason)
  );

  const uploadError = UPLOAD_ERRORS[String(query?.uploadErr ?? '')] ?? '';

  // Registrations carry the child's and parents' details; contact enquiries do
  // not, and their extra rows would all read "—".
  const isRegistration = enquiry.source === 'registration';

  const childName = `${enquiry.childFirstName} ${enquiry.childLastName}`.trim();

  /*
   * What has to be typed to confirm a permanent delete. Derived once and used
   * by both the server action and the label above the field, so the two cannot
   * ask for and check different things.
   *
   * Falls back to a fixed word for the rare row that carries no name at all --
   * otherwise clearing a name would make its row undeletable.
   */
  const deleteConfirmWord =
    (isRegistration ? childName : enquiry.name).trim() || 'წაშლა';

  /*
   * School hours as a range. Both ends are required by the form, so a row with
   * only one is either pre-split or hand-edited -- show whichever is there
   * rather than a dash that hides it.
   */
  const schoolHours =
    enquiry.schoolFrom && enquiry.schoolTo
      ? `${enquiry.schoolFrom} – ${enquiry.schoolTo}`
      : enquiry.schoolFrom || enquiry.schoolTo || '—';

  /*
   * Whichever parent blocks were filled in, in a shape the panel can loop over.
   *
   * `contactParent` names the block that `name` and `phone` were copied from,
   * so the panel can mark it rather than leaving the reader to compare numbers.
   * It is absent on rows written before the mother/father split; those fall
   * back to the old single-parent columns so their details are not simply lost.
   */
  const parents = [
    {
      role: 'mother',
      label: 'დედა',
      first: enquiry.motherFirstName,
      last: enquiry.motherLastName,
      idNumber: enquiry.motherIdNumber,
      phone: enquiry.motherPhone,
    },
    {
      role: 'father',
      label: 'მამა',
      first: enquiry.fatherFirstName,
      last: enquiry.fatherLastName,
      idNumber: enquiry.fatherIdNumber,
      phone: enquiry.fatherPhone,
    },
  ]
    .filter((p) => p.first || p.last || p.idNumber || p.phone)
    .map((p) => ({
      role: p.role,
      label: p.label,
      name: `${p.first} ${p.last}`.trim() || '—',
      idNumber: p.idNumber,
      phone: p.phone,
      isContact: enquiry.contactParent === p.role,
    }));

  // Pre-split registrations kept one unlabelled parent; surface it as its own
  // entry so those older applications still show who applied.
  if (parents.length === 0 && (enquiry.parentFirstName || enquiry.parentLastName)) {
    parents.push({
      role: 'parent',
      label: 'მშობელი',
      name: `${enquiry.parentFirstName} ${enquiry.parentLastName}`.trim(),
      idNumber: '',
      phone: enquiry.phone,
      isContact: true,
    });
  }

  /** Saves status and notes together, so one click persists both. */
  async function save(formData) {
    'use server';

    await updateEnquiry(id, {
      status: String(formData.get('status') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    });

    revalidatePath(`/admin/enquiries/${id}`);
    redirect(`/admin/enquiries/${id}?saved=1`);
  }

  // Capture the primitives, not the row: a server action's closure is
  // serialised the same way props are, and an SDK object cannot cross that
  // boundary.
  const isArchived = enquiry.archived;
  const photoId = enquiry.photoId;
  const currentFileIds = enquiry.fileIds ?? [];

  /**
   * Saves an edit of the details the parent submitted.
   *
   * Field errors are carried back through the query string rather than held in
   * component state: this is a server-rendered form with no client component,
   * so a redirect is the only way back to the page, and a redirect discards
   * anything not in the URL. They are short reason codes, not messages.
   */
  async function saveDetails(formData) {
    'use server';

    const input = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') input[key] = value;
    }

    const { data, errors } = validateEnquiryEdit(input, { isRegistration });

    if (errors) {
      const packed = Object.entries(errors)
        .map(([field, reason]) => `${field}:${reason}`)
        .join(',');
      redirect(
        `/admin/enquiries/${id}?edit=1&err=${encodeURIComponent(packed)}`
      );
    }

    await updateEnquiryDetails(id, data);

    revalidatePath(`/admin/enquiries/${id}`);
    // The list shows name and phone, which an edit can change.
    revalidatePath('/admin/enquiries');
    redirect(`/admin/enquiries/${id}?saved=1`);
  }

  /**
   * Attaches or replaces one document.
   *
   * `which` picks the target: the photo lives in its own column and is
   * type-checked as an image, form 100 is the single entry in fileIds. An
   * existing file is deleted only after the replacement is safely stored, so a
   * failed upload cannot leave the record with nothing.
   */
  async function uploadDocument(formData) {
    'use server';

    const which = String(formData.get('which') ?? '');
    const file = formData.get('file');

    if (!file || typeof file !== 'object' || file.size === 0) {
      redirect(`/admin/enquiries/${id}?edit=1&uploadErr=no_file`);
    }

    let newId;
    try {
      newId = which === 'photo' ? await uploadChildPhoto(file) : await uploadEnquiryFile(file);
    } catch (error) {
      const code = UPLOAD_ERRORS[error.message] ? error.message : 'invalid_file';
      redirect(`/admin/enquiries/${id}?edit=1&uploadErr=${code}`);
    }

    // Recorded on the row before the old file is removed: if the delete fails
    // the record is still correct, and the leftover is a stray file rather than
    // a document the panel claims to have but cannot open.
    const replaced =
      which === 'photo'
        ? await setEnquiryFiles(id, { photoId: newId }).then(() => photoId)
        : await setEnquiryFiles(id, { fileIds: [newId] }).then(() => currentFileIds[0]);

    if (replaced) await deleteFiles([replaced]);

    revalidatePath(`/admin/enquiries/${id}`);
    redirect(`/admin/enquiries/${id}?saved=1`);
  }

  /** Detaches one document and deletes its bytes. */
  async function removeDocument(formData) {
    'use server';

    const which = String(formData.get('which') ?? '');
    const target = which === 'photo' ? photoId : currentFileIds[0];

    if (which === 'photo') await setEnquiryFiles(id, { photoId: '' });
    else await setEnquiryFiles(id, { fileIds: [] });

    // After the row no longer points at it, so a failed delete leaves a stray
    // file rather than a broken reference.
    if (target) await deleteFiles([target]);

    revalidatePath(`/admin/enquiries/${id}`);
    redirect(`/admin/enquiries/${id}?saved=1`);
  }

  async function toggleArchive() {
    'use server';

    await updateEnquiry(id, { archived: !isArchived });
    revalidatePath('/admin/enquiries');
    redirect('/admin/enquiries');
  }

  /**
   * Removes the row and any files it owned, so nothing is orphaned.
   *
   * Guarded by a typed confirmation: the deletion is permanent and takes the
   * child's documents with it, and the button sits one click away from the
   * archive button that does the reversible version of the same thing.
   *
   * The check is here rather than only in the browser because a confirm()
   * dialog is advisory -- this action is reachable by a direct POST, and the
   * data it destroys cannot be restored. Names are compared case-insensitively
   * and with surrounding whitespace ignored, so a correct name is not refused
   * over a trailing space.
   */
  async function remove(formData) {
    'use server';

    const typed = String(formData.get('confirmName') ?? '').trim();

    /*
     * A row can legitimately have no name -- an admin edit that clears both
     * parents' names leaves it empty -- and requiring an empty string would
     * make such a row impossible to delete. Those fall back to a fixed word,
     * so the action still has to be typed out deliberately.
     */
    if (!deleteConfirmWord || typed.toLowerCase() !== deleteConfirmWord.toLowerCase()) {
      redirect(`/admin/enquiries/${id}?delete=mismatch`);
    }

    const fileIds = await deleteEnquiry(id);
    // photoId is not part of fileIds, so it needs deleting explicitly or the
    // child's photo would outlive the application it belonged to.
    await deleteFiles([...fileIds, photoId].filter(Boolean));
    revalidatePath('/admin/enquiries');
    redirect('/admin/enquiries');
  }

  return (
    <main className="admin-main">
      {/*
        * The download sits beside the back link rather than among the status
        * controls below: it reads the application out, it does not change it.
        * A plain <a> because the response is a file, not a route.
        */}
      <div className="admin-export" style={{ marginBottom: 18 }}>
        <Link href="/admin/enquiries" className="admin-btn secondary">
          ← სიაში დაბრუნება
        </Link>
        <a className="admin-btn secondary" href={`/api/admin/export/${id}`} download>
          ⭳ ექსელში ჩამოტვირთვა
        </a>
      </div>

      {/* The child is who the application is about, so they head the page; the
          parent's name moves to the subtitle. */}
      <h1 className="admin-title">
        {isRegistration ? childName || enquiry.name : enquiry.name}
      </h1>
      <p className="admin-subtitle">
        {isRegistration ? 'რეგისტრაცია' : 'შეტყობინება'}
        {isRegistration && enquiry.name ? ` · მშობელი: ${enquiry.name}` : ''} · მიღებულია{' '}
        {formatDate(enquiry.$createdAt)}
        {enquiry.archived ? ' · დაარქივებული' : ''}
      </p>

      {query?.saved === '1' && <p className="admin-msg ok">შენახულია.</p>}
      {query?.delete === 'mismatch' && (
        <p className="admin-msg error">
          სახელი არ დაემთხვა — განაცხადი არ წაშლილა.
        </p>
      )}
      {Object.keys(editErrors).length > 0 && (
        <p className="admin-msg error">გთხოვთ შეასწოროთ მონიშნული ველები.</p>
      )}
      {uploadError && <p className="admin-msg error">{uploadError}</p>}

      <div className="admin-grid">
        <div>
          {/*
            The editor replaces the read-only panels rather than sitting beside
            them: two copies of the same twenty values, one editable and one
            not, invites editing the wrong one.
          */}
          {isEditing ? (
            <div className="admin-panel">
              <h2>მონაცემების რედაქტირება</h2>
              <p style={{ color: '#8a93a8', fontSize: 13, margin: '-8px 0 18px' }}>
                ცარიელი ველი დასაშვებია — შეავსეთ ის, რაც ცნობილია.
              </p>

              <form action={saveDetails}>
                {isRegistration ? (
                  <>
                    <fieldset className="admin-fieldset">
                      <legend>ბავშვი</legend>
                      <div className="admin-field-row">
                        <Field
                          name="childFirstName"
                          label="სახელი"
                          value={enquiry.childFirstName}
                          errors={editErrors}
                        />
                        <Field
                          name="childLastName"
                          label="გვარი"
                          value={enquiry.childLastName}
                          errors={editErrors}
                        />
                      </div>
                      <div className="admin-field-row">
                        <Field
                          name="childIdNumber"
                          label="პირადი ნომერი"
                          value={enquiry.childIdNumber}
                          errors={editErrors}
                          inputMode="numeric"
                          maxLength={16}
                        />
                        {/* Age is derived from this date, never edited beside
                            it, so the two cannot contradict each other. */}
                        <Field
                          name="childDob"
                          label="დაბადების თარიღი"
                          value={enquiry.childDob}
                          type="date"
                          errors={editErrors}
                        />
                      </div>
                      <Field
                        name="address"
                        label="მისამართი"
                        value={enquiry.address}
                        errors={editErrors}
                      />
                      <div className="admin-field-row">
                        <Field
                          name="schoolFrom"
                          label="სკოლა — დან"
                          value={enquiry.schoolFrom}
                          type="time"
                          errors={editErrors}
                        />
                        <Field
                          name="schoolTo"
                          label="სკოლა — მდე"
                          value={enquiry.schoolTo}
                          type="time"
                          errors={editErrors}
                        />
                      </div>

                      {/*
                        * A select rather than the radio cards the public form
                        * uses: this is a dense edit form, and it needs a
                        * "not set" option the public form must not offer, for
                        * rows submitted before the choice existed.
                        */}
                      <div className="admin-field">
                        <label htmlFor="edit-trainingPlan">ვარჯიშის გეგმა</label>
                        <select
                          id="edit-trainingPlan"
                          name="trainingPlan"
                          defaultValue={enquiry.trainingPlan || ''}
                        >
                          <option value="">— არ არის მითითებული —</option>
                          {Object.entries(TRAINING_PLANS).map(([key, plan]) => (
                            <option key={key} value={key}>
                              {plan.label}
                            </option>
                          ))}
                        </select>
                        {editErrors?.trainingPlan && (
                          <span className="admin-error">
                            {EDIT_ERRORS.trainingPlan?.invalid ?? 'მნიშვნელობა არასწორია'}
                          </span>
                        )}
                      </div>
                    </fieldset>

                    <fieldset className="admin-fieldset">
                      <legend>დედა</legend>
                      <div className="admin-field-row">
                        <Field
                          name="motherFirstName"
                          label="სახელი"
                          value={enquiry.motherFirstName}
                          errors={editErrors}
                        />
                        <Field
                          name="motherLastName"
                          label="გვარი"
                          value={enquiry.motherLastName}
                          errors={editErrors}
                        />
                      </div>
                      <div className="admin-field-row">
                        <Field
                          name="motherIdNumber"
                          label="პირადი ნომერი"
                          value={enquiry.motherIdNumber}
                          errors={editErrors}
                          inputMode="numeric"
                          maxLength={16}
                        />
                        <Field
                          name="motherPhone"
                          label="ტელეფონი"
                          value={enquiry.motherPhone}
                          type="tel"
                          errors={editErrors}
                        />
                      </div>
                    </fieldset>

                    <fieldset className="admin-fieldset">
                      <legend>მამა</legend>
                      <div className="admin-field-row">
                        <Field
                          name="fatherFirstName"
                          label="სახელი"
                          value={enquiry.fatherFirstName}
                          errors={editErrors}
                        />
                        <Field
                          name="fatherLastName"
                          label="გვარი"
                          value={enquiry.fatherLastName}
                          errors={editErrors}
                        />
                      </div>
                      <div className="admin-field-row">
                        <Field
                          name="fatherIdNumber"
                          label="პირადი ნომერი"
                          value={enquiry.fatherIdNumber}
                          errors={editErrors}
                          inputMode="numeric"
                          maxLength={16}
                        />
                        <Field
                          name="fatherPhone"
                          label="ტელეფონი"
                          value={enquiry.fatherPhone}
                          type="tel"
                          errors={editErrors}
                        />
                      </div>
                    </fieldset>

                    {/*
                      Which parent the list's name and phone columns come from.
                      A choice rather than a derived value once both blocks are
                      filled in; with only one named block the validator picks
                      that one regardless of what is posted here.
                    */}
                    <fieldset className="admin-fieldset">
                      <legend>საკონტაქტო მშობელი</legend>
                      <div className="admin-radio-row">
                        <label className="admin-radio">
                          <input
                            type="radio"
                            name="contactParent"
                            value="mother"
                            defaultChecked={enquiry.contactParent !== 'father'}
                          />
                          დედა
                        </label>
                        <label className="admin-radio">
                          <input
                            type="radio"
                            name="contactParent"
                            value="father"
                            defaultChecked={enquiry.contactParent === 'father'}
                          />
                          მამა
                        </label>
                      </div>
                    </fieldset>
                  </>
                ) : (
                  /* A contact enquiry carries far less: these five fields are
                     everything the form collected. */
                  <fieldset className="admin-fieldset">
                    <legend>შეტყობინების ავტორი</legend>
                    <Field
                      name="name"
                      label="სახელი და გვარი"
                      value={enquiry.name}
                      errors={editErrors}
                    />
                    <div className="admin-field-row">
                      <Field
                        name="email"
                        label="ელფოსტა"
                        value={enquiry.email}
                        type="email"
                        errors={editErrors}
                      />
                      <Field
                        name="phone"
                        label="ტელეფონი"
                        value={enquiry.phone}
                        type="tel"
                        errors={editErrors}
                      />
                    </div>
                    <Field
                      name="childAge"
                      label="ბავშვის ასაკი"
                      value={enquiry.childAge}
                      errors={editErrors}
                    />
                  </fieldset>
                )}

                <div className="admin-field">
                  <label htmlFor="edit-message">
                    {isRegistration ? 'დამატებითი ინფორმაცია' : 'შეტყობინება'}
                  </label>
                  <textarea
                    id="edit-message"
                    name="message"
                    rows={4}
                    defaultValue={enquiry.message ?? ''}
                  />
                </div>

                <div className="admin-panel-actions">
                  <button type="submit" className="admin-btn">
                    შენახვა
                  </button>
                  <Link href={`/admin/enquiries/${id}`} className="admin-btn secondary">
                    გაუქმება
                  </Link>
                </div>
              </form>
            </div>
          ) : (
          <>
          <div className="admin-panel">
            <h2>განაცხადის მონაცემები</h2>
            <dl className="admin-dl">
              {isRegistration && (
                <>
                  <div>
                    <dt>ბავშვი</dt>
                    <dd>{childName || '—'}</dd>
                  </div>
                  <div>
                    <dt>პირადი ნომერი</dt>
                    <dd>{enquiry.childIdNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt>დაბადების თარიღი</dt>
                    <dd>
                      {enquiry.childDob || '—'}
                      {enquiry.childAge ? ` (${enquiry.childAge} წლის)` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>მისამართი</dt>
                    <dd>{enquiry.address || '—'}</dd>
                  </div>
                  <div>
                    <dt>სკოლის საათები</dt>
                    <dd>{schoolHours}</dd>
                  </div>
                  {/* Rendered from the key through trainingPlanLabel, so a
                      change to the price or the wording shows on every existing
                      application rather than only on new ones. */}
                  <div>
                    <dt>ვარჯიშის გეგმა</dt>
                    <dd>{trainingPlanLabel(enquiry.trainingPlan)}</dd>
                  </div>
                </>
              )}

              {/* Contact enquiries carry only these three, so they stay outside
                  the registration block above. */}
              {!isRegistration && (
                <>
                  <div>
                    <dt>მშობელი</dt>
                    <dd>{enquiry.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>ელფოსტა</dt>
                    <dd>
                      {enquiry.email ? (
                        <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>ტელეფონი</dt>
                    <dd>
                      {enquiry.phone ? <a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a> : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>ბავშვის ასაკი</dt>
                    <dd>{enquiry.childAge || '—'}</dd>
                  </div>
                </>
              )}

              <div>
                <dt>{isRegistration ? 'დამატებითი ინფორმაცია' : 'შეტყობინება'}</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{enquiry.message || '—'}</dd>
              </div>
            </dl>
          </div>

          {/*
            Parents get their own panel on a registration: two full sets of
            details would crowd the child's out if they shared one list. Only
            the blocks actually filled in are shown -- at least one always is.
          */}
          {isRegistration && (
            <div className="admin-panel">
              <h2>მშობლები</h2>
              {parents.length === 0 ? (
                <p style={{ color: '#8a93a8', margin: 0 }}>მშობლის მონაცემები არ არის.</p>
              ) : (
                parents.map((parent) => (
                  <div key={parent.role} style={{ marginBottom: 18 }}>
                    <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>
                      {parent.label}
                      {parent.isContact && (
                        <span
                          style={{ color: '#8a93a8', fontWeight: 400, fontSize: 13 }}
                        >
                          {' '}
                          · საკონტაქტო
                        </span>
                      )}
                    </h3>
                    <dl className="admin-dl">
                      <div>
                        <dt>სახელი და გვარი</dt>
                        <dd>{parent.name}</dd>
                      </div>
                      <div>
                        <dt>პირადი ნომერი</dt>
                        <dd>{parent.idNumber || '—'}</dd>
                      </div>
                      <div>
                        <dt>ტელეფონი</dt>
                        <dd>
                          {parent.phone ? (
                            <a href={`tel:${parent.phone}`}>{parent.phone}</a>
                          ) : (
                            '—'
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))
              )}
            </div>
          )}
          </>
          )}

          {/*
            The child's photo, with the actions that apply to it.

            Both documents are optional on the public form now, so a parent can
            apply without them and the academy collects them afterwards -- which
            means this panel has to be able to attach one, not just show it.
          */}
          <div className="admin-panel">
            <h2>ბავშვის ფოტო</h2>

            {photo ? (
              <>
                {/*
                  Served through the admin file proxy, not from Appwrite
                  directly: the bucket grants no public read, deliberately,
                  because these are children's photos. A plain <img> is used
                  rather than next/image because the proxy route is
                  admin-authenticated and the optimiser would need its own
                  access to fetch the source.
                */}
                <a href={`/api/admin/files/${photo.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/files/${photo.id}`}
                    alt={childName}
                    style={{
                      display: 'block',
                      maxWidth: 220,
                      width: '100%',
                      height: 'auto',
                      borderRadius: 8,
                      border: '1px solid #dde3ef',
                    }}
                  />
                </a>
                <div className="admin-doc">
                  <span className="admin-doc-info">
                    <span className="admin-doc-name">{photo.name}</span>
                    <span className="admin-doc-meta">{formatSize(photo.size)}</span>
                  </span>
                  <span className="admin-doc-actions">
                    <form action={removeDocument}>
                      <input type="hidden" name="which" value="photo" />
                      <button type="submit" className="admin-btn danger small">
                        წაშლა
                      </button>
                    </form>
                  </span>
                </div>
              </>
            ) : (
              <p className="admin-doc-missing" style={{ margin: '0 0 14px' }}>
                ფოტო არ არის მიმაგრებული.
              </p>
            )}

            {/* No encType: `action` is a server action, so React serialises the
                FormData itself rather than letting the browser submit the form,
                and files come through regardless. Setting it makes React warn
                that it is overriding the value. */}
            <form action={uploadDocument}>
              <input type="hidden" name="which" value="photo" />
              <div className="admin-field">
                <label htmlFor="upload-photo">
                  {photo ? 'ფოტოს შეცვლა' : 'ფოტოს ატვირთვა'}{' '}
                  <span className="hint">JPG, PNG, WebP ან HEIC · მაქს. 10 MB</span>
                </label>
                <input
                  id="upload-photo"
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  required
                />
              </div>
              <button type="submit" className="admin-btn secondary small">
                ატვირთვა
              </button>
            </form>
          </div>

          {/*
            On a registration this list is form 100 -- the only document the
            form collects -- so it is named rather than left as "files".
          */}
          <div className="admin-panel">
            <h2>{isRegistration ? 'ფორმა 100' : 'ფაილები'}</h2>

            {files.length === 0 ? (
              <p className="admin-doc-missing" style={{ margin: '0 0 14px' }}>
                {isRegistration
                  ? 'ფორმა 100 არ არის მიმაგრებული.'
                  : 'ფაილები არ არის მიმაგრებული.'}
              </p>
            ) : (
              files.map((file) => (
                <div className="admin-doc" key={file.id}>
                  <span className="admin-doc-info">
                    <span className="admin-doc-name">
                      {file.mimeType === 'application/pdf' ? '📄' : '🖼️'}{' '}
                      <a href={`/api/admin/files/${file.id}`} target="_blank" rel="noreferrer">
                        {file.name}
                      </a>
                    </span>
                    <span className="admin-doc-meta">{formatSize(file.size)}</span>
                  </span>
                  <span className="admin-doc-actions">
                    <form action={removeDocument}>
                      <input type="hidden" name="which" value="form100" />
                      <button type="submit" className="admin-btn danger small">
                        წაშლა
                      </button>
                    </form>
                  </span>
                </div>
              ))
            )}

            {/* See the photo form above on the absent encType. */}
            <form action={uploadDocument} style={{ marginTop: 14 }}>
              <input type="hidden" name="which" value="form100" />
              <div className="admin-field">
                <label htmlFor="upload-form100">
                  {files.length > 0 ? 'ფაილის შეცვლა' : 'ფაილის ატვირთვა'}{' '}
                  <span className="hint">PDF, JPG, PNG, WebP ან HEIC · მაქს. 10 MB</span>
                </label>
                <input
                  id="upload-form100"
                  type="file"
                  name="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  required
                />
              </div>
              <button type="submit" className="admin-btn secondary small">
                ატვირთვა
              </button>
            </form>
          </div>
        </div>

        <div>
          <div className="admin-panel">
            <h2>სტატუსი და შენიშვნები</h2>
            <form action={save}>
              <div className="admin-field">
                <label htmlFor="status">სტატუსი</label>
                <select id="status" name="status" defaultValue={enquiry.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="notes">
                  შენიშვნები <span className="hint">(მხოლოდ ადმინისთვის)</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={7}
                  defaultValue={enquiry.notes ?? ''}
                  placeholder="მაგ. დაურეკეთ ორშაბათს, ბავშვი 9 წლისაა..."
                />
              </div>
              <button type="submit" className="admin-btn">
                შენახვა
              </button>
            </form>
          </div>

          <div className="admin-panel">
            <h2>მოქმედებები</h2>
            <div className="admin-actions">
              {/* A link, not a form: opening the editor changes nothing, it
                  just adds ?edit=1 so the page renders the form instead. */}
              {!isEditing && (
                <Link
                  href={`/admin/enquiries/${id}?edit=1`}
                  className="admin-btn secondary"
                >
                  მონაცემების რედაქტირება
                </Link>
              )}
              <form action={toggleArchive}>
                <button type="submit" className="admin-btn secondary">
                  {enquiry.archived ? 'არქივიდან დაბრუნება' : 'დაარქივება'}
                </button>
              </form>
              {/*
                * Deleting asks for the name to be typed first. The archive
                * button above is the reversible action, so the destructive one
                * should cost more than the same single click.
                */}
              <form action={remove} className="admin-delete">
                <label htmlFor="confirmName">
                  სამუდამოდ წასაშლელად აკრიფეთ:{' '}
                  <strong>{deleteConfirmWord}</strong>
                </label>
                <div className="admin-delete-row">
                  <input
                    id="confirmName"
                    name="confirmName"
                    type="text"
                    autoComplete="off"
                    placeholder="სახელი გვარი"
                    aria-describedby="delete-hint"
                  />
                  <button type="submit" className="admin-btn danger">
                    სამუდამოდ წაშლა
                  </button>
                </div>
                <p id="delete-hint" className="admin-delete-hint">
                  წაიშლება განაცხადიც და ატვირთული დოკუმენტებიც. დაბრუნება ვერ
                  მოხერხდება — თუ მხოლოდ სიიდან მალვა გსურთ, გამოიყენეთ
                  „დაარქივება“.
                </p>
              </form>
            </div>
            <p style={{ color: '#8a93a8', fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              წაშლა შეუქცევადია და ფაილებსაც წაშლის.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
