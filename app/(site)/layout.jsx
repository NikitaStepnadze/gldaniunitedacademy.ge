import { getSettingsMap } from '../../lib/appwrite/content';
import { buildColorOverrides } from '../../lib/cms';
import { globalScripts, globalStyles } from '../../lib/pages';
import { SITE_URL } from '../../lib/site';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'გლდანი იუნაითედ აკადემია | საბავშვო საფეხბურთო აკადემია თბილისში',
    template: '%s | გლდანი იუნაითედ აკადემია',
  },
  description:
    'გლდანი იუნაითედ აკადემია — საბავშვო საფეხბურთო აკადემია თბილისში. ვამზადებთ 5-16 წლის ბავშვებს გამოცდილი მწვრთნელების ხელმძღვანელობით.',
  keywords: [
    'საფეხბურთო აკადემია',
    'ფეხბურთი ბავშვებისთვის',
    'გლდანი',
    'თბილისი',
    'საბავშვო სპორტი',
  ],
  openGraph: {
    type: 'website',
    locale: 'ka_GE',
    siteName: 'გლდანი იუნაითედ აკადემია',
    title: 'გლდანი იუნაითედ აკადემია',
    description:
      'საბავშვო საფეხბურთო აკადემია თბილისში, გლდანში. ასაკი 5-დან 16 წლამდე.',
    images: ['/images/logo-gua.png'],
  },
  icons: {
    icon: '/images/favicon-gua.png',
    shortcut: '/images/favicon-gua.png',
    apple: '/images/favicon-gua.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

/**
 * `header-sticky` is the body class every page of the theme carries; the
 * stylesheet and main.js both key off it, so it belongs on <body> here rather
 * than inside the per-page markup.
 *
 * The theme's stylesheets and scripts are both declared here, in <head>,
 * rather than inside the page tree. Two constraints force this:
 *
 *  - React 19 treats <link rel="stylesheet"> and <script src> rendered inside
 *    the page tree as hoistable resources and relocates them on the client,
 *    which surfaces as a hydration mismatch. Putting them in <head> keeps them
 *    out of the hydrated tree. They cannot go inside the page's
 *    dangerouslySetInnerHTML either: React's client-side copy of that string
 *    drops <script> elements, so server and client disagree.
 *  - Several theme scripts (count-down.js, main.js, swiper-bundle.min.js) bind
 *    to window's `load` event, so they must already be in the document while
 *    it is parsing. `defer` gives exactly that: document order, after parsing,
 *    before DOMContentLoaded -- matching the original template's behaviour.
 */
export default async function RootLayout({ children }) {
  // Colour overrides are emitted after the theme's stylesheets so they win
  // without !important. A settings outage just means the theme's own palette.
  let colorOverrides = null;
  try {
    colorOverrides = buildColorOverrides(await getSettingsMap());
  } catch (error) {
    console.error('[cms] settings unavailable, using theme palette:', error.message);
  }

  return (
    <html lang="ka">
      <head>
        {/*
          The crest is the first thing painted -- it is the preloader graphic,
          shown before any page content. Without this hint the browser does not
          discover it until it parses the ::before rule in custom.css, which is
          the last stylesheet in the cascade, so it lands visibly late on a cold
          load. Preloading it makes it decode alongside the stylesheets.
        */}
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
        {colorOverrides && (
          <style id="cms-colors" dangerouslySetInnerHTML={{ __html: colorOverrides }} />
        )}
      </head>
      <body className="header-sticky">{children}</body>
    </html>
  );
}
