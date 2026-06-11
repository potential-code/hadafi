'use client'

import { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Star, Rocket, Users, Lightbulb, FileText, Megaphone, Zap, ArrowUp } from 'lucide-react'

interface Props {
  onSend: (message: string) => void
}

const CHIPS = [
  { label: 'Increase my sales',    icon: TrendingUp, message: 'I want to increase my sales' },
  { label: 'Grow my brand',        icon: Star,       message: 'I want to grow my brand' },
  { label: 'Launch a new product', icon: Rocket,     message: 'I want to launch a new product' },
  { label: 'Find new customers',   icon: Users,      message: 'I want to find new customers' },
]

const AI_TOOLS = [
  { id: 'business-idea',  title: 'Business Ideas', desc: 'Generate tailored business ideas based on your passion and experience', Icon: Lightbulb, image: '/images/ai-tools/business-idea.png',  message: 'Help me brainstorm a business idea' },
  { id: 'business-plan',  title: 'Business Plan',  desc: 'Create a comprehensive, investor-ready business plan',                 Icon: FileText,  image: '/images/ai-tools/business-plan.png',  message: 'Help me create a business plan' },
  { id: 'marketing-plan', title: 'Marketing Plan', desc: 'Build a complete marketing strategy with ads, social media, and email', Icon: Megaphone, image: '/images/ai-tools/marketing-plan.png', message: 'Help me create a marketing plan' },
  { id: 'ai-proposal',    title: 'AI Proposal',    desc: 'Draft a persuasive product or sales proposal for your next pitch',     Icon: Zap,       image: '/images/ai-tools/ai-proposal.png',    message: 'Help me write a product proposal' },
]

export function ChatEmptyState({ onSend }: Props) {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setInputValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    onSend(text)
  }, [inputValue, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  return (
    <div className="flex flex-col h-full">

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col items-center gap-3">

        {/* Avatar */}
        <div className="ring-4 ring-brand-primary/15 rounded-full mt-1">
          <img
            src="/images/redesign/hadafi-avatar-200.png"
            alt="Hana"
            className="w-[68px] h-[68px] rounded-full object-cover object-top border-2 border-white"
          />
        </div>

        {/* Name + tagline */}
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="font-bold text-[15px] text-brand-text-primary leading-tight">Hana</p>
          <p className="text-[11px] text-brand-text-muted max-w-[260px] leading-[1.4]">
            I help you grow your business — find resources, create documents, and discover AI tools.
          </p>
        </div>

        {/* Quick-action chips */}
        <div className="flex flex-wrap gap-1.5 justify-center w-full">
          {CHIPS.map(({ label, icon: Icon, message }) => (
            <button
              key={label}
              type="button"
              onClick={() => onSend(message)}
              className="inline-flex items-center gap-1.5 bg-white border-2 border-brand-primary/50 text-brand-primary rounded-full px-3 py-1.5 text-[11px] font-semibold hover:bg-brand-primary hover:text-white hover:border-brand-primary hover:shadow-md active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <Icon className="w-3 h-3 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-brand-text-muted/60 text-center -mt-1">
          Select a goal to get started, or type below
        </p>

        <hr className="w-full border-brand-primary/10" />

        {/* AI Business Tools */}
        <div className="w-full">
          <p className="text-[11px] font-semibold text-brand-text-muted text-center mb-2">
            Explore AI-powered tools to grow your business
          </p>
          <div className="flex gap-2 justify-center">
            {AI_TOOLS.map((tool, i) => (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="w-[22%] flex-shrink-0 rounded-xl bg-white border border-brand-primary/15 overflow-hidden hover:border-brand-primary/40 hover:shadow-md transition-all"
              >
                <div className="relative h-30 overflow-hidden">
                  <img
                    src={tool.image}
                    alt={tool.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <h4 className="font-bold text-[11px] text-white leading-tight line-clamp-1">{tool.title}</h4>
                    <p className="text-[9px] text-white/70 line-clamp-1 mt-0.5">{tool.desc}</p>
                  </div>
                </div>
                <div className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onSend(tool.message)}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-brand-primary text-white px-2 py-1.5 text-[12px] font-bold hover:opacity-90 transition-all"
                  >
                    <tool.Icon className="w-3 h-3" />
                    Start
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

      </div>

      {/* Full-width input bar */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        <div className="flex items-end gap-2 px-3 py-2 bg-[#FDF5F9] border border-[#f7e8f0] rounded-2xl">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything…"
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-[13px] text-[#1A0A12] leading-snug placeholder:text-[#6B7280]/50 min-w-0"
            style={{ minHeight: '20px', maxHeight: '120px', fontFamily: 'inherit' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            aria-label="Send"
            className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 self-end transition-opacity disabled:opacity-30"
            style={
              inputValue.trim()
                ? { background: 'linear-gradient(120deg, #e41674 0%, #b50d5c 100%)' }
                : { background: '#f7e8f0' }
            }
          >
            <ArrowUp className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

    </div>
  )
}
