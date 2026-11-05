'use client'

/**
 * A partner contact's portal: their organisation's participants, read only,
 * with downloads and the sign-up link to share (SMEEP db40881).
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { PartnerLayout } from '@/components/partner/PartnerLayout'
import { EmptyState, PageHeader, Skeleton, btn } from '@/components/kit'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { JoinLinkCard, OrganisationDashboard } from '@/components/organisations/OrganisationDashboard'
import { ORGANISATION_DATASETS, downloadFrom, fetchPartnerDashboard } from '@/lib/api/organisations'
import { signOut } from '@/lib/auth'

type ApiErr = { error?: { message?: string; code?: string } } | null

export default function PartnerDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['partner', 'dashboard'],
    queryFn: fetchPartnerDashboard,
    retry: false,
  })
  // Signed out on the server (an admin removed this login): go to sign in.
  useEffect(() => {
    if ((error as ApiErr)?.error?.code === 'UNAUTHORIZED') {
      void signOut().finally(() => window.location.assign('/login?expired=1'))
    }
  }, [error])

  return (
    <PartnerLayout>
      <PageHeader
        title={data?.organisation.name ?? 'Your participants'}
        subtitle="Your organisation's participants on Hadafi: who has joined, their courses, exams, certificates and mentor sessions."
        actions={
          data ? (
            <ExportMenu datasets={ORGANISATION_DATASETS} download={(d, f) => downloadFrom('/api/partner/exports', d, f)} />
          ) : undefined
        }
      />
      {isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your dashboard">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[112px]" />
            ))}
          </div>
          <Skeleton className="h-[260px]" />
        </div>
      ) : error || !data ? (
        <EmptyState
          icon={Building2}
          title="Your dashboard isn't available"
          body={(error as ApiErr)?.error?.message ?? 'Try again in a moment, or contact the Hadafi team.'}
          action={
            <button
              type="button"
              className={btn({ variant: 'secondary' })}
              onClick={async () => {
                await signOut()
                window.location.assign('/login')
              }}
            >
              Sign out
            </button>
          }
        />
      ) : (
        <OrganisationDashboard
          data={data}
          learnerHref={(l) => `/partner/learners/${l.id}`}
          emptyLearners={
            <div className="p-5">
              <JoinLinkCard link={data.organisation.joinLink} enabled={data.organisation.joinEnabled} className="border-dashed" />
            </div>
          }
        />
      )}
      {data && data.learners.length > 0 && (
        <JoinLinkCard link={data.organisation.joinLink} enabled={data.organisation.joinEnabled} className="mt-5" />
      )}
    </PartnerLayout>
  )
}
