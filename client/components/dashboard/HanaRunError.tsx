'use client'

/**
 * Visible failure state for Hana's agent runs (ported from SMEEP). Without
 * it, a failed run (AI backend down, network drop) dies silently: CopilotKit
 * logs `agent_run_error_event` to the console and the thread never answers.
 *
 * `useHanaRunError(copilotkit, agent)` listens for run errors: an error shows
 * the notice, the next run start clears it. Retry re-runs the agent; the
 * learner's message is already in the local thread, so nothing is lost.
 */

import { useEffect, useState } from 'react'
import { RotateCw, WifiOff } from 'lucide-react'

// Error codes that mean "the run never produced a reply". Anything else
// recovers on its own and shouldn't alarm the learner.
const RUN_DEAD_CODES = new Set(['agent_run_failed_event', 'agent_run_error_event', 'agent_not_found'])

type SubscribableCore = {
  subscribe?: (subscriber: { onError?: (event: { code?: string }) => void }) => { unsubscribe?: () => void } | undefined
} | null | undefined

type SubscribableAgent = {
  subscribe?: (subscriber: Record<string, () => void>) => { unsubscribe?: () => void } | undefined
} | null | undefined

export function useHanaRunError(copilotkit: unknown, agent?: unknown): [boolean, (failed: boolean) => void] {
  const [failed, setFailed] = useState(false)

  // Failures surface on the CopilotKit core subscriber; agent-level
  // subscribers don't receive run error events.
  useEffect(() => {
    const core = copilotkit as SubscribableCore
    if (!core?.subscribe) return
    const sub = core.subscribe({
      onError: (event) => {
        if (RUN_DEAD_CODES.has(String(event?.code ?? ''))) setFailed(true)
      },
    })
    return () => sub?.unsubscribe?.()
  }, [copilotkit])

  // Clear on the next run start.
  useEffect(() => {
    const a = agent as SubscribableAgent
    if (!a?.subscribe) return
    const sub = a.subscribe({ onRunStartedEvent: () => setFailed(false) })
    return () => sub?.unsubscribe?.()
  }, [agent])

  return [failed, setFailed]
}

export function HanaConnectionNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[96px] z-[6] flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex items-center gap-3 rounded-[10px] border px-3.5 py-2 shadow-ui"
        style={{
          borderColor: 'color-mix(in srgb, var(--hana-warn, #87490f) 25%, transparent)',
          background: 'var(--hana-warn-bg, #fbefe2)',
          animation: 'hana-fadeup 0.24s ease both',
        }}
      >
        <WifiOff className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--hana-warn, #87490f)' }} aria-hidden />
        <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--hana-warn, #87490f)' }}>
          Hana couldn&rsquo;t reply just now. Please try again in a moment.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-ui-line bg-ui-surface px-3 text-[13px] font-semibold text-ui-text transition-colors hover:bg-ui-surface-2"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
