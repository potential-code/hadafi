'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'
import { HanaTutor } from '@/components/tutor/HanaTutor'
import { isLearnerLanguage } from '@/components/tutor/strings'
import type { LearnerLanguage } from '@/components/tutor/api'
import { getUser } from '@/lib/auth'

// The multi-route CopilotKit v2 runtime (/info, /transcribe, /agent/:id/run),
// the one that serves potential-ai's smeepTutor graph.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

/** The learner's language for Learn with Hana, remembered in this browser. */
const LANG_KEY = 'hadafi.tutor.lang'
function savedLang(): LearnerLanguage {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return isLearnerLanguage(v) ? v : 'en'
  } catch {
    return 'en'
  }
}

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
  // Read after mount (no localStorage on the server render).
  const [lang, setLang] = useState<LearnerLanguage | null>(null)
  useEffect(() => setLang(savedLang()), [])
  const onLanguageChange = useCallback((next: LearnerLanguage) => {
    setLang(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* storage blocked: the language simply isn't remembered */
    }
  }, [])

  if (!copilotReady || !courseId || !lang) {
    return (
      <DashboardLayout fullBleed>
        <div className="min-h-0 flex-1 bg-ui-bg" aria-busy="true" />
      </DashboardLayout>
    )
  }

  return (
    <CopilotKit
      /* A new course address, or a new language, is a new conversation (as SMEEP). */
      key={`${courseId}:${lang}`}
      runtimeUrl={VOICE_RUNTIME_URL}
      /* Resolved object, not a function: the runtime-info request doesn't
         resolve function-form headers. Safe: mounted after the token is cached. */
      headers={getCopilotHeaders()}
      useSingleEndpoint={false}
      enableInspector={false}
      showDevConsole={false}
    >
      <DashboardLayout fullBleed>
        <HanaTutor courseId={courseId} firstName={firstName} lang={lang} onLanguageChange={onLanguageChange} />
      </DashboardLayout>
    </CopilotKit>
  )
}
