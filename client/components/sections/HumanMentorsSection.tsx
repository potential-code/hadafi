'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Linkedin, ArrowRight } from 'lucide-react'
import { SectionHeader } from '@/components/shared/SectionHeader'

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/api/mentors/public`

const CATEGORIES = ['All', 'Leadership', 'Strategy', 'Marketing', 'Sales', 'Finance', 'Legal', 'Operations']

const TAG_TO_CATEGORY: Record<string, string> = {
  'leadership': 'Leadership',
  'team building': 'Leadership',
  'strategy': 'Strategy',
  'business development': 'Strategy',
  'business transformation': 'Strategy',
  'product development': 'Strategy',
  'project management': 'Strategy',
  'marketing': 'Marketing',
  'social media': 'Marketing',
  'pr': 'Marketing',
  'branding': 'Marketing',
  'communication': 'Marketing',
  'communications': 'Marketing',
  'commmunications': 'Marketing',
  'digital marketing and social media': 'Marketing',
  'sales': 'Sales',
  'finance': 'Finance',
  'financials': 'Finance',
  'accounting': 'Finance',
  'auditing': 'Finance',
  'tax': 'Finance',
  'insurance': 'Finance',
  'finance and accounting': 'Finance',
  'legal': 'Legal',
  'partnerships': 'Legal',
  'company setup': 'Legal',
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

type PublicMentor = {
  id: string
  fullName: string
  avatarUrl: string | null
  linkedinUrl: string | null
  expertise: string[] | null
  bio: string | null
}

type MentorCard = {
  id: string
  name: string
  avatar: string
  linkedin: string | null
  specialty: string
  featured: boolean
  expertise: string[]
}

function toCard(m: PublicMentor): MentorCard {
  const tags = m.expertise ?? []
  return {
    id: m.id,
    name: m.fullName,
    avatar: m.avatarUrl ?? diceBearUrl(m.fullName),
    linkedin: m.linkedinUrl,
    specialty: m.bio ?? (tags.join(', ') || '—'),
    featured: tags.some((e) => /^featured$/i.test(e)),
    expertise: tags,
  }
}

export function HumanMentorsSection() {
  const [mentors, setMentors] = useState<MentorCard[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('All')

  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then((data: PublicMentor[]) => setMentors(data.map(toCard)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && mentors.length === 0) return null

  const filtered =
    activeCategory === 'All'
      ? mentors
      : mentors.filter((m) => getCategories(m.expertise).includes(activeCategory))

  return (
    <section id="mentors" className="relative py-28 bg-white overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-brand-primary/[0.04] blur-3xl pointer-events-none"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <SectionHeader
            badge="Human Mentors"
            heading="Human"
            highlight="Mentors"
            subtext="Book private one-on-one sessions with verified business experts."
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`relative px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat ? 'text-white' : 'text-brand-text-muted hover:text-brand-primary'
              }`}
            >
              {activeCategory === cat && (
                <motion.span
                  layoutId="human-pill"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark shadow-lg"
                />
              )}
              <span className="relative z-10">{cat}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-3xl bg-brand-surface-2 h-[280px]" />
            ))}
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filtered.map((mentor) => (
                <motion.div
                  key={mentor.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ y: -8 }}
                  className={`group relative rounded-3xl bg-white border transition-all p-7 flex flex-col items-center text-center ${
                    mentor.featured
                      ? 'border-brand-primary/40 shadow-[0_20px_50px_-20px_rgba(159,32,99,0.45)] bg-gradient-to-br from-white via-white to-brand-primary/[0.03]'
                      : 'border-brand-surface-2 shadow-sm hover:shadow-2xl hover:border-brand-primary/30'
                  }`}
                >
                  {mentor.featured && (
                    <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white text-[10px] font-bold uppercase tracking-wider shadow">
                      <Star className="w-3 h-3 fill-current" />
                      Featured
                    </span>
                  )}

                  <div className="relative mb-5">
                    <div
                      aria-hidden
                      className="absolute -inset-2 rounded-full bg-gradient-to-br from-brand-primary/30 to-brand-violet/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-brand-primary/80 ring-offset-4 ring-offset-white shadow-lg group-hover:ring-brand-primary transition-all">
                      <img
                        src={mentor.avatar}
                        alt={mentor.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-brand-text-primary leading-tight">
                    {mentor.name}
                  </h3>
                  <p className="text-sm text-brand-text-muted mt-1.5 leading-snug min-h-[2.5rem]">
                    {mentor.specialty}
                  </p>

                  <div className="mt-4 flex items-center gap-3">
                    {mentor.linkedin && (
                      <a
                        href="/sign-up"
                        aria-label={`${mentor.name} on LinkedIn`}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white transition-colors"
                      >
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                    <a
                      href="/sign-up"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-primary text-white text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(159,32,99,0.6)] hover:bg-brand-primary-dark transition-all group-hover:gap-2"
                    >
                      Book a Session
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </section>
  )
}
