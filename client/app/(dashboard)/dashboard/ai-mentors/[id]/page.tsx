import { notFound } from 'next/navigation'
import AiMentorChatPage from '@/views/dashboard/AiMentorChat'
import { getAiMentorBySlug } from '@/lib/dashboardData'

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
