'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Linkedin, Calendar, Filter, Search, Star } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { BookingModal } from '@/components/mentor/BookingModal'
import type { BookingModalProps } from '@/components/mentor/BookingModal'
import { getMentors } from '@/lib/api/sme'
import type { MentorUser } from '@/lib/api/sme'
import { cn } from '@/lib/utils'

const CATEGORIES = ['All', 'Leadership', 'Strategy', 'Marketing', 'Sales', 'Finance', 'Legal', 'Operations']

const TAG_TO_CATEGORY: Record<string, string> = {
  // Leadership
  'leadership': 'Leadership',
  'team building': 'Leadership',
  // Strategy
  'strategy': 'Strategy',
  'business development': 'Strategy',
  'business transformation': 'Strategy',
  'product development': 'Strategy',
  'project management': 'Strategy',
  // Marketing
  'marketing': 'Marketing',
  'social media': 'Marketing',
  'pr': 'Marketing',
  'branding': 'Marketing',
  'communication': 'Marketing',
  'communications': 'Marketing',
  'commmunications': 'Marketing',
  'digital marketing and social media': 'Marketing',
  // Sales
  'sales': 'Sales',
  // Finance
  'finance': 'Finance',
  'financials': 'Finance',
  'accounting': 'Finance',
  'auditing': 'Finance',
  'tax': 'Finance',
  'insurance': 'Finance',
  'finance and accounting': 'Finance',
  // Legal
  'legal': 'Legal',
  'partnerships': 'Legal',
  'company setup': 'Legal',
  // Operations
  'ict': 'Operations',
  'design thinking': 'Operations',
  'hr and l&d': 'Operations',
  'csr and corporate affairs': 'Operations',
}

function getCategories(expertise: string[]): string[] {
  const cats = new Set<string>()
  for (const tag of expertise) {
    const cat = TAG_TO_CATEGORY[tag.toLowerCase().trim()]
    if (cat) cats.add(cat)
  }
  return Array.from(cats)
}

function diceBearUrl(name: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=9f2063&fontSize=42&radius=50`
}

interface DisplayMentor {
  id: string
  email: string
  name: string
  specialty: string
  primaryTag: string
  avatar: string
  linkedin: string
  featured: boolean
  meetingLink: string | null
  expertise: string[]
}

function toDisplayMentor(m: MentorUser): DisplayMentor {
  const tags = m.expertise ?? []
  const cats = getCategories(tags)
  return {
    id: m.id,
    email: m.email,
    name: m.fullName,
    specialty: m.bio ?? 'Mentor',
    primaryTag: cats[0] ?? '',
    avatar: m.avatarUrl ?? diceBearUrl(m.fullName),
    linkedin: m.linkedinUrl ?? '#',
    featured: tags.some(e => /^featured$/i.test(e)),
    meetingLink: m.meetingLink,
    expertise: tags,
  }
}

export default function HumanMentorsPage() {
  const [cat, setCat] = useState<string>('All')
  const [q, setQ] = useState('')
  const [dbMentors, setDbMentors] = useState<MentorUser[]>([])
  const [loaded, setLoaded] = useState(false)
  const [bookingMentor, setBookingMentor] = useState<BookingModalProps['mentor'] | null>(null)

  useEffect(() => {
    getMentors()
      .then((users) => {
        setDbMentors(users)
        setCat('All')
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const allMentors: DisplayMentor[] = dbMentors.map(toDisplayMentor)

  const filtered = allMentors.filter((m) => {
    if (cat !== 'All' && !getCategories(m.expertise).includes(cat)) return false
    if (q && !`${m.name} ${m.specialty}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Programme mentors"
        title="Book a session with a"
        highlight="human expert"
        subtitle="Verified business mentors from across the world. One-on-one sessions, free for SMEEP members."
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search mentors…"
              className="rounded-xl border border-brand-surface-2 bg-white pl-9 pr-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
        }
      />

      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-brand-text-muted flex-shrink-0" />
          {CATEGORIES.map((c) => {
            const active = c === cat
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  'relative flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap',
                  active ? 'text-white' : 'text-brand-text-muted hover:text-brand-primary',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="human-cat-active"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{c}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loaded && filtered.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-brand-text-muted">
            No mentors available yet.
          </p>
        )}
        {filtered.map((m, i) => {
          const canBook = !!m.id
          return (
            <motion.article
              key={m.email}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.4 }}
              whileHover={{ y: -6 }}
              className="group relative overflow-hidden rounded-2xl bg-white border border-brand-surface-2 hover:border-brand-primary/40 hover:shadow-xl transition-all"
            >
              <div className="relative aspect-square overflow-hidden">
                <img
                  src={m.avatar}
                  alt={m.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
                {m.featured && (
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400/95 text-amber-950 text-[9px] font-bold uppercase tracking-wider">
                    <Star className="w-3 h-3 fill-current" />
                    Featured
                  </span>
                )}
                {!!m.primaryTag && (
                  <span className="absolute top-3 right-3 inline-flex items-center px-2 py-1 rounded-full bg-white/95 text-brand-primary text-[9px] font-bold uppercase tracking-wider">
                    {m.primaryTag}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-brand-text-primary leading-tight">{m.name}</h3>
                <p className="mt-1 text-[11px] text-brand-text-muted leading-snug line-clamp-2 min-h-[2.5em]">
                  {m.specialty}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!canBook}
                    title={!canBook ? 'Not yet available for booking' : undefined}
                    onClick={() => {
                      if (!canBook) return
                      setBookingMentor({
                        name: m.name,
                        specialty: m.specialty,
                        avatar: m.avatar,
                        userId: m.id,
                        meetingLink: m.meetingLink,
                      })
                    }}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold transition-colors',
                      canBook
                        ? 'bg-brand-primary text-white hover:bg-brand-primary-dark'
                        : 'bg-brand-surface text-brand-text-muted cursor-not-allowed opacity-60',
                    )}
                  >
                    <Calendar className="w-3 h-3" />
                    Book
                  </button>
                  <a
                    href={m.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-surface text-brand-text-primary hover:bg-brand-primary hover:text-white transition-colors"
                    aria-label={`${m.name} on LinkedIn`}
                  >
                    <Linkedin className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </motion.article>
          )
        })}
      </div>

      <AnimatePresence>
        {bookingMentor && (
          <BookingModal
            mentor={bookingMentor}
            onClose={() => setBookingMentor(null)}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}
