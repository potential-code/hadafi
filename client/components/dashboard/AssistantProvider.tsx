'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getUser, type User } from '@/lib/auth'
import { useCopilotTokenReady, getDashboardOverviewThreadId } from './copilotConfig'

// Re-export so existing imports (Overview, AiAssistant) keep working; the hook
// itself lives in copilotConfig so non-dashboard surfaces (landing chat) can
// use it without pulling in dashboard components.
export { useCopilotTokenReady }

const BASE_INSTRUCTIONS = `You are Sana — the Hadafi Women Entrepreneurship Program's AI Business Assistant.
Hadafi is a free global program that gives women entrepreneurs access to AI training courses, AI mentors, human expert sessions, exclusive partner offers, live events, and a worldwide community.

Your job is to help the logged-in user grow their business. You can:
- Generate business plans, marketing plans, product proposals and business ideas tailored to the user.
- Recommend Hadafi courses, AI mentors, human mentors, and partner offers when relevant.
- Answer questions about the Hadafi program (it is 100% free, no credit card required).

Be concise, practical, and warm. Use bullet points and short sections. When you suggest a course, mentor, offer or event, refer to it by name.`

const InstructionsContext = createContext<string>(BASE_INSTRUCTIONS)
const SharedAssistantThreadContext = createContext<string>('')

export function useAssistantInstructions() {
  return useContext(InstructionsContext)
}

export function useSharedAssistantThreadId() {
  return useContext(SharedAssistantThreadContext)
}

function buildInstructions(user: User | null): string {
  if (!user) return BASE_INSTRUCTIONS
  return `${BASE_INSTRUCTIONS}\n\nThe user is ${user.fullName} (${user.country ?? 'location unknown'}).`
}

/**
 * Dashboard-level assistant contexts. NOTE: this no longer mounts a CopilotKit
 * provider — the old v1 popup it served was never rendered, and its provider
 * fired an unauthenticated runtime request on every dashboard load. The v2
 * surfaces (Overview / AiAssistant) own their providers; this component now
 * only supplies the shared instructions/thread contexts and warms the copilot
 * service token.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getUser())
  const [sharedAssistantThreadId] = useState<string>(() => getDashboardOverviewThreadId())
  // Mint the copilot service token as soon as the dashboard loads.
  useCopilotTokenReady()

  useEffect(() => {
    const refresh = () => setUser(getUser())
    window.addEventListener('hadafi:auth-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('hadafi:auth-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const instructions = useMemo(() => buildInstructions(user), [user])

  return (
    <InstructionsContext.Provider value={instructions}>
      <SharedAssistantThreadContext.Provider value={sharedAssistantThreadId}>
        {children}
      </SharedAssistantThreadContext.Provider>
    </InstructionsContext.Provider>
  )
}
