'use client'

/**
 * Tool-call plumbing shared by the admin AI pages.
 *
 * One request must produce one effect, and neither CopilotKit nor the graphs
 * guarantee that: a reconnect re-executes the thread's outstanding tool calls,
 * the graphs do not always echo the tool result back, and StrictMode doubles
 * the connect effect. So every handler runs through `runOnce`, keyed on the
 * AG-UI tool-call id, at MODULE scope (a ref would be duplicated by the
 * StrictMode double mount). A replay collapses onto the first call's promise.
 *
 * Settlement is read off the same map: CopilotKit only reports a call
 * `complete` once a matching tool message is in the thread, which these graphs'
 * snapshots drop, so a chip trusting `status` alone would spin for ever.
 */
import { useEffect, useState } from 'react'

const results = new Map<string, Promise<string>>()
const settled = new Set<string>()
const MAX_TRACKED = 300
const FALLBACK_TTL_MS = 30_000

/** `toolCall.id` when CopilotKit supplies it, otherwise a canonical-args key. */
export function toolCallKey(toolCallId: string | undefined, fallback: string): { key: string; stable: boolean } {
  return toolCallId ? { key: `call:${toolCallId}`, stable: true } : { key: `fallback:${fallback}`, stable: false }
}

export function runOnce(key: string, stable: boolean, run: () => Promise<string>): Promise<string> {
  const existing = results.get(key)
  if (existing) return existing
  const promise = run()
  results.set(key, promise)
  void promise
    .catch(() => undefined)
    .then(() => {
      settled.add(key)
      if (!stable) setTimeout(() => results.delete(key), FALLBACK_TTL_MS)
    })
  if (results.size > MAX_TRACKED) {
    const oldest = results.keys().next()
    if (!oldest.done && oldest.value !== key) {
      results.delete(oldest.value)
      settled.delete(oldest.value)
    }
  }
  return promise
}

const isComplete = (status: unknown) => String(status) === 'complete'

/** Whether a tool call has finished, from the renderer's point of view. */
export function useToolCallSettled(toolCallId: string, status?: unknown): boolean {
  const key = `call:${toolCallId}`
  const [done, setDone] = useState(() => isComplete(status) || settled.has(key))

  useEffect(() => {
    if (done) return
    if (isComplete(status) || settled.has(key)) {
      setDone(true)
      return
    }
    let cancelled = false
    // The handler may not have started yet when the card first renders
    // (arguments stream in first), so poll briefly for its promise.
    const attach = () => {
      const pending = results.get(key)
      if (!pending) return false
      void pending
        .catch(() => undefined)
        .then(() => {
          if (!cancelled) setDone(true)
        })
      return true
    }
    if (attach()) return () => void (cancelled = true)
    const timer = window.setInterval(() => {
      if (attach()) window.clearInterval(timer)
    }, 200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [done, status, key])

  return done
}

/**
 * A tool must never throw into the chat: CopilotKit shows the error in a
 * banner and abandons the reply. Anything unexpected goes back to the model as
 * text it can act on.
 */
export function guarded<A extends unknown[]>(
  handler: (...args: A) => Promise<string>,
  tool: string,
): (...args: A) => Promise<string> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      console.error(`[admin-ai] ${tool} failed`, error)
      return `${tool} failed: ${error instanceof Error ? error.message : String(error)}. Check the arguments and try again, or answer without it.`
    }
  }
}
