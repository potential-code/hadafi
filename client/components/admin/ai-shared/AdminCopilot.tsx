'use client'

/**
 * CopilotKit for the admin AI pages (AI Insights, AI Dashboard).
 *
 * Admin pages sit outside the learner `(dashboard)` layout, so there is no
 * AssistantProvider here: this mints the potential-ai service token the same
 * way the learner side does (`/api/account/copilot-token`, any signed-in user)
 * and only mounts the provider once it is cached, so the very first runtime
 * request already carries it.
 *
 * Endpoint: potential-ai's single-endpoint `/copilotkit` runtime. That router
 * is the one that hosts the `dataChat` and `dashboardBuilder` graphs and lifts
 * the `"__catalog__"` context entry into `configurable.catalog`; the
 * multi-route `/copilotkit-voice` runtime used by the learner surfaces does not
 * serve either agent.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import '@copilotkit/react-ui/v2/styles.css'
import '@/components/dashboard/hana-studio.css'
import { COPILOT_RUNTIME_URL, getCopilotHeaders, useCopilotTokenReady } from '@/components/dashboard/copilotConfig'

export function AdminCopilot({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const ready = useCopilotTokenReady()
  if (!ready) return <>{fallback ?? null}</>

  return (
    <CopilotKit
      runtimeUrl={COPILOT_RUNTIME_URL}
      /* A resolved object, not a function: the runtime-info request does not
         resolve function-form headers. The token hook re-renders on re-mint. */
      headers={getCopilotHeaders()}
      useSingleEndpoint
      enableInspector={false}
      showDevConsole={false}
    >
      {children}
    </CopilotKit>
  )
}

const NewConversationContext = createContext<() => void>(() => {})

/** Starts a fresh conversation: see `AdminCopilotSession`. */
export function useNewConversation(): () => void {
  return useContext(NewConversationContext)
}

/**
 * `AdminCopilot` plus "New chat". A new conversation remounts the provider,
 * which gives the agent a new thread id (the graph keeps state per thread)
 * and CopilotChat an empty transcript, with no hand-edited agent state.
 */
export function AdminCopilotSession({
  children,
  fallback,
  onNewConversation,
}: {
  children: ReactNode
  fallback?: ReactNode
  onNewConversation?: () => void
}) {
  const [session, setSession] = useState(0)
  const start = useCallback(() => {
    onNewConversation?.()
    setSession((n) => n + 1)
  }, [onNewConversation])

  return (
    <NewConversationContext.Provider value={start}>
      <AdminCopilot key={session} fallback={fallback}>
        {children}
      </AdminCopilot>
    </NewConversationContext.Provider>
  )
}
