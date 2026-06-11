'use client'

import { motion } from 'framer-motion'
import { Sparkles, Lightbulb, FileText, Megaphone, Rocket } from 'lucide-react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { EmbeddedDashboardAssistant } from '@/components/dashboard/EmbeddedDashboardAssistant'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent + thread now bind on <CopilotChat>/useAgent inside
// EmbeddedDashboardAssistant, not on the provider.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

const CAPABILITIES = [
  { icon: FileText, label: 'Business plan', tone: 'from-brand-primary to-brand-primary-dark' },
  { icon: Megaphone, label: 'Marketing plan', tone: 'from-brand-violet to-brand-primary' },
  { icon: Rocket, label: 'Product proposal', tone: 'from-brand-accent to-brand-primary-dark' },
  { icon: Lightbulb, label: 'Business ideas', tone: 'from-brand-primary-light to-brand-violet' },
]

export default function AiAssistantPage() {
  // Assistant is for logged-in users only: wait for the minted service token
  // before mounting the CopilotKit provider (its first request needs auth).
  const copilotReady = useCopilotTokenReady()
  if (!copilotReady) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-12rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white shadow-sm animate-pulse" />
      </DashboardLayout>
    )
  }
  return (
    <CopilotKit
      runtimeUrl={VOICE_RUNTIME_URL}
      /* Resolved object, not the function — see Overview.tsx: the core's /info
         fetch doesn't resolve function-form headers. Token is cached by the
         useCopilotTokenReady() gate above. */
      headers={getCopilotHeaders()}
      /* Express handler is multi-route (/info, /transcribe, /agent/:id/run),
         so the client must NOT use single-endpoint mode (default true) — else
         the runtime-info fetch 404s. */
      useSingleEndpoint={false}
      /* Hide CopilotKit's dev chrome: enableInspector kills the floating debug
         diamond + announcement bubbles; showDevConsole kills the dev console. */
      enableInspector={false}
      showDevConsole={false}
    >
    <DashboardLayout>
      <PageHeader
        eyebrow="AI Assistant"
        title="Your AI"
        highlight="business partner"
        subtitle="Generate plans, brainstorm ideas, and get tailored recommendations — powered by SMEEP and your own context."
      />

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl bg-brand-deep text-white p-5 border border-white/10"
          >
            <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
            <motion.div
              aria-hidden
              className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-brand-primary/40 blur-3xl"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 7, repeat: Infinity }}
            />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-brand-primary-light uppercase tracking-[0.18em]">
                <Sparkles className="w-3 h-3" />
                Live
              </span>
              <h3 className="mt-3 text-lg font-black">What can I help with?</h3>
              <p className="mt-1 text-xs text-white/65">
                Try one of these or type your own question.
              </p>
              <ul className="mt-4 space-y-2">
                {CAPABILITIES.map((c, i) => {
                  const Icon = c.icon
                  return (
                    <motion.li
                      key={c.label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.04] border border-white/10"
                    >
                      <span
                        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.tone} flex items-center justify-center shadow-md`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm text-white/85 font-medium">{c.label}</span>
                    </motion.li>
                  )
                })}
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-white border border-brand-surface-2 p-5"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-2">
              Tip
            </p>
            <p className="text-sm text-brand-text-primary leading-relaxed">
              The assistant knows your{' '}
              <span className="font-bold text-brand-primary">profile, courses, and saved
              offers</span>
              . The more context in your profile, the sharper the answers.
            </p>
          </motion.div>
        </aside>

        <div className="col-span-12 lg:col-span-8 xl:col-span-9">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm overflow-hidden"
          >
            <EmbeddedDashboardAssistant className="h-[calc(100vh-12rem)] min-h-[560px] rounded-none" />
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
    </CopilotKit>
  )
}
