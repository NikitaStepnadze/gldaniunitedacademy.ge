import Link from 'next/link';

import { isAuthenticated } from '../../lib/appwrite/auth';

/**
 * Admin shell.
 *
 * The nav bar is only rendered for a signed-in admin; the login page renders
 * inside this shell too, before a session exists. Each admin page still checks
 * the session itself -- this shell decides what to *show*, never what to
 * allow, so a missed check here cannot expose data on its own.
 */
const LINKS = [
  { href: '/admin/enquiries', label: 'განაცხადები' },
  { href: '/admin/content', label: 'ტექსტები' },
  { href: '/admin/design', label: 'ფერები' },
];

export default async function AdminShell({ children }) {
  const signedIn = await isAuthenticated();

  return (
    <div className="admin">
      {signedIn && (
        <header className="admin-bar">
          <span className="admin-brand">GUA ადმინი</span>
          <nav className="admin-nav">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="admin-btn secondary">
              გასვლა
            </button>
          </form>
        </header>
      )}
      {children}
    </div>
  );
}
