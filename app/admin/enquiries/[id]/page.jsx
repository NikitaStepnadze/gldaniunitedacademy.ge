import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { isAuthenticated } from '../../../../lib/appwrite/auth';
import {
  deleteEnquiry,
  getEnquiry,
  STATUSES,
  STATUS_LABELS,
  updateEnquiry,
} from '../../../../lib/appwrite/enquiries';
import { deleteFiles, getFilesMeta } from '../../../../lib/appwrite/files';

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

  const files = await getFilesMeta(enquiry.fileIds ?? []);

  // The child's photo is stored in its own column so it can be shown as a
  // portrait rather than as one more row in the attachment list.
  const [photo] = enquiry.photoId ? await getFilesMeta([enquiry.photoId]) : [];

  // Registrations carry the child's and parents' details; contact enquiries do
  // not, and their extra rows would all read "—".
  const isRegistration = enquiry.source === 'registration';

  const childName = `${enquiry.childFirstName} ${enquiry.childLastName}`.trim();

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

  async function toggleArchive() {
    'use server';

    await updateEnquiry(id, { archived: !isArchived });
    revalidatePath('/admin/enquiries');
    redirect('/admin/enquiries');
  }

  /** Removes the row and any files it owned, so nothing is orphaned. */
  async function remove() {
    'use server';

    const fileIds = await deleteEnquiry(id);
    // photoId is not part of fileIds, so it needs deleting explicitly or the
    // child's photo would outlive the application it belonged to.
    await deleteFiles([...fileIds, photoId].filter(Boolean));
    revalidatePath('/admin/enquiries');
    redirect('/admin/enquiries');
  }

  return (
    <main className="admin-main">
      <Link
        href="/admin/enquiries"
        className="admin-btn secondary"
        style={{ marginBottom: 18 }}
      >
        ← სიაში დაბრუნება
      </Link>

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

      <div className="admin-grid">
        <div>
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

          {photo && (
            <div className="admin-panel">
              <h2>ბავშვის ფოტო</h2>
              {/*
                Served through the admin file proxy, not from Appwrite directly:
                the bucket grants no public read, deliberately, because these are
                children's photos. A plain <img> is used rather than next/image
                because the proxy route is admin-authenticated and the optimiser
                would need its own access to fetch the source.
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
              <p style={{ color: '#8a93a8', margin: '8px 0 0', fontSize: 13 }}>
                {photo.name} · {formatSize(photo.size)}
              </p>
            </div>
          )}

          {/*
            On a registration this list is form 100 -- the only document the
            form collects -- so it is named rather than left as "files". A
            missing one is called out instead of shown as an empty list,
            because the form requires it and its absence means something.
          */}
          <div className="admin-panel">
            <h2>{isRegistration ? 'ფორმა 100' : 'ფაილები'}</h2>
            {files.length === 0 ? (
              <p style={{ color: isRegistration ? '#c0392b' : '#8a93a8', margin: 0 }}>
                {isRegistration ? 'ფორმა 100 არ არის მიმაგრებული.' : 'ფაილები არ არის მიმაგრებული.'}
              </p>
            ) : (
              <ul className="file-list">
                {files.map((file) => (
                  <li key={file.id}>
                    <span>{file.mimeType === 'application/pdf' ? '📄' : '🖼️'}</span>
                    <a href={`/api/admin/files/${file.id}`} target="_blank" rel="noreferrer">
                      {file.name}
                    </a>
                    <span className="file-size">{formatSize(file.size)}</span>
                  </li>
                ))}
              </ul>
            )}
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
              <form action={toggleArchive}>
                <button type="submit" className="admin-btn secondary">
                  {enquiry.archived ? 'არქივიდან დაბრუნება' : 'დაარქივება'}
                </button>
              </form>
              <form action={remove}>
                <button type="submit" className="admin-btn danger">
                  სამუდამოდ წაშლა
                </button>
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
