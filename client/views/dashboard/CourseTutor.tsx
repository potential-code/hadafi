'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'
import { HanaTutor } from '@/components/tutor/HanaTutor'
import { getUser } from '@/lib/auth'

// The multi-route CopilotKit v2 runtime (/info, /transcribe, /agent/:id/run),
// the one that serves potential-ai's smeepTutor graph.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

/**
 * Multi Learning on a course: Hana teaches it in conversation
 * (/dashboard/courses/:id/hana). Same provider pattern as Ask Hana.
 */
export default function CourseTutorPage() {
  const params = useParams<{ id: string }>()
  const courseId = params?.id ?? ''
  const copilotReady = useCopilotTokenReady()
  const [firstName, setFirstName] = useState('there')
  useEffect(() => setFirstName((getUser()?.fullName ?? '').trim().split(/\s+/)[0] || 'there'), [])

  if (!copilotReady || !courseId) {
    return (
      <DashboardLayout fullBleed>
        <div className="min-h-0 flex-1 bg-ui-bg" aria-busy="true" />
      </DashboardLayout>
    )
  }

  return (
    <CopilotKit
      /* A new course address is a new conversation. */
      key={courseId}
      runtimeUrl={VOICE_RUNTIME_URL}
      /* Resolved object, not a function: the runtime-info request doesn't
         resolve function-form headers. Safe: mounted after the token is cached. */
      headers={getCopilotHeaders()}
      useSingleEndpoint={false}
      enableInspector={false}
      showDevConsole={false}
    >
      <DashboardLayout fullBleed>
        <HanaTutor courseId={courseId} firstName={firstName} />
      </DashboardLayout>
    </CopilotKit>
  )
}
