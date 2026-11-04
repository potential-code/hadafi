'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, GraduationCap, HeartHandshake, Landmark, type LucideIcon } from 'lucide-react'
import { btn } from '@/components/kit'
import { STAKEHOLDER, type StakeholderKind } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { StakeholderRegisterDialog } from './StakeholderRegisterDialog'

/** The three ways to support the program (other kinds stay hidden, as before). */
const PROGRAMS: { kind: StakeholderKind; id: string; icon: LucideIcon; title: string; body: string; cta: string }[] = [
  {
    kind: 'expert',
    id: 'experts',
    icon: GraduationCap,
    title: 'Experts Program',
    body: 'Join as an individual expert, mentor, coach or lecturer to share your expertise with the community.',
    cta: 'Join as an Expert',
  },
  {
    kind: 'vc',
    id: 'supporters',
    icon: HeartHandshake,
    title: 'Supporters Program',
    body: 'Join as a company, investor, university or incubator to support women entrepreneurs and offer your solutions.',
    cta: 'Join as a Supporter',
  },
  {
    kind: 'government',
    id: 'government',
    icon: Landmark,
    title: 'Government Program',
    body: 'Join as a multilateral or government entity to customize the program for your community.',
    cta: 'Join as a Government',
  },
]

export function LandingStakeholders() {
  const [kind, setKind] = useState<StakeholderKind | null>(null)

  return (
    <section id="stakeholder" aria-labelledby="h-stake" className="scroll-mt-[68px] border-y border-ui-line bg-ui-surface py-9">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-2">
            <h2 id="h-stake" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
              Become a program stakeholder
            </h2>
            <p className="text-base leading-[1.55] text-ui-muted">
              Are you a woman entrepreneur? Sign up here. Otherwise, choose the option that best suits how you want to
              support the program.
            </p>
          </div>
          <Link href={STAKEHOLDER.smeCtaHref} className={cn(btn(), 'max-[420px]:w-full')}>
            Sign up as an entrepreneur
          </Link>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
          <ul aria-label="Stakeholder programs" className="-mb-px -mr-px grid grid-cols-1 min-[700px]:grid-cols-2 min-[1101px]:grid-cols-3">
            {PROGRAMS.map((p) => {
              const Icon = p.icon
              return (
                <li key={p.kind} id={p.id} className="scroll-mt-[84px] border-b border-r border-ui-line">
                  <button
                    type="button"
                    onClick={() => setKind(p.kind)}
                    className="group flex h-full w-full items-start gap-3.5 px-[18px] py-4 text-start transition-colors hover:bg-ui-surface-2"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-[15px] font-semibold text-ui-text">{p.title}</span>
                      <span className="text-sm leading-normal text-ui-muted">{p.body}</span>
                      <span className="inline-flex items-center gap-1 pt-0.5 text-[13px] font-semibold text-ui-brand-text">
                        {p.cta}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <StakeholderRegisterDialog kind={kind} open={kind !== null} onClose={() => setKind(null)} />
    </section>
  )
}
