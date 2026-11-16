'use client'

import { cn } from '@/lib/utils'
import { consentStore, type ConsentStore } from '@/lib/consent/store'
import { useConsentState } from './CookieConsent'

/**
 * "Cookie settings" for footers: reopens the cookie banner. Renders nothing
 * while GTM is off, so the site looks exactly as before.
 */
export function CookieSettingsLink({ className, store = consentStore }: { className?: string; store?: ConsentStore }) {
  const { gtmId, tracked } = useConsentState(store)
  if (!gtmId || !tracked) return null
  return (
    <button
      type="button"
      onClick={(e) => store.openSettings(e.currentTarget)}
      className={cn(
        'rounded-sm text-start hover:text-ui-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
        className,
      )}
    >
      Cookie settings
    </button>
  )
}
