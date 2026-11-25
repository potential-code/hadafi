'use client'

/**
 * "Emails" on the learner's and the mentor's profile (GET/PUT /api/me/announcements/email-preference):
 * marketing from the Potential.org Foundation (the consent given or not at
 * sign-up; a change reaches the CRM), and Hadafi announcement emails once
 * they are switched on for the platform.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MARKETING_CONSENT_TEXT } from '@/lib/signUpConsent'

type Prefs = { announcements: boolean; emailEnabled: boolean; marketing?: boolean }
type Change = { announcements: boolean } | { marketing: boolean }

const KEY = ['me', 'email-preference']
const PREFS_URL = '/api/me/announcements/email-preference'
// The off track must stand out from the card (3:1) with its white thumb.
const SWITCH = 'data-[state=checked]:bg-ui-brand data-[state=unchecked]:bg-ui-muted dark:data-[state=unchecked]:bg-ui-muted'

export function EmailPreferences({ className }: { className?: string }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<{ data: Prefs }>(PREFS_URL).then((r) => r.data),
  })
  const save = useMutation({
    mutationFn: (change: Change) => apiFetch<{ data: Prefs }>(PREFS_URL, { method: 'PUT', body: JSON.stringify(change) }),
    onMutate: (change) => qc.setQueryData<Prefs>(KEY, (p) => (p ? { ...p, ...change } : p)),
    onSuccess: (res, change) => {
      qc.setQueryData(KEY, res.data)
      toast.success(
        'marketing' in change
          ? change.marketing
            ? 'You’ll get updates from the Potential.org Foundation'
            : 'Potential.org Foundation updates turned off'
          : change.announcements
            ? 'You’ll get announcement emails'
            : 'Announcement emails turned off',
      )
    },
    onError: () => {
      toast.error('That didn’t save. Try again.')
      void qc.invalidateQueries({ queryKey: KEY })
    },
  })

  // Only learners have the marketing setting; announcement emails show once they are switched on.
  if (!data || (data.marketing === undefined && !data.emailEnabled)) return null

  return (
    <section
      aria-labelledby="p-emails"
      className={cn('flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]', className)}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-text">
          <Mail className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id="p-emails" className="text-base font-semibold text-ui-text">Emails</h2>
          <span className="text-[13px] text-ui-muted">Choose what we may email you about. Sign-in codes always arrive.</span>
        </div>
      </div>
      {data.marketing !== undefined && (
        <div className="flex items-center justify-between gap-4 border-t border-ui-line pt-3.5">
          <label htmlFor="p-marketing-emails" className="min-w-0">
            <span className="block text-sm font-medium text-ui-text">Updates from the Potential.org Foundation</span>
            <span className="block text-[13px] text-ui-muted">{MARKETING_CONSENT_TEXT}</span>
          </label>
          <Switch
            id="p-marketing-emails"
            aria-label="Updates from the Potential.org Foundation"
            checked={data.marketing}
            disabled={save.isPending}
            onCheckedChange={(v) => save.mutate({ marketing: v })}
            className={SWITCH}
          />
        </div>
      )}
      {data.emailEnabled && (
        <div className="flex items-center justify-between gap-4 border-t border-ui-line pt-3.5">
          <label htmlFor="p-announcement-emails" className="min-w-0">
            <span className="block text-sm font-medium text-ui-text">Announcements from Hadafi</span>
            <span className="block text-[13px] text-ui-muted">New courses, events and programme news.</span>
          </label>
          <Switch
            id="p-announcement-emails"
            aria-label="Announcements from Hadafi"
            checked={data.announcements}
            disabled={save.isPending}
            onCheckedChange={(v) => save.mutate({ announcements: v })}
            className={SWITCH}
          />
        </div>
      )}
    </section>
  )
}
