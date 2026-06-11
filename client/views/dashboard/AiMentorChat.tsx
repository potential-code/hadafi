'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { MentorChatPanel } from '@/components/dashboard/MentorChatPanel'

type Props = {
  botId: string
  name: string
  specialty: string
  description: string
  avatar: string
}

export default function AiMentorChatPage({ botId, name, specialty, avatar }: Props) {
  return (
    <DashboardLayout>
      <div className="mb-4">
        <Link
          href="/dashboard/ai-mentors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted hover:text-brand-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All AI mentors
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl shadow-2xl"
        style={{ height: 'calc(100vh - 10rem)' }}
      >
        <MentorChatPanel
          botId={botId}
          name={name}
          specialty={specialty}
          avatar={avatar}
        />
      </motion.div>
    </DashboardLayout>
  )
}
