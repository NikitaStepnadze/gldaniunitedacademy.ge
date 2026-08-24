import { redirect } from 'next/navigation';

import { isAuthenticated } from '../../../lib/appwrite/auth';
import { listContentRows } from '../../../lib/appwrite/content';

import ContentEditor from './ContentEditor';

export const dynamic = 'force-dynamic';

/**
 * The text and photo editor.
 *
 * Everything interactive lives in ContentEditor, a client component: the
 * preview has to update as the admin types, which needs state in the browser.
 * This page's job is only to check the session and hand over the rows.
 *
 * The rows are already plain objects (see toPlainRow) -- an Appwrite row
 * cannot cross into a client component as-is.
 */
export default async function ContentPage() {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const rows = await listContentRows();

  return (
    <main className="admin-main wide">
      <header className="admin-head">
        <h1 className="admin-title">ტექსტები და ფოტოები</h1>
        <p className="admin-subtitle">
          აირჩიეთ გვერდი, შეცვალეთ ტექსტი ან სურათი და იხილეთ შედეგი გვერდის
          გადახედვაში. ცვლილება საიტზე მხოლოდ შენახვის შემდეგ აისახება.
          ცარიელი ველი ნიშნავს, რომ დარჩება საწყისი ტექსტი.
        </p>
      </header>

      <ContentEditor rows={rows} />
    </main>
  );
}
