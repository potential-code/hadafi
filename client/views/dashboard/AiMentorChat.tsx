'use client'

import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { MentorChatPanel } from '@/components/dashboard/MentorChatPanel'

type Props = {
  botId: string
  name: string
  specialty: string
  description: string
  avatar: string
}

/**
 * An AI mentor conversation, full-bleed inside the app shell. The back link
 * lives in the panel's header.
 */
export default function AiMentorChatPage({ botId, name, specialty, description }: Props) {
  return (
    <DashboardLayout fullBleed>
      <MentorChatPanel botId={botId} name={name} specialty={specialty} description={description} />
    </DashboardLayout>
  )
}
