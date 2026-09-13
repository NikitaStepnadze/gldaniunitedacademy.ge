import { notFound } from 'next/navigation';

import { getContentMap, getSettingsMap } from '../../../../lib/appwrite/content';
import {
  getProgramBySlug,
  getPublishedPrograms,
} from '../../../../lib/appwrite/programs';
import {
  applyContactSettings,
  applyContent,
  applyProgramDetail,
} from '../../../../lib/cms';
import { getPageMarkup } from '../../../../lib/pages';
import { renderProgramDetail } from '../../../../lib/programs-markup';

/**
 * One programme's own page.
 *
 * This is what turns a card into something worth linking to: every programme
 * is a crawlable URL with its own heading, description and body, instead of
 * three cards all pointing at the contact form.
 *
 * It does not go through <ThemePage> like the other routes. Those render a
 * fixed template whose only variable is the CMS map; this one is a template
 * plus one specific row, so it does the same substitutions itself and adds the
 * programme on top.
 */
export const revalidate = 3600;

/**
 * Pre-renders a page per published programme at build time.
 *
 * The list is small and changes rarely, so generating them is cheap and means
 * a visitor never waits for a cold render. A programme created afterwards
 * still works -- `dynamicParams` defaults to true, so an unknown slug is
 * rendered on demand and then cached.
 */
export async function generateStaticParams() {
  try {
    const programs = await getPublishedPrograms();
    return programs.map((program) => ({ slug: program.slug }));
  } catch {
    // A build that cannot reach Appwrite should still produce a site; the
    // pages are then rendered on demand instead.
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const program = await getProgramBySlug(decodeURIComponent(slug));

  if (!program) return { title: 'პროგრამა ვერ მოიძებნა' };

  const description = program.description?.trim();

  return {
    title: program.title,
    ...(description ? { description } : {}),
    alternates: { canonical: `/programs/${encodeURIComponent(program.slug)}` },
    openGraph: {
      title: program.title,
      ...(description ? { description } : {}),
      type: 'article',
      ...(program.image ? { images: [program.image] } : {}),
    },
  };
}

export default async function ProgramPage({ params }) {
  const { slug } = await params;

  /*
   * The segment arrives percent-encoded because the slugs are Georgian, and
   * what is stored is the decoded form. Decoding is wrapped: a malformed
   * escape sequence in a hand-typed URL throws URIError, which would surface
   * as a 500 on what is really just a page that does not exist.
   */
  let decoded;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    notFound();
  }

  const program = await getProgramBySlug(decoded);
  if (!program) notFound();

  const markup = await getPageMarkup('program-detail');

  let content = {};
  let settings = {};
  try {
    [content, settings] = await Promise.all([getContentMap(), getSettingsMap()]);
  } catch (error) {
    console.error('[cms] content unavailable, using theme defaults:', error.message);
  }

  // Same order as ThemePage: the CMS overrides and the contact details apply to
  // the chrome this template shares with every other page, and the programme is
  // substituted into the hole they leave alone.
  const html = applyProgramDetail(
    applyContactSettings(applyContent(markup, content), settings),
    { title: program.title, detailHtml: renderProgramDetail(program) }
  );

  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
