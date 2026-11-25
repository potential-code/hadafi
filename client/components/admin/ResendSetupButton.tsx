'use client'

import { useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/kit'
import { apiFetch } from '@/lib/api'

/** The fields of a mentor application this button needs. */
export interface ResendableApplication {
  id: string
  name: string
  status: string
  /** True once the mentor has created their account from the setup link. */
  hasAccount: boolean
}

/** Approved mentors who have not set up their account can be sent a new setup link. */
export function canResendSetup(app: Pick<ResendableApplication, 'status' | 'hasAccount'>): boolean {
  return app.status === 'approved' && !app.hasAccount
}

interface ResendResponse {
  success: boolean
  data: { email: string; emailQueued: boolean; expiresAt: string }
}

/**
 * "Resend setup link": emails the mentor a new 48-hour setup link (the server
 * replaces the old one, which stops working). Disabled while the request is in
 * flight; the server also refuses a second link within a minute.
 */
export function ResendSetupButton({ app, className }: { app: ResendableApplication; className?: string }) {
  const [pending, setPending] = useState(false)
  // A second click can land before React re-renders the disabled button.
  const inFlight = useRef(false)

  async function resend() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      const { data } = await apiFetch<ResendResponse>(`/api/admin/mentor-applications/${app.id}/resend-setup`, {
        method: 'POST',
      })
      if (data.emailQueued) {
        toast.success(`Setup link sent to ${data.email}`)
      } else {
        toast.error('A new setup link was created, but the email could not be sent', {
          description: 'Try again in a minute.',
        })
      }
    } catch (err) {
      toast.error((err as { error?: { message?: string } } | null)?.error?.message ?? 'Failed to resend the setup link')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={`Resend setup link to ${app.name}`}
      onClick={() => void resend()}
    >
      {pending ? (
        <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden />
      ) : (
        <Send className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
      )}
      Resend setup link
    </Button>
  )
}
