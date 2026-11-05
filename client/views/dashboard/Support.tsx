'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, Mail, Search, Sparkles } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, EmptyState, FilterChips, PageHeader, btn, inputClass } from '@/components/kit'
import { FAQ_TABS } from '@/lib/dashboardData'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'hadafi@potential.com'

const LEGAL_LINKS = [
  { label: 'Privacy policy', href: 'https://potential.com/privacy' },
  { label: 'Terms of use', href: 'https://potential.com/terms' },
]

/** Every question, tagged with its topic and a stable index. */
const ALL_FAQS = FAQ_TABS.flatMap((t) => t.items.map((f) => ({ ...f, topic: t.tab }))).map((f, i) => ({ ...f, i }))

/** Visible copy uses full stops instead of dashes ("Yes — joining" -> "Yes. Joining"). */
function plain(text: string) {
  return text.replace(/\s+[—–]\s+(\w)/g, (_, c: string) => `. ${c.toUpperCase()}`)
}

export default function SupportPage() {
  const [topic, setTopic] = useState(FAQ_TABS[0]?.tab ?? '')
  const [open, setOpen] = useState<number | null>(() => ALL_FAQS.find((f) => f.topic === FAQ_TABS[0]?.tab)?.i ?? null)
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  // A search looks through every topic; otherwise show the chosen topic.
  const faqs = query
    ? ALL_FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(query))
    : ALL_FAQS.filter((f) => f.topic === topic)

  return (
    <DashboardLayout>
      <PageHeader title="Support" subtitle="Browse common questions, email our team, or ask Hana." />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card aria-labelledby="s-faq" className="min-w-0">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-0.5">
              <h2 id="s-faq" className="text-base font-semibold text-ui-text">Frequently asked</h2>
              <span className="text-[13px] text-ui-muted">Top questions from Hadafi members</span>
            </div>
            <div className="relative w-full sm:w-[260px]">
              <label htmlFor="s-search" className="sr-only">
                Search questions
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" aria-hidden />
              <input
                id="s-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search questions"
                className={cn(inputClass, 'h-[38px] bg-ui-bg pl-9')}
              />
            </div>
          </div>
          {!query && FAQ_TABS.length > 1 && (
            <FilterChips
              label="Question topics"
              options={FAQ_TABS.map((t) => ({ value: t.tab, label: t.tab }))}
              active={topic}
              onChange={(t) => {
                setTopic(t)
                setOpen(ALL_FAQS.find((f) => f.topic === t)?.i ?? null)
              }}
              className="mx-0 px-5 pb-4"
            />
          )}
          {faqs.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No questions match"
              body={`Nothing matches "${q.trim()}". Email us or ask Hana instead.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setQ('')}>
                  Clear search
                </Button>
              }
              className="border-t border-ui-line"
            />
          ) : (
            <ul>
              {faqs.map((f) => {
                const isOpen = query ? true : f.i === open
                return (
                  <li key={f.i} className="border-t border-ui-line">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`faq-${f.i}`}
                        onClick={() => setOpen(f.i === open ? null : f.i)}
                        disabled={!!query}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] font-semibold text-ui-text transition-colors hover:bg-ui-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-brand disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className="flex-1">{f.q}</span>
                        <ChevronDown
                          className={cn('h-[18px] w-[18px] shrink-0 text-ui-muted transition-transform', isOpen && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    </h3>
                    {isOpen && (
                      <p id={`faq-${f.i}`} className="max-w-[680px] px-5 pb-[18px] text-[15px] leading-relaxed text-ui-muted">
                        {plain(f.a)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card aria-labelledby="s-hana" className="flex flex-col gap-3 p-5 shadow-ui">
            <div className="flex items-center gap-3">
              <img src="/images/redesign/hana-avatar.webp" alt="" className="h-11 w-11 rounded-full object-cover object-top" />
              <div className="flex flex-col">
                <h2 id="s-hana" className="text-base font-semibold text-ui-text">Ask Hana</h2>
                <span className="text-[13px] text-ui-muted">Your AI concierge, any time</span>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-ui-muted">Get instant answers about Hadafi, your account, or your business.</p>
            <Link href="/dashboard/assistant" className={btn()}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Ask Hana
            </Link>
          </Card>

          <Card aria-labelledby="s-mail" className="flex flex-col gap-2.5 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-surface-2 text-ui-text">
                <Mail className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="flex flex-col">
                <h2 id="s-mail" className="text-base font-semibold text-ui-text">Email support</h2>
                <span className="text-[13px] text-ui-muted">We typically reply within one working day</span>
              </div>
            </div>
            <a href={`mailto:${SUPPORT_EMAIL}`} className={cn(btn({ variant: 'secondary' }), 'min-w-0')}>
              <span className="truncate">{SUPPORT_EMAIL}</span>
            </a>
          </Card>

          <Card aria-labelledby="s-legal" className="flex flex-col gap-2 px-5 py-4">
            <h2 id="s-legal" className="text-sm font-semibold text-ui-text">Policies</h2>
            {LEGAL_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded py-1 text-sm text-ui-brand-text hover:underline"
              >
                {l.label}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
            ))}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
