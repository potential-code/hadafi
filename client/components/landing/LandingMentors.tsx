'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Briefcase,
  FileText,
  Leaf,
  Lightbulb,
  Linkedin,
  Megaphone,
  Presentation,
  Scale,
  Send,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Avatar, btn, Chip, FilterChips, Skeleton } from '@/components/kit'
import { AI_MENTORS, CHATBOT } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { fetchPublicMentors, type PublicMentor } from './publicData'

const H2 = 'text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]'

// ── AI mentors and Hana ───────────────────────────────────────────────────────

const AI_STYLE: Record<string, { icon: LucideIcon; tone: string; blurb: string }> = {
  'sales-coach': { icon: Briefcase, tone: 'bg-[#FDEDF5] text-[#c8106a]', blurb: 'Scaling enterprise sales and closing high-value deals.' },
  'marketing-coach': { icon: Megaphone, tone: 'bg-[#E8EEF9] text-[#1d4e89]', blurb: 'Data-driven marketing to grow your brand and customer base.' },
  'legal-consultant': { icon: Scale, tone: 'bg-[#FDF1E3] text-[#8a4513]', blurb: 'Business legalities, contracts and compliance.' },
  'leadership-mentor': { icon: Users, tone: 'bg-[#EEE8F6] text-[#4c1d6e]', blurb: 'Leadership skills to inspire teams and drive growth.' },
  'sustainability-bot': { icon: Leaf, tone: 'bg-[#E7F4EC] text-[#1d7f53]', blurb: 'Sustainable practices that reduce costs and boost reputation.' },
  'corporate-security': { icon: ShieldCheck, tone: 'bg-[#EDEFF2] text-[#2f4858]', blurb: 'Security policies and safety protocols for your business.' },
}
const AI_ORDER = Object.keys(AI_STYLE)

const HANA_TOOLS: { label: string; icon: LucideIcon }[] = [
  { label: CHATBOT.capabilities[0], icon: FileText },
  { label: CHATBOT.capabilities[1], icon: Lightbulb },
  { label: CHATBOT.capabilities[2], icon: Presentation },
  { label: CHATBOT.capabilities[3], icon: Megaphone },
]

