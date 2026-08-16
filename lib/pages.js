import { readFile } from 'node:fs/promises';
import path from 'node:path';

import manifest from '../content/manifest.json' with { type: 'json' };

const CONTENT_DIR = path.join(process.cwd(), 'content', 'pages');

/** Stylesheets shared by the whole site, in cascade order. */
export const globalStyles = manifest.globalStyles;

/** Theme scripts, in load order, covering every page. */
export const globalScripts = manifest.globalScripts;

export function getPageMeta(route) {
  const meta = manifest.pages[route];
  if (!meta) throw new Error(`Unknown page route: ${route}`);
  return meta;
}

/** Returns the page's body markup exactly as it appears in the template. */
export async function getPageMarkup(route) {
  getPageMeta(route);
  return readFile(path.join(CONTENT_DIR, `${route}.html`), 'utf8');
}
