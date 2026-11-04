'use client'

import { useRef, useState, useCallback, useEffect, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { CopilotKit, useCopilotAction, useCopilotReadable } from '@copilotkit/react-core'
import { CopilotChat } from '@copilotkit/react-ui'
import { cn } from '@/lib/utils'
import {
  COPILOT_RUNTIME_URL,
  COPILOT_AGENT,
  getCopilotHeaders,
  getLandingPageThreadId,
  clearLandingPageThreadId,
  useCopilotTokenReady,
} from '../dashboard/copilotConfig'
import { homeFor, refreshUser } from '@/lib/auth'
import { authClient } from '@/lib/authClient'
import { ChatCodeCard } from '@/components/auth/ChatCodeCard'
import '../dashboard/copilot.css'
import { apiFetch } from '@/lib/api'
import { ChatLoadingContext } from '../dashboard/chat-loading-context'
import {
  HadafiAssistantMessage,
  HadafiUserMessage,
  HadafiChatInput,
  HadafiTypingCursor,
} from '../dashboard/chat-components'
import { CountryPickerCard } from './CountryPickerCard'
import { RegistrationConfirmCard } from './RegistrationConfirmCard'
import { SIGN_UP_PROMPT as ASSISTANT_INSTRUCTIONS } from '../../../shared/hana/prompts'

// ---------------------------------------------------------------------------
// Landing-specific assistant message wrapper
// V1 CopilotChat passes isLoading/isGenerating to AssistantMessage; V2 doesn't.
// When isLoading=true there is no content yet — show the typing dots instead
// of rendering nothing (which is what HadafiAssistantMessage does for empty msgs).
// ---------------------------------------------------------------------------
// V1 UserMessageProps has message as optional; V2 requires it — bridge with any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LandingUserMessage(props: any) {
  return <HadafiUserMessage {...props} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LandingAssistantMessage(props: any) {
  const raw = props.message?.content
  const content =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : '')).join('')
        : ''
  const isEmpty = content.trim().length === 0 && !props.message?.toolCalls?.length

  if (isEmpty && (props.isLoading || props.isGenerating || props.isCurrentMessage)) {
    return <HadafiTypingCursor />
  }
  // While this reply is still streaming, its copy and read-aloud buttons wait.
  const streaming = Boolean(props.isCurrentMessage && (props.isLoading || props.isGenerating))
  return (
    <ChatLoadingContext.Provider value={streaming}>
      <HadafiAssistantMessage {...props} />
    </ChatLoadingContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationData {
  fullName?: string
  email?: string
  verifiedToken?: string // from /api/auth/hadafi/sign-up/verify-code — never sent to the AI
  country?: string       // ISO code e.g. "NG"
  countryName?: string   // display name e.g. "Nigeria"
  couponCode?: string
}

interface LoginData {
  email?: string
}

// ---------------------------------------------------------------------------
// Glass style constants — module-scoped to avoid object recreation on each render
// ---------------------------------------------------------------------------
const GLASS_TRANSITION = 'backdrop-filter 0.5s ease, -webkit-backdrop-filter 0.5s ease, background 0.5s ease, box-shadow 0.5s ease, border-color 0.5s ease'

const LIGHT_GLASS: CSSProperties = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  border: '1.5px solid rgba(255,255,255,0.22)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
  transition: GLASS_TRANSITION,
}

const FULL_GLASS: CSSProperties = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1.5px solid rgba(255,255,255,0.22)',
  boxShadow: '0 8px 48px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 80px rgba(228,22,116,0.10)',
  transition: GLASS_TRANSITION,
}

// ---------------------------------------------------------------------------
// Outer wrapper — owns the CopilotKit provider
// ---------------------------------------------------------------------------

export function LandingRegistrationChat() {
  const [threadId] = useState(() => getLandingPageThreadId())
  // Anonymous visitors get a short-lived GUEST service token (minted by the
  // Hadafi server) — the AI runtime requires auth on every request. Mount the
  // provider only once the token is cached so its first request carries it.
  const copilotReady = useCopilotTokenReady()

  // Clear the module-level thread ID on unmount so the next visit to the
  // landing page (e.g. after logout) starts a fresh conversation.
  useEffect(() => () => clearLandingPageThreadId(), [])

  if (!copilotReady) {
    // Match the real chat's layout (it fills the hero slot absolutely) so the
    // placeholder occupies the same space while the guest token mints.
    return (
      <div className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.04] animate-pulse" />
    )
  }

  return (
    <CopilotKit
      runtimeUrl={COPILOT_RUNTIME_URL}
      agent={COPILOT_AGENT}
      threadId={threadId}
      headers={getCopilotHeaders()}
      /* enableInspector kills the floating debug diamond + announcement
         bubbles; showDevConsole only suppresses error toasts. */
      enableInspector={false}
      showDevConsole={false}
    >
      <LandingRegistrationChatInner />
    </CopilotKit>
  )
}

