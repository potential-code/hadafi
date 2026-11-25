/**
 * Cleans a lesson body as it is saved (admin course editor, POST and PATCH
 * of a learning block), so stored lesson HTML can't carry script whatever
 * renders it later. The site renders a body as HTML when it contains a tag
 * (client/components/lms/RichContent.tsx, the same test as here) and cleans
 * it again there with DOMPurify; otherwise it renders it as Markdown, which
 * shows raw HTML as text. So a body with a tag goes through DOMPurify (the
 * same library and default rules as the site); one without is Markdown and
 * is kept exactly as written (cleaning would escape its > and &).
 *
 * DOMPurify needs a DOM on the server (jsdom, through isomorphic-dompurify);
 * it is loaded on the first save, not at boot.
 */

/** The site's rule for "this body is HTML" (RichContent.tsx). */
const HTML_TAG_RE = /<[a-zA-Z][^>]*>/;

type Purifier = { sanitize: (html: string) => string };
let purifier: Promise<Purifier> | null = null;

const loadPurifier = (): Promise<Purifier> => {
  purifier ??= import("isomorphic-dompurify").then((m) => (m.default ?? m) as Purifier);
  return purifier;
};

export async function cleanLessonBody<T extends string | null | undefined>(body: T): Promise<T> {
  if (typeof body !== "string" || !HTML_TAG_RE.test(body.trim())) return body;
  const DOMPurify = await loadPurifier();
  return DOMPurify.sanitize(body) as T;
}
