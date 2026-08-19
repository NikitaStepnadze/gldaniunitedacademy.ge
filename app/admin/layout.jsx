import AdminShell from './AdminShell';

import './admin.css';

/**
 * Root layout for the admin panel.
 *
 * The admin section has its own <html>/<body> rather than inheriting the
 * public site's, so none of the theme's 19 stylesheets or its jQuery bundle
 * are loaded here. That keeps Bootstrap from fighting the admin styling and
 * saves the admin from downloading a megabyte of assets it never uses.
 *
 * `force-dynamic` matters: these pages read a session cookie and live data,
 * neither of which may be captured into a static build.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ადმინი | გლდანი იუნაითედ აკადემია',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }) {
  return (
    <html lang="ka">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