// ---------------------------------------------------------------------------
// Inner component — all state and hooks live here
// ---------------------------------------------------------------------------

function LandingRegistrationChatInner() {
  const router = useRouter()
  const registrationData = useRef<RegistrationData>({})
  const loginData = useRef<LoginData>({})
  const lastSummaryActionRef = useRef<{ type: 'confirmed' } | { type: 'edit'; field: string } | null>(null)
  const [registrationSummary, setRegistrationSummary] = useState<{
    countryName?: string
    country?: string
  }>({})
  const [showSuggestion, setShowSuggestion] = useState(true)
  // Captures CopilotKit's send function so the welcome panel can trigger it.
  const copilotSendRef = useRef<((text: string) => void) | null>(null)

  // Input wrapper that bridges V1 CopilotChat props (onSend, inProgress) to the
  // V2-shaped HadafiChatInput (onSubmitMessage, isRunning).  No dep on
  // showSuggestion so CopilotKit never remounts the input on state change.
  const LandingInput = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const onSubmitMessage = (text: string) => {
        setShowSuggestion(false)
        // V1 passes onSend; call it so CopilotKit processes the message
        return props.onSend?.(text)
      }
      // Keep local ref in sync so Register/Login CTA buttons can trigger sends
      copilotSendRef.current = onSubmitMessage
      return (
        <HadafiChatInput
          {...props}
          onSubmitMessage={onSubmitMessage}
          isRunning={props.inProgress ?? props.isRunning ?? false}
        />
      )
    },
    [],
  )

  const handleRegisterClick = () => {
    setShowSuggestion(false)
    // Small delay lets React flush the state before CopilotKit processes the send.
    setTimeout(() => copilotSendRef.current?.('I want to register'), 50)
  }

  const handleLoginClick = () => {
    setShowSuggestion(false)
    setTimeout(() => copilotSendRef.current?.('I want to login'), 50)
  }

  // Forward system prompt to LangGraph backend via body.context
  useCopilotReadable({
    description: '__system_prompt__',
    value: ASSISTANT_INSTRUCTIONS,
  })

  // Expose non-sensitive registration data to the LLM (no password)
  useCopilotReadable({
    description: 'Current registration data collected so far',
    value: registrationSummary,
  })

  // ── Action 1: checkEmailAvailability ─────────────────────────────────────
  useCopilotAction({
    name: 'checkEmailAvailability',
    description: 'Check if an email address is available for registration',
    parameters: [
      {
        name: 'email',
        type: 'string',
        required: true,
        description: 'Email address to check',
      },
    ],
    handler: async ({ email }) => {
      try {
        const data = await apiFetch<{ success: boolean; data?: { available: boolean } }>('/api/account/check-email', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
        if (!data.success) return 'error'
        return data.data?.available ? 'available' : 'taken'
      } catch {
        return 'error'
      }
    },
  })

  // ── Action 2: checkCouponCode ────────────────────────────────────────────
  useCopilotAction({
    name: 'checkCouponCode',
    description: 'Check if an invite/coupon code is valid and available',
    parameters: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'Invite code to check',
      },
    ],
    handler: async ({ code }) => {
      try {
        const normalised = code.trim().toUpperCase()
        const data = await apiFetch<{ success: boolean; data?: { valid: boolean } }>(
          `/api/account/check-coupon?code=${encodeURIComponent(normalised)}`
        )
        if (!data.success) return 'error'
        return data.data?.valid ? 'valid' : 'invalid'
      } catch {
        return 'error'
      }
    },
  })

  // ── Action 3: sendOtp ────────────────────────────────────────────────────
  // Emails a sign-up code to a new address. The code itself never passes
  // through the AI: it is typed into the card shown by showOtpEntry.
  useCopilotAction({
    name: 'sendOtp',
    description: 'Send a one-time verification code to the given email address',
    parameters: [{ name: 'email', type: 'string', required: true, description: 'Email to send the code to' }],
    handler: async ({ email }) => {
      try {
        registrationData.current.email = email.trim().toLowerCase()
        registrationData.current.verifiedToken = undefined
        await apiFetch('/api/auth/hadafi/sign-up/send-code', {
          method: 'POST',
          body: JSON.stringify({ email: registrationData.current.email }),
        })
        return 'sent'
      } catch {
        return 'error'
      }
    },
  })

  // ── Action 3b: showOtpEntry ──────────────────────────────────────────────
  // The card checks the code itself and hands back a verifiedToken, which is
  // kept in the ref; the AI only hears 'Email verified' or 'Verification cancelled'.
  useCopilotAction({
    name: 'showOtpEntry',
    description: 'Show a secure in-chat card for the user to enter their email verification code',
    parameters: [],
    renderAndWaitForResponse: ({ respond, status }) => (
      <ChatCodeCard
        purpose="sign-up"
        email={registrationData.current.email ?? ''}
        status={status}
        respond={(result) => {
          if (result.verified && result.verifiedToken) registrationData.current.verifiedToken = result.verifiedToken
          respond?.(result.verified ? 'Email verified' : 'Verification cancelled')
        }}
      />
    ),
  })

  // ── Action 4: showCountryPicker ───────────────────────────────────────────
  useCopilotAction({
    name: 'showCountryPicker',
    description: 'Show an interactive country selection picker for the user to choose their country',
    parameters: [],
    renderAndWaitForResponse: ({ respond, status }) => (
      <CountryPickerCard
        status={status}
        respond={(result) => {
          // Persist the selection before CopilotKit forwards the result to the LLM
          registrationData.current.country = result.countryCode
          registrationData.current.countryName = result.countryName
          setRegistrationSummary(prev => ({ ...prev, country: result.countryCode, countryName: result.countryName }))
          respond?.(`Country selected: ${result.countryName} (${result.countryCode})`)
        }}
      />
    ),
  })

  // ── Action 5: showRegistrationSummary ─────────────────────────────────────
  // NOTE: the verifiedToken is intentionally absent from parameters — it is
  // kept in registrationData.current and never shown to the AI.
  // NOTE: renderAndWaitForResponse may be called twice in React StrictMode;
  // the writes below are idempotent (same values), so double-invocation is harmless.
  useCopilotAction({
    name: 'showRegistrationSummary',
    description: 'Show a summary of all collected registration details for the user to review and confirm',
    parameters: [
      { name: 'fullName', type: 'string', required: true, description: 'Full name collected' },
      { name: 'email', type: 'string', required: true, description: 'Email address collected' },
      { name: 'couponCode', type: 'string', required: false, description: 'Invite code if provided' },
    ],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      // Populate ref with non-sensitive fields so the confirm card can display them.
      if (args?.fullName) registrationData.current.fullName = args.fullName
      if (args?.email) registrationData.current.email = args.email
      // Fix: only update couponCode when explicitly provided to avoid clearing it on re-invocation
      if (args?.couponCode !== undefined) {
        registrationData.current.couponCode = args.couponCode || undefined
      }
      return (
        <RegistrationConfirmCard
          data={registrationData.current}
          status={status}
          completedAction={lastSummaryActionRef.current}
          respond={(result) => {
            lastSummaryActionRef.current = result.action === 'confirmed'
              ? { type: 'confirmed' }
              : { type: 'edit', field: result.field }
            if (result.action === 'confirmed') {
              respond?.('User confirmed registration. Call submitRegistration now.')
            } else {
              respond?.(`User wants to edit field: ${result.field}`)
            }
          }}
        />
      )
    },
  })

  // ── Action 6: submitRegistration ──────────────────────────────────────────
  // Country and verifiedToken are read from registrationData.current (ref),
  // never from AI parameters. Creates the account (no password: it signs in
  // by email code, and a password can be added in Profile) and signs in.
  useCopilotAction({
    name: 'submitRegistration',
    description: 'Submit the registration with all collected data',
    parameters: [
      { name: 'fullName', type: 'string', required: true, description: 'Full name of the user' },
      { name: 'email', type: 'string', required: true, description: 'Email address' },
      { name: 'couponCode', type: 'string', required: false, description: 'Optional invite code' },
    ],
    handler: async ({ fullName, email, couponCode: rawCoupon }) => {
      // The full country name, as the sign-up form saves it (not the ISO code).
      const country = registrationData.current.countryName ?? registrationData.current.country
      const verifiedToken = registrationData.current.verifiedToken
      const couponCode = rawCoupon?.trim().toUpperCase() || undefined
      if (!country) return { error: true, message: 'Missing required fields' }
      // The verified email is the one the code went to.
      if (!verifiedToken || email.trim().toLowerCase() !== registrationData.current.email) {
        return { error: true, code: 'EMAIL_NOT_VERIFIED', message: 'The email needs to be verified' }
      }
      try {
        await apiFetch('/api/auth/hadafi/sign-up', {
          method: 'POST',
          body: JSON.stringify({ fullName, email: registrationData.current.email, country, couponCode, verifiedToken }),
        })
        registrationData.current.verifiedToken = undefined
        await refreshUser()
        router.push('/dashboard')
        return { success: true }
      } catch (err: unknown) {
        // Better Auth errors put `code` at the top level.
        const body = err as { code?: string; status?: number; message?: string }
        const code = body?.status === 429 || body?.code === 'EMAIL_RATE_LIMITED' ? 'RATE_LIMITED' : body?.code
        return { error: true, code, message: body?.message ?? 'Network error' }
      }
    },
  })

  // ── Action 7: sendLoginCode ──────────────────────────────────────────────
  // Emails a sign-in code. Better Auth only sends it when the email has an
  // account, but answers the same either way, so the chat can't be used to
  // find out who is registered. No password is ever taken in the chat.
  useCopilotAction({
    name: 'sendLoginCode',
    description: 'Email a 6-digit sign-in code to the given address',
    parameters: [{ name: 'email', type: 'string', required: true, description: 'Email address to sign in with' }],
    handler: async ({ email }) => {
      loginData.current.email = email.trim().toLowerCase()
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: loginData.current.email, type: 'sign-in' })
      if (!error) return 'sent'
      return error.status === 429 ? 'rate_limited' : 'error'
    },
  })

  // ── Action 8: showLoginCodeEntry ─────────────────────────────────────────
  // The code is typed into the card and checked by Better Auth there; the
  // AI only ever hears 'Signed in' or 'Sign-in cancelled'.
  useCopilotAction({
    name: 'showLoginCodeEntry',
    description: 'Show a secure in-chat card for the user to enter their sign-in code',
    parameters: [],
    renderAndWaitForResponse: ({ respond, status }) => (
      <ChatCodeCard
        purpose="sign-in"
        email={loginData.current.email ?? ''}
        status={status}
        respond={async (result) => {
          if (result.verified) {
            const user = await refreshUser()
            respond?.('Signed in')
            router.push(user ? homeFor(user.role) : '/dashboard')
            return
          }
          respond?.('Sign-in cancelled')
        }}
      />
    ),
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="hadafi-landing-dark absolute inset-0 flex flex-col rounded-2xl overflow-hidden"
      style={showSuggestion ? LIGHT_GLASS : FULL_GLASS}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0 border-b"
        style={{
          background: 'linear-gradient(135deg, rgba(228,22,116,0.92) 0%, rgba(181,13,92,0.92) 100%)',
          borderBottomColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="relative flex-shrink-0">
          <img
            src="/images/redesign/hana-avatar.webp"
            alt="Hana"
            className="w-10 h-10 rounded-full object-cover object-top ring-2 ring-white/30"
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-white/20 shadow-[0_0_6px_rgba(74,222,128,0.7)]" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold leading-tight">Hana</p>
          <p className="text-white/55 text-[11px] mt-0.5">Here to get you started</p>
        </div>
      </div>

      {/* Welcome panel — shown before the conversation starts */}
      {showSuggestion && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center gap-4 lg:gap-5 px-6 py-5 lg:py-8">
          {/* Avatar with pink ambient glow */}
          <div className="relative flex-shrink-0">
            <div
              className="w-24 h-24 lg:w-36 lg:h-36 rounded-full overflow-hidden"
              style={{
                boxShadow: '0 0 0 3px rgba(255,255,255,0.12), 0 0 0 8px rgba(228,22,116,0.22), 0 0 50px rgba(228,22,116,0.45), 0 16px 40px rgba(0,0,0,0.45)',
              }}
            >
              <img
                src="/images/redesign/hana-avatar.webp"
                alt="Hana"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <p className="font-bold text-white text-[19px] lg:text-[22px] tracking-tight leading-snug">
              Hi! I'm Hana
            </p>
            <p className="text-[13px] lg:text-[15px] text-white/55 leading-relaxed max-w-[260px] mx-auto">
              Register for free, or log in to your existing account.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col items-stretch gap-3 w-full max-w-[280px]">
            <button
              className="w-full px-6 py-3.5 lg:py-4 rounded-full text-[15px] lg:text-[17px] font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #e41674 0%, #b50d5c 100%)',
                boxShadow: '0 4px 24px rgba(228,22,116,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
              onClick={handleRegisterClick}
              suppressHydrationWarning
            >
              ✦ I want to register
            </button>
            <button
              className="w-full px-6 py-3.5 lg:py-4 rounded-full text-[15px] lg:text-[17px] font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.97]"
              style={{
                background: 'rgba(255,255,255,0.10)',
                boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.30), 0 4px 16px rgba(0,0,0,0.25)',
              }}
              onClick={handleLoginClick}
              suppressHydrationWarning
            >
              → I want to login
            </button>
          </div>
        </div>
      )}

      {/* Chat — always mounted so CopilotKit stays initialised; hidden behind welcome panel */}
      <div className={cn('hadafi-copilot overflow-hidden', showSuggestion ? 'h-0' : 'flex-1')}>
        <CopilotChat
          className="h-full"
          labels={{
            title: '',
            placeholder: 'Ask me anything…',
            initial: "Welcome to Hadafi! 👋 I can help you register for free or log in to your existing account.",
          }}
          AssistantMessage={LandingAssistantMessage}
          UserMessage={LandingUserMessage}
          Input={LandingInput}
        />
      </div>
    </div>
  )
}