export function LandingAiMentors() {
  const router = useRouter()
  const mentors = [...AI_MENTORS.mentors].sort((a, b) => AI_ORDER.indexOf(a.slug) - AI_ORDER.indexOf(b.slug))

  function askHana(e: FormEvent) {
    e.preventDefault()
    router.push('/sign-up')
  }

  return (
    <section id="ai-mentors" aria-labelledby="h-ai" className="scroll-mt-[68px] border-y border-ui-line bg-ui-surface py-9">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-start gap-6 px-4 min-[900px]:grid-cols-2 min-[900px]:gap-10 min-[900px]:px-10">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="h-ai" className={H2}>
              AI mentors
            </h2>
            <p className="text-base leading-[1.55] text-ui-muted">
              Get instant guidance from AI-powered business mentors, available 24/7.
            </p>
          </div>
          <ul className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
            {mentors.map((m, i) => {
              const style = AI_STYLE[m.slug]
              const Icon = style?.icon ?? Users
              const name = m.name.replace('&', 'and')
              return (
                <li key={m.slug} className={cn(i > 0 && 'border-t border-ui-line')}>
                  <Link
                    href="/sign-up"
                    aria-label={`Chat now with ${name}`}
                    className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-ui-surface-2"
                  >
                    <span
                      className={cn(
                        'inline-flex h-10 w-10 items-center justify-center rounded-[10px] dark:bg-ui-surface-2 dark:text-ui-brand-text',
                        style?.tone ?? 'bg-ui-brand-soft text-ui-brand-text',
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-ui-text">{name}</span>
                      <span className="text-[13px] leading-snug text-ui-muted">{style?.blurb ?? m.description}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-ui-brand-text max-[420px]:sr-only">
                      Chat now
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <div
          id="ai-assistant"
          className="flex min-w-0 scroll-mt-[84px] flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-bg p-[22px]"
        >
          <div className="flex items-center gap-3.5">
            <img
              src="/images/redesign/hana-avatar.webp"
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover object-top ring-4 ring-ui-brand-soft"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="text-xl font-semibold tracking-[-0.01em] text-ui-text">Hana, your AI business assistant</h3>
              <span className="text-sm text-ui-muted">One assistant for courses, mentors and business tools</span>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed text-ui-text">
            Ask anything. Hana generates a business plan, business idea, product proposal or marketing plan tailored to
            your needs.
          </p>
          <ul aria-label="What Hana can create" className="flex flex-wrap gap-2">
            {HANA_TOOLS.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ui-line bg-ui-surface px-3 text-[13px] font-medium text-ui-text"
              >
                <Icon className="h-[15px] w-[15px] text-ui-brand-text" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <form
            onSubmit={askHana}
            className="flex items-center gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface py-2 pl-3.5 pr-2 focus-within:border-ui-brand focus-within:ring-[3px] focus-within:ring-ui-brand-soft"
          >
            <label htmlFor="lp-ask" className="sr-only">
              Ask Hana
            </label>
            <input
              id="lp-ask"
              type="text"
              placeholder="Create a business plan for a bakery"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ui-text outline-none placeholder:text-ui-muted"
            />
            <button type="submit" aria-label="Sign up to chat with Hana" className={btn({ size: 'icon' })}>
              <Send className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </form>
          <p className="-mt-1.5 text-[13px] text-ui-muted">
            <Link href="/sign-up" className="font-semibold text-ui-brand-text underline">
              Create a free account
            </Link>{' '}
            to chat with Hana.
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Expert mentors (live from /api/mentors/public) ────────────────────────────

const CATEGORIES = ['All', 'Strategy', 'Marketing', 'Sales', 'Finance', 'Legal', 'Leadership', 'Operations'] as const
type Category = (typeof CATEGORIES)[number]
const PREVIEW_COUNT = 6

const TAG_TO_CATEGORY: Record<string, Category> = {
  leadership: 'Leadership',
  'team building': 'Leadership',
  strategy: 'Strategy',
  'business development': 'Strategy',
  'business transformation': 'Strategy',
  'product development': 'Strategy',
  'project management': 'Strategy',
  marketing: 'Marketing',
  'social media': 'Marketing',
  pr: 'Marketing',
  branding: 'Marketing',
  communication: 'Marketing',
  communications: 'Marketing',
  commmunications: 'Marketing',
  'digital marketing and social media': 'Marketing',
  sales: 'Sales',
  finance: 'Finance',
  financials: 'Finance',
  accounting: 'Finance',
  auditing: 'Finance',
  tax: 'Finance',
  insurance: 'Finance',
  'finance and accounting': 'Finance',
  legal: 'Legal',
  partnerships: 'Legal',
  'company setup': 'Legal',
  ict: 'Operations',
  'design thinking': 'Operations',
  'hr and l&d': 'Operations',
  'csr and corporate affairs': 'Operations',
}

const isFeaturedTag = (t: string) => /^featured$/i.test(t)
/** "commmunications" and other stored typos read cleanly in the card. */
const tidyTag = (t: string) => (t.toLowerCase() === 'commmunications' ? 'Communications' : t.charAt(0).toUpperCase() + t.slice(1))

function categoriesOf(tags: string[]) {
  const out = new Set<Category>()
  for (const t of tags) {
    const c = TAG_TO_CATEGORY[t.toLowerCase().trim()]
    if (c) out.add(c)
  }
  return out
}

export function LandingHumanMentors() {
  const [mentors, setMentors] = useState<PublicMentor[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<Category>('All')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetchPublicMentors()
      .then(setMentors)
      .catch(() => {
        setFailed(true)
        setMentors([])
      })
  }, [])

  const featuredFirst = useMemo(() => {
    const list = mentors ?? []
    const featured = (m: PublicMentor) => (m.expertise ?? []).some(isFeaturedTag)
    return [...list].sort((a, b) => Number(featured(b)) - Number(featured(a)))
  }, [mentors])

  // Nothing listed yet: leave the section out rather than show an empty shelf.
  if (mentors !== null && mentors.length === 0 && !failed) return null

  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id="h-mentors" className={H2}>
        Expert mentors
      </h2>
      <p className="text-base leading-[1.55] text-ui-muted">
        Book private one-on-one sessions with verified business experts.
      </p>
    </div>
  )

  if (failed) {
    return (
      <section id="mentors" aria-labelledby="h-mentors" className="scroll-mt-[68px] py-9">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 min-[900px]:px-10">
          {header}
          <p className="text-sm text-ui-muted">
            <Link href="/sign-up" className="font-semibold text-ui-brand-text hover:underline">
              Sign up free
            </Link>{' '}
            to browse every mentor and book a session.
          </p>
        </div>
      </section>
    )
  }

  const filtered =
    active === 'All' ? featuredFirst : featuredFirst.filter((m) => categoriesOf(m.expertise ?? []).has(active))
  const visible = showAll ? filtered : filtered.slice(0, PREVIEW_COUNT)
  const options = CATEGORIES.filter((c) => c === 'All' || featuredFirst.some((m) => categoriesOf(m.expertise ?? []).has(c)))

  return (
    <section id="mentors" aria-labelledby="h-mentors" className="scroll-mt-[68px] py-9">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {header}
          {mentors !== null && (
            <FilterChips
              label="Filter mentors by expertise"
              active={active}
              onChange={(v) => {
                setActive(v)
                setShowAll(false)
              }}
              className="max-w-full"
              options={options.map((c) => ({ value: c, label: c }))}
            />
          )}
        </div>

        {mentors === null ? (
          <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-2 min-[1101px]:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-[14px]" />
            ))}
          </div>
        ) : (
          // Each row draws its right and bottom rule; the frame clips the outer ones.
          <div className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
          <ul
            aria-label="Mentors"
            className="-mb-px -mr-px grid grid-cols-1 min-[700px]:grid-cols-2 min-[1101px]:grid-cols-3"
          >
            {visible.map((m) => {
              const all = m.expertise ?? []
              const tags = all.filter((e) => !isFeaturedTag(e)).map(tidyTag)
              const featured = tags.length !== all.length
              const specialty = tags.join(', ') || m.bio
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-b border-r border-ui-line px-[18px] py-3.5"
                >
                  <Avatar name={m.fullName} src={m.avatarUrl} size={44} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-ui-text">{m.fullName}</h3>
                      {featured && (
                        <Chip tone="brand" className="h-5 text-[11px]">
                          Featured
                        </Chip>
                      )}
                    </span>
                    {specialty && <span className="line-clamp-2 text-[13px] leading-snug text-ui-muted">{specialty}</span>}
                  </span>
                  <span className="col-start-2 flex items-center gap-3">
                    <Link href="/sign-up" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
                      Book session
                    </Link>
                    {m.linkedinUrl && (
                      <a
                        href={m.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${m.fullName} on LinkedIn`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ui-muted hover:bg-ui-surface-2 hover:text-[#0a66c2]"
                      >
                        <Linkedin className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </span>
                </li>
              )
            })}
            {visible.length === 0 && (
              <li className="col-span-full border-b border-r border-ui-line px-5 py-8 text-center text-sm text-ui-muted">
                Mentors for {active} are on their way. Try another area.
              </li>
            )}
          </ul>
          </div>
        )}

        {filtered.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="-mt-1.5 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ui-brand-text hover:underline"
          >
            {showAll ? 'Show fewer mentors' : `See all ${filtered.length} mentors`}
            <ArrowRight className={cn('h-4 w-4 transition-transform', showAll && '-rotate-90')} aria-hidden />
          </button>
        )}
      </div>
    </section>
  )
}
