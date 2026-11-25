import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AiMentorChatPage from '@/views/dashboard/AiMentorChat'
import { getAiMentorBySlug } from '@/lib/dashboardData'

/** The tab names the mentor: "Marketing Coach | Hadafi". */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const mentor = getAiMentorBySlug(id)
  return { title: mentor ? mentor.name : 'AI mentor' }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mentor = getAiMentorBySlug(id)
  if (!mentor) notFound()
  return (
    <AiMentorChatPage
      botId={mentor.botId}
      name={mentor.name}
      specialty={mentor.specialty}
      description={mentor.description}
      avatar={mentor.avatar}
    />
  )
}
