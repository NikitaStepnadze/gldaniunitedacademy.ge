/**
 * Imports the original Zunzo static HTML into the Next.js app.
 *
 * The goal is a byte-for-byte faithful rendering: the body markup of each
 * source page is extracted verbatim and stored as an HTML fragment, plus a
 * manifest recording that page's stylesheet/script list and body classes.
 * Nothing is rewritten or "modernised" -- that is what keeps the rendered
 * output pixel-identical to the template.
 *
 * Run with: npm run sync:html
 */

import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'zunzo-package', 'zunzo');
const OUT = path.join(ROOT, 'content', 'pages');

/** Source file -> route segment. `index` becomes the root route. */
const ROUTES = {
  'index.html': 'index',
  'homev2.html': 'homev2',
  'homev3.html': 'homev3',
  'about.html': 'about',
  'blog.html': 'blog',
  'blog-single.html': 'blog-single',
  'check-out.html': 'check-out',
  'contact.html': 'contact',
  'event.html': 'event',
  'event-details.html': 'event-details',
  'shop-list.html': 'shop-list',
  'shop-detail.html': 'shop-detail',
  'view-cart.html': 'view-cart',
  'wishlist.html': 'wishlist',
};

/**
 * Scripts guarded by `<!--[if lt IE 9]>` conditional comments. These never
 * executed in any browser the site actually targets, so they are dropped
 * rather than promoted into real script tags.
 */
const IE_ONLY_SCRIPTS = new Set(['html5shiv.js', 'respond.min.js']);

/** Asset folders copied verbatim into public/. */
const ASSET_DIRS = ['images', 'fonts', 'icon', 'stylesheets', 'javascript'];

/**
 * Rewrites in-page links from the template's flat `.html` filenames to the
 * app's routes, and makes asset references root-absolute. Purely a URL
 * rewrite -- no markup, class or attribute is touched, so rendering is
 * unaffected.
 */
function rewriteUrls(markup) {
  return (
    markup
      // href="about.html#foo" -> href="/about#foo"; index.html -> "/"
      .replace(/href="([a-z0-9-]+)\.html(#[^"]*)?"/gi, (whole, name, hash = '') => {
        const route = ROUTES[`${name}.html`];
        if (!route) return whole;
        return `href="${route === 'index' ? '/' : `/${route}`}${hash}"`;
      })
      // src/href/data-* pointing at the copied asset folders
      .replace(
        /(\b(?:src|href|data-src|data-zoom|data-image|poster)=")(?!https?:|\/\/|\/|#|data:|mailto:|tel:)(images|fonts|icon|javascript|stylesheets)\//gi,
        '$1/$2/'
      )
      // srcset entries share the same relative asset roots
      .replace(/(\bsrcset=")([^"]*)"/gi, (whole, prefix, value) => {
        const fixed = value.replace(
          /(^|,\s*)(?!https?:|\/\/|\/|data:)(images|fonts|icon)\//g,
          '$1/$2/'
        );
        return `${prefix}${fixed}"`;
      })
      // inline style backgrounds, e.g. style="background-image:url(images/x.jpg)"
      .replace(
        /url\((['"]?)(?!https?:|\/\/|\/|data:)(images|fonts|icon)\//gi,
        'url($1/$2/'
      )
  );
}

function extractBody(html) {
  const open = html.match(/<body([^>]*)>/i);
  if (!open) throw new Error('no <body> tag found');
  const start = open.index + open[0].length;
  const end = html.lastIndexOf('</body>');
  if (end === -1) throw new Error('no </body> tag found');

  const attrs = open[1];
  const classMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/i);

  return {
    bodyClass: classMatch ? classMatch[1] : '',
    // Strip the trailing script block: those are re-emitted by the layout in
    // their original order via next/script, so they must not appear inline.
    inner: html.slice(start, end).replace(/\s*<script\b[^>]*>[\s\S]*?<\/script>\s*$/i, '\n'),
  };
}

function extractAssets(html) {
  const styles = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi)].map((m) => m[1]);

  // `type` matters: the theme ships model-viewer and zoom.js as ES modules,
  // and loading them as classic scripts throws on their `export`/`import`.
  const scripts = [...html.matchAll(/<script([^>]*?)\ssrc=["']([^"']+\.js)["']([^>]*)>/gi)]
    .map((m) => {
      const attrs = m[1] + m[3];
      const type = attrs.match(/\stype\s*=\s*["']([^"']+)["']/i);
      return { src: m[2], type: type ? type[1] : null };
    })
    .filter(({ src }) => !IE_ONLY_SCRIPTS.has(path.basename(src)));

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();

  return { styles, scripts, title };
}

