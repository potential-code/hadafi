'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Avatar, btn, Card, Chip, PageHeader, SectionHeader } from '@/components/kit'
import { aiMentorViews } from '@/components/dashboard/aiMentorMeta'
import { getMentors } from '@/lib/api/sme'
import { cn } from '@/lib/utils'

export default function AiMentorsPage() {
  const mentors = aiMentorViews()
  // Real human mentor faces for the "prefer a person" banner.
  const { data: humans } = useQuery({ queryKey: ['mentors'], queryFn: getMentors })

  return (
    <DashboardLayout>
      <PageHeader
        title="AI Mentors"
        subtitle="Specialist AI coaches you can chat with any time. Pick a mentor and start a conversation."
        className="mb-7"
      />

      <section aria-labelledby="ai-mentors-list" className="mb-7">
        <SectionHeader
          id="ai-mentors-list"
          title={`${mentors.length} mentors`}
          action={<span className="font-normal text-ui-muted">All available 24/7</span>}
          className="mb-3.5"
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mentors.map((m) => {
            const Icon = m.icon
            return (
              <li key={m.slug}>
                <Link
                  href={`/dashboard/ai-mentors/${m.slug}`}
                  className="group block h-full rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
                >
                  <Card interactive className="flex h-full flex-col gap-2.5 p-[18px]">
                    <span
                      aria-hidden
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: m.tile.bg, color: m.tile.fg }}
                    >
                      <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
                    </span>
                    <h3 className="text-[15px] font-semibold text-ui-text">{m.name}</h3>
                    <Chip className="self-start">{m.specialty}</Chip>
                    <p className="text-sm leading-relaxed text-ui-muted">{m.description}</p>
                    <span className="mt-auto pt-1 text-[13px] font-semibold text-ui-brand-text group-hover:underline">
                      Start a chat
                    </span>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <Card className="flex flex-wrap items-center gap-[18px] px-5 py-[18px]">
        {humans && humans.length > 0 && (
          <div aria-hidden className="flex flex-shrink-0">
            {humans.slice(0, 3).map((h, i) => (
              <Avatar
                key={h.id}
                name={h.fullName}
                src={h.avatarUrl}
                size={40}
                className={cn('border-2 border-ui-surface', i > 0 && '-ms-2.5')}
              />
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
          <h2 className="text-base font-semibold text-ui-text">Prefer to talk to a person?</h2>
          <p className="text-sm text-ui-muted">Book a free one-on-one session with one of our verified business mentors.</p>
        </div>
        <Link href="/dashboard/human-mentors" className={btn({ variant: 'secondary', size: 'md' })}>
          Browse human mentors
        </Link>
      </Card>
    </DashboardLayout>
  )
}
