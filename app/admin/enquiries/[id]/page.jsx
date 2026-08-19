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

  // Capture the boolean, not the row: a server action's closure is serialised
  // the same way props are, and an SDK object cannot cross that boundary.
  const isArchived = enquiry.archived;

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
    await deleteFiles(fileIds);
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

      <h1 className="admin-title">{enquiry.name}</h1>
      <p className="admin-subtitle">
        მიღებულია {formatDate(enquiry.$createdAt)}
        {enquiry.archived ? ' · დაარქივებული' : ''}
      </p>

      {query?.saved === '1' && <p className="admin-msg ok">შენახულია.</p>}

      <div className="admin-grid">
        <div>
          <div className="admin-panel">
            <h2>განაცხადის მონაცემები</h2>
            <dl className="admin-dl">
              <div>
                <dt>მშობელი</dt>
                <dd>{enquiry.name}</dd>
              </div>
              <div>
                <dt>ელფოსტა</dt>
                <dd>
                  <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>
                </dd>
              </div>
              <div>
                <dt>ტელეფონი</dt>
                <dd>
                  <a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a>
                </dd>
              </div>
              <div>
                <dt>ბავშვის ასაკი</dt>
                <dd>{enquiry.childAge || '—'}</dd>
              </div>
              <div>
                <dt>შეტყობინება</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{enquiry.message || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="admin-panel">
            <h2>ფაილები</h2>
            {files.length === 0 ? (
              <p style={{ color: '#8a93a8', margin: 0 }}>ფაილები არ არის მიმაგრებული.</p>
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
