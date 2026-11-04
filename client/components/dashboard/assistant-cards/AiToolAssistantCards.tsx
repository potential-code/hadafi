'use client'

import { Lightbulb, FileText, Megaphone, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { AssistantCardStrip } from './AssistantCardStrip'

interface Props {
  onStart: (triggerMessage: string) => void
  ids?: string[]
  actionStatus?: string
}

const AI_TOOLS = [
  {
    id: 'business-idea',
    title: 'Business Ideas',
    description: 'Generate tailored business ideas based on your passion and experience',
    image: '/images/ai-tools/business-idea.webp',
    triggerMessage: 'Help me brainstorm a business idea',
    Icon: Lightbulb,
  },
  {
    id: 'business-plan',
    title: 'Business Plan',
    description: 'Create a comprehensive, investor-ready business plan',
    image: '/images/ai-tools/business-plan.webp',
    triggerMessage: 'Help me create a business plan',
    Icon: FileText,
  },
  {
    id: 'marketing-plan',
    title: 'Marketing Plan',
    description: 'Build a complete marketing strategy with ads, social media, and email',
    image: '/images/ai-tools/marketing-plan.webp',
    triggerMessage: 'Help me create a marketing plan',
    Icon: Megaphone,
  },
  {
    id: 'ai-proposal',
    title: 'AI Proposal',
    description: 'Draft a persuasive product or sales proposal for your next pitch',
    image: '/images/ai-tools/ai-proposal.webp',
    triggerMessage: 'Help me write a product proposal',
    Icon: Zap,
  },
]

export function AiToolAssistantCards({ onStart, ids, actionStatus }: Props) {
  if (actionStatus === 'inProgress') return null

  const visible = ids && ids.length > 0
    ? AI_TOOLS.filter((t) => ids.includes(t.id))
    : AI_TOOLS

  if (visible.length === 0) return null

  return (
    <AssistantCardStrip>
      {visible.map((tool, i) => (
        <motion.div
          key={tool.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          className="w-44 flex-shrink-0 rounded-[14px] bg-ui-surface border border-ui-line overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-ui"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={tool.image}
              alt={tool.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-2.5 flex flex-col gap-1.5">
            <div>
              <h4 className="font-semibold text-[13px] text-ui-text leading-tight line-clamp-1">
                {tool.title}
              </h4>
              <p className="text-[11px] text-ui-muted line-clamp-2">{tool.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onStart(tool.triggerMessage)}
              className="w-full inline-flex items-center justify-center gap-1 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-2 text-[13px] font-semibold transition-colors"
            >
              <tool.Icon className="w-3 h-3" />
              Start
            </button>
          </div>
        </motion.div>
      ))}
    </AssistantCardStrip>
  )
}
