/**
 * Root layout for the admin's preview frame.
 *
 * The preview is its own route group, and therefore its own root, on purpose.
 * It renders the public site's document -- the theme's stylesheets, the theme's
 * scripts, `header-sticky` on the body -- and must not inherit the admin
 * layout, which supplies an <html>/<body> of its own and loads admin.css.
 * Nested inside the admin tree it produced invalid markup, React logged
 * "You are mounting a new <html> when a previous one has not first unmounted",
 * and the admin stylesheet leaked in, so the frame stopped resembling the page
 * it was meant to be previewing.
 *
 * The stylesheets and scripts are emitted here, in <head>, for the same two
 * reasons as the public layout: React 19 relocates hoistable <link>/<script>
 * rendered inside the page tree, which shows up as a hydration mismatch, and
 * several theme scripts bind to window's `load` and must be in the document
 * while it parses.
 */
import { globalScripts, globalStyles } from '../../lib/pages';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'გადახედვა',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function PreviewRootLayout({ children }) {
  return (
    <html lang="ka">
      <head>
        <link rel="preload" as="image" href="/gua_nobg.png" />
        {globalStyles.map((href) => (
          // eslint-disable-next-line @next/next/no-css-tags
          <link key={href} rel="stylesheet" type="text/css" href={href} />
        ))}
        {globalScripts.map(({ src, type }) =>
          type === 'module' ? (
            <script key={src} src={src} type="module" />
          ) : (
            // eslint-disable-next-line @next/next/no-sync-scripts
            <script key={src} src={src} defer />
          )
        )}
      </head>
      <body className="header-sticky">{children}</body>
    </html>
  );
}
