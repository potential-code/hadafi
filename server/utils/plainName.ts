/**
 * A name typed into a public form, made safe to print in an email we send to
 * the address that was typed in. Handlebars already escapes HTML, but a mail
 * client still turns "Ahmed visit evil.example/pay" into a live link, so a
 * public form could be used to send our branded email carrying someone
 * else's link. This keeps the words of the name and drops:
 * - HTML tags and markup characters (< > [ ] { } ` and the like),
 * - anything that reads as a link or address: a scheme ("https://",
 *   "javascript:"), "www.", an email address, or a domain-like word
 *   ("evil.example", "bit.ly/x"),
 * - control and bidirectional-override characters.
 * Returns "" when nothing is left; callers fall back to a greeting without a name.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const DOMAIN_LIKE = /[\p{L}\p{N}-]{2,}\.[\p{L}]{2,}/u
// Control, soft-hyphen, zero-width, line/paragraph-separator and bidi-override
// characters (built from code points so none of them sits in this source file).
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff],
]
const hex4 = (c: number) => '\\u' + c.toString(16).padStart(4, '0')
const INVISIBLE = new RegExp(`[${INVISIBLE_RANGES.map(([a, b]) => `${hex4(a)}-${hex4(b)}`).join('')}]`, 'g')

function looksLikeLink(word: string): boolean {
  return (
    word.includes('://') ||
    word.includes('@') ||
    word.includes('/') ||
    word.includes('\\') ||
    SCHEME.test(word) ||
    /^www\./i.test(word) ||
    DOMAIN_LIKE.test(word)
  )
}

export function plainName(raw: string, max = 100): string {
  const text = raw
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/<[^>]*>?/g, ' ')
    // A scheme and everything after it up to the next space ("https://x/y)", "javascript:alert(1)").
    .replace(/[a-z][a-z0-9+.-]*:\S*/gi, ' ')
    .replace(/[<>[\]{}()`*_|#=~^"]/g, ' ')
  const words = text.split(/\s+/).filter((w) => w !== '' && !looksLikeLink(w))
  return words.join(' ').slice(0, max).trim()
}
