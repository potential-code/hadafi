'use client'

import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { HanaExaminer } from '@/components/examiner/HanaExaminer'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent and thread bind inside HanaExaminer.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

/**
 * The AI Examiner: Hana as a customer of the learner's business, marked
 * against one of her courses. Full-bleed, same provider pattern as Ask Hana.
 */
export default function AiExaminerPage() {
  // Signed-in only: wait for the minted service token before mounting the
  // CopilotKit provider (its first request needs auth).
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout fullBleed>
        <div className="min-h-0 flex-1 bg-ui-bg" aria-busy="true" />
      </DashboardLayout>
    )
  }

  return (
    <CopilotKit
      runtimeUrl={VOICE_RUNTIME_URL}
      /* Resolved object, not the function: the core's /info fetch doesn't
         resolve function-form headers. Safe: mounted after the token is cached. */
      headers={getCopilotHeaders()}
      /* Multi-route handler: not single-endpoint mode, or /info 404s. */
      useSingleEndpoint={false}
      enableInspector={false}
      showDevConsole={false}
    >
      <DashboardLayout fullBleed>
        <HanaExaminer />
      </DashboardLayout>
    </CopilotKit>
  )
}
