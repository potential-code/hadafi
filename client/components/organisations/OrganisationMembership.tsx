'use client'

/**
 * "Organisation" on the learner's profile: the partner organisation she
 * belongs to (it can see her learning record), with a way to leave it.
 * Shows nothing for learners who aren't in one (SMEEP db40881).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { btn } from '@/components/kit'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { fetchMyOrganisation, leaveMyOrganisation } from '@/lib/api/organisations'
import { cn } from '@/lib/utils'

export function OrganisationMembership({ className }: { className?: string }) {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const { data } = useQuery({ queryKey: ['me', 'organisation'], queryFn: fetchMyOrganisation })
  const leave = useMutation({
    mutationFn: leaveMyOrganisation,
    onSuccess: () => {
      toast.success(`You left ${data?.name ?? 'the organisation'}`)
      qc.setQueryData(['me', 'organisation'], null)
    },
    onError: () => toast.error('That didn’t work. Please try again.'),
    onSettled: () => setConfirming(false),
  })
  if (!data) return null
  return (
    <section
      aria-labelledby="p-org"
      className={cn('flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]', className)}
    >
      <h2 id="p-org" className="flex items-center gap-2 text-base font-semibold text-ui-text">
        <Building2 className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
        Organisation
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-ui-text">
          <span className="font-medium">{data.name}</span>
          <span className="block text-[13px] text-ui-muted">
            They can see your learning record: courses, exams, certificates and mentor sessions.
          </span>
        </p>
        <button type="button" className={btn({ variant: 'secondary', size: 'sm' })} onClick={() => setConfirming(true)}>
          Leave
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Leave ${data.name}?`}
        message={`${data.name} will stop seeing your learning record. Your account, courses and certificates stay as they are.`}
        confirmLabel="Leave"
        onConfirm={() => leave.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  )
}
