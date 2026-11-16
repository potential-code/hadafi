'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { btn } from '@/components/kit'
import { LEGAL_LINKS } from '@/components/landing/legal'
import { validGtmId } from '@/lib/consent/gtmId'
import { consentStore, type ConsentStore } from '@/lib/consent/store'

export function useConsentState(store: ConsentStore = consentStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}

let configRequested = false

/**
 * Mounted once in the root layout. Asks /public-config for the GTM container
 * id; with none (the kill switch) it does nothing at all. Otherwise it sets
 * Consent Mode to denied, loads GTM and asks for a choice.
 */
export function CookieConsent() {
  const pathname = usePathname() ?? '/'
  useEffect(() => {
    if (configRequested) return
    configRequested = true
    fetch('/public-config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { gtmId?: unknown } | null) => consentStore.configure(validGtmId(cfg?.gtmId)))
      .catch(() => consentStore.configure(null))
  }, [])
  return <CookieBannerView store={consentStore} pathname={pathname} />
}

/**
 * The banner itself. Not a modal: a card at the bottom of the screen, the
 * page stays usable. Accept and Reject are styled the same.
 */
export function CookieBannerView({ store, pathname }: { store: ConsentStore; pathname: string }) {
  const { gtmId, open, tracked } = useConsentState(store)
  const ref = useRef<HTMLElement>(null)
  const wasOpen = useRef(open)

  useEffect(() => {
    // The query string matters too: a page whose URL carries a token is never
    // tracked (isTrackedUrl). Query-only changes are caught by the history
    // guard GTM is loaded with.
    const extra = typeof window === 'undefined' ? '' : window.location.search + window.location.hash
    store.enterPath(pathname + extra)
  }, [store, pathname, gtmId])

  // Reopened from Cookie settings: move focus into the banner. Not on a first
  // visit, where taking focus from the page would get in the way.
  useEffect(() => {
    if (open && !wasOpen.current && store.getState().choice !== null) ref.current?.querySelector('button')?.focus()
    wasOpen.current = open
  }, [open, store])

  if (!gtmId || !open || !tracked) return null
  return (
    <section
      ref={ref}
      role="region"
      aria-label="Cookie consent"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && store.getState().choice !== null) store.closeBanner()
      }}
      // z-40: above the header and learner tab bar (z-30), below the menu sheet
      // (z-50) and search dialog (z-[60]). On phones in the learner area it
      // sits above the tab bar instead of covering it.
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-lg:[body:has([data-app-tabbar])_&]:bottom-[calc(64px+env(safe-area-inset-bottom))] max-w-[560px] rounded-[14px] border border-ui-line bg-ui-surface p-4 text-ui-text shadow-ui min-[640px]:inset-x-auto min-[640px]:start-auto min-[640px]:end-4"
    >
      <p className="text-start text-sm leading-[1.55] text-ui-muted">
        We use cookies to measure our campaigns and improve the site. You can change this at any time in Cookie
        settings.{' '}
        <a
          href={LEGAL_LINKS.privacy}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm font-medium text-ui-brand-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
        >
          Privacy Policy
        </a>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => store.reject()} className={btn({ variant: 'secondary', size: 'md' }) + ' flex-1'}>
          Reject
        </button>
        <button type="button" onClick={() => store.accept()} className={btn({ variant: 'secondary', size: 'md' }) + ' flex-1'}>
          Accept
        </button>
      </div>
    </section>
  )
}
