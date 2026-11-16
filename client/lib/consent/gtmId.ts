/** A Google Tag Manager web container id, e.g. GTM-54W3N48W. */
const GTM_ID = /^GTM-[A-Z0-9]{4,10}$/

/**
 * Retired per-site containers (SMEEP, Hadafi, AI Amplify). All Potential.org
 * sites use the shared Main container (GTM-54W3N48W); these must never load.
 */
const RETIRED = new Set(['GTM-NGQNTZJ', 'GTM-5C9G6FPK', 'GTM-PCDGSJLR'])

/**
 * The container id if it is well formed, else null. Anything else (unset,
 * empty, a GA4 or Ads id, a retired container, stray markup) counts as "GTM
 * off": no script, no banner. The id ends up in a script URL, so only this
 * exact shape is allowed.
 */
export function validGtmId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return GTM_ID.test(id) && !RETIRED.has(id) ? id : null
}
