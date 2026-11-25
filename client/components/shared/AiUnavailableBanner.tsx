'use client'

import { useEffect, useState } from 'react'
import { WifiOff, X } from 'lucide-react'

const AI_BASE = (process.env['NEXT_PUBLIC_AI_BACKEND_URL'] ?? 'http://localhost:8000').replace(/\/$/, '')

/**
 * Pings the AI backend's public health endpoint and reports reachability.
 * null = not yet checked, true = healthy, false = unreachable/unhealthy.
 * Re-checks every 30s so the banner clears itself once the service recovers.
 */
function useAiBackendHealth(): boolean | null {
  const [healthy, setHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(`${AI_BASE}/healthz`, { signal: AbortSignal.timeout(4000) })
        if (!cancelled) setHealthy(res.ok)
      } catch {
        if (!cancelled) setHealthy(false)
      }
    }

    void check()
    const id = window.setInterval(check, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return healthy
}

/**
 * A dismissable notice when the AI backend is unreachable, so Hana's surfaces
 * (Ask Hana, Learn with Hana, AI coaches, the AI Examiner) fail with an
 * explanation instead of endless skeletons. Port of SMEEP's. Renders nothing
 * while unknown or healthy.
 */
export function AiUnavailableBanner() {
  const healthy = useAiBackendHealth()
  const [dismissed, setDismissed] = useState(false)

  if (healthy !== false || dismissed) return null

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
      <div className="flex-1 text-xs text-amber-900 dark:text-amber-100">
        <p className="font-semibold">Hana is temporarily unavailable</p>
        <p className="mt-0.5">
          The AI assistant can&apos;t be reached right now, so Hana and the AI coaches won&apos;t respond. Courses,
          offers and events all still work. Please try the AI features again in a few minutes.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 text-amber-700 transition-colors hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
