'use client'

import { createContext, type ReactNode } from 'react'

/**
 * Actions under each finished Hana reply (copy, read aloud, and where a chat
 * supports them, try again and "report this answer").
 *
 * - No provider: every Hana chat that uses HanaAssistantMessage gets copy and
 *   read aloud by default (HanaReplyButtons' DefaultHanaReplyActions).
 * - A renderer: the chat decides (Ask Hana adds try again and report).
 *   HanaReplyActionsProvider builds one with an optional report surface.
 * - `null`: no actions in this chat.
 */
export type HanaReplyActionsRenderer = (reply: {
  id: string
  text: string
  isLast: boolean
  /** The turns before this answer, oldest first (for "report this answer"). */
  before?: { role: 'learner' | 'ai'; text: string }[]
}) => ReactNode

export const HanaReplyActions = createContext<HanaReplyActionsRenderer | null | undefined>(undefined)