/**
 * Copies the theme's assets to public/ under their original folder names.
 * The layout must be preserved because the stylesheets reference each other
 * and their fonts/images by relative path (e.g. icon/icomoon/style.css ->
 * fonts/icomoon.woff, style.css -> ../images/retinal/1.jpg).
 */
async function copyAssets() {
  for (const dir of ASSET_DIRS) {
    await cp(path.join(SRC, dir), path.join(ROOT, 'public', dir), { recursive: true });
    console.log(`  copy  ${dir}/ -> public/${dir}/`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await copyAssets();

  const files = (await readdir(SRC)).filter((f) => f.endsWith('.html'));
  const manifest = {};

  for (const file of files) {
    const route = ROUTES[file];
    if (!route) {
      console.warn(`  skip  ${file} (no route mapping)`);
      continue;
    }

    // The template is CRLF. React normalises CR out of the markup string when
    // it serialises it into the client payload, so a CRLF fragment would make
    // the server HTML and the client's copy differ and hydration would fail.
    // Normalising here keeps both sides on the same string.
    const html = (await readFile(path.join(SRC, file), 'utf8')).replace(/\r\n/g, '\n');
    const { bodyClass, inner } = extractBody(html);
    const { styles, scripts, title } = extractAssets(html);

    // Asset hrefs are relative in the source ("stylesheets/style.css") but the
    // app serves them from the public root, so they become absolute.
    const absolute = (p) => '/' + p.replace(/^\.?\//, '');

    await writeFile(path.join(OUT, `${route}.html`), rewriteUrls(inner), 'utf8');

    manifest[route] = {
      source: file,
      title,
      bodyClass,
      styles: styles.map(absolute),
      scripts: scripts.map(({ src, type }) => ({ src: absolute(src), type })),
    };

    console.log(
      `  ok    ${file} -> ${route} (${styles.length} css, ${scripts.length} js, body.${bodyClass || '-'})`
    );
  }

  // The theme's stylesheets are emitted from the document <head> in the root
  // layout rather than per page. React 19 treats <link rel="stylesheet"> as a
  // hoistable resource: it renders in place during SSR but is moved into
  // <head> on the client, which mismatches on hydration. Collecting them here
  // keeps them out of the hydrated tree entirely.
  //
  // The union is safe to load everywhere: 17 of the 19 files are already
  // shared by all pages, and the two page-specific ones (nouislider,
  // photoswipe) are fully namespaced under `.noUi-` / `.pswp`, so they have no
  // effect on pages that do not use those plugins. Order is preserved from the
  // pages that do use them, which is what the cascade depends on.
  const globalStyles = [];
  for (const { styles } of Object.values(manifest)) {
    styles.forEach((href, i) => {
      if (globalStyles.includes(href)) return;
      // keep each new sheet next to the one it followed in its own page
      const prev = i > 0 ? globalStyles.indexOf(styles[i - 1]) : -1;
      if (prev >= 0) globalStyles.splice(prev + 1, 0, href);
      else globalStyles.push(href);
    });
  }

  // Our own overrides are not part of the imported theme, so nothing above
  // discovers them. Appending here keeps them last in the cascade -- which is
  // the point of the file -- and keeps them from being dropped on re-import.
  globalStyles.push('/stylesheets/custom.css');

  // Scripts are emitted from <head> in the root layout for the same reason as
  // the stylesheets, and additionally because several of them bind to window's
  // `load` event and so must be in the document while it is still parsing.
  // The union is ordered the same way: every page's own sequence survives as a
  // subsequence, which is what the theme's load order depends on. The five
  // page-specific plugins are library registrations or are self-guarding
  // (zoom.js no-ops unless `.thumbs-slider` exists), so loading them site-wide
  // changes no behaviour.
  const globalScripts = [];
  for (const { scripts } of Object.values(manifest)) {
    scripts.forEach(({ src, type }, i) => {
      if (globalScripts.some((s) => s.src === src)) return;
      const prevSrc = i > 0 ? scripts[i - 1].src : null;
      const prev = prevSrc ? globalScripts.findIndex((s) => s.src === prevSrc) : -1;
      if (prev >= 0) globalScripts.splice(prev + 1, 0, { src, type });
      else globalScripts.push({ src, type });
    });
  }

  await writeFile(
    path.join(ROOT, 'content', 'manifest.json'),
    JSON.stringify({ globalStyles, globalScripts, pages: manifest }, null, 2) + '\n',
    'utf8'
  );

  console.log(`\nImported ${Object.keys(manifest).length} pages.`);
  console.log(`Global stylesheets: ${globalStyles.length}, scripts: ${globalScripts.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
