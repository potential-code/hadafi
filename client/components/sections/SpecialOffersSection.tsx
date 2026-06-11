'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, ExternalLink, Scissors, Tag } from 'lucide-react'
import { SPECIAL_OFFERS } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { fetchPublicOffers, type Offer } from '@/lib/api/offers'

export function SpecialOffersSection() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('All')
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const pausedRef = useRef(false)

  useEffect(() => {
    fetchPublicOffers()
      .then(setOffers)
      .catch(() => setOffers([]))
      .finally(() => setLoading(false))
  }, [])

  const categories = ['All', ...Array.from(new Set(offers.map((o) => o.category)))]

  const filtered =
    activeCategory === 'All'
      ? offers
      : offers.filter((o) => o.category === activeCategory)

  // Duplicate the list so we can seamlessly loop the auto-scroll.
  const looped = filtered.length > 0 ? [...filtered, ...filtered] : filtered

  const updateArrows = () => {
    const el = trackRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: 0, behavior: 'auto' })
    updateArrows()
  }, [activeCategory])

  useEffect(() => {
    updateArrows()
    const onResize = () => updateArrows()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Continuous auto-scroll (~40 px/sec). Pauses when the user hovers a card
  // or when the user prefers reduced motion.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const SPEED = 40 // px per second
    let last = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const node = trackRef.current
      if (node && !pausedRef.current) {
        const half = node.scrollWidth / 2
        let next = node.scrollLeft + SPEED * dt
        if (half > 0 && next >= half) next -= half
        node.scrollLeft = next
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [activeCategory, looped.length])

  const scrollByCard = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-offer-card]')
    const step = card ? card.offsetWidth + 24 : el.clientWidth * 0.8
    pausedRef.current = true
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
    setTimeout(() => { pausedRef.current = false }, 700)
  }

  return (
    <section id="offers" className="relative py-28 bg-mesh-soft overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <SectionHeader
            badge={SPECIAL_OFFERS.badge}
            heading="Special SME"
            highlight="Offers"
            subtext={SPECIAL_OFFERS.subtext}
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`relative px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat ? 'text-white' : 'text-brand-text-muted hover:text-brand-primary'
              }`}
            >
              {activeCategory === cat && (
                <motion.span
                  layoutId="offers-pill"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark shadow-lg"
                />
              )}
              <span className="relative z-10">{cat}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          {/* Edge fades */}
          <div
            aria-hidden
            className={`pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-mesh-soft to-transparent transition-opacity ${
              canPrev ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-mesh-soft to-transparent transition-opacity ${
              canNext ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Arrows */}
          <button
            type="button"
            aria-label="Previous offers"
            onClick={() => scrollByCard(-1)}
            disabled={!canPrev}
            className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white border border-brand-surface-2 shadow-lg items-center justify-center text-brand-primary hover:bg-brand-primary hover:text-white hover:border-brand-primary transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Next offers"
            onClick={() => scrollByCard(1)}
            disabled={!canNext}
            className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white border border-brand-surface-2 shadow-lg items-center justify-center text-brand-primary hover:bg-brand-primary hover:text-white hover:border-brand-primary transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {loading ? (
            <div className="flex gap-6 overflow-hidden pb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[80%] sm:w-[46%] md:w-[31%] lg:w-[23%]">
                  <div className="rounded-t-2xl bg-brand-surface-2/60 animate-pulse h-36" />
                  <div className="h-px bg-brand-surface-2" />
                  <div className="rounded-b-2xl bg-brand-surface-2/60 animate-pulse h-28 mt-0" />
                </div>
              ))}
            </div>
          ) : (
          <motion.div
            ref={trackRef}
            layout
            onScroll={updateArrows}
            className="flex gap-6 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <AnimatePresence mode="popLayout">
              {looped.map((offer, i) => (
                <motion.a
                  key={`${offer.id}-${i}`}
                  href={SPECIAL_OFFERS.ctaHref}
                  data-offer-card
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ y: -6 }}
                  onMouseEnter={() => { pausedRef.current = true }}
                  onMouseLeave={() => { pausedRef.current = false }}
                  onFocus={() => { pausedRef.current = true }}
                  onBlur={() => { pausedRef.current = false }}
                  className="group relative block transition-transform shrink-0 w-[80%] sm:w-[46%] md:w-[31%] lg:w-[23%]"
                >
                {/* Coupon shape — top voucher + dashed perforation + bottom stub */}
                <div className="relative">
                  {/* Top */}
                  <div className="relative bg-white border border-brand-surface-2 group-hover:border-brand-primary/40 shadow-sm group-hover:shadow-2xl transition-all rounded-t-2xl overflow-hidden">
                    {/* Notches */}
                    <span className="absolute -left-3 bottom-0 w-6 h-6 rounded-full bg-mesh-soft border-r border-brand-surface-2 z-10" />
                    <span className="absolute -right-3 bottom-0 w-6 h-6 rounded-full bg-mesh-soft border-l border-brand-surface-2 z-10" />

                    {/* Offer image */}
                    <div className="h-36 overflow-hidden bg-gradient-to-br from-brand-surface to-brand-surface-2">
                      {offer.imageUrl && (
                        <img
                          src={offer.imageUrl}
                          alt={offer.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                    </div>

                    {/* Free stamp badge */}
                    {offer.priceLabel === 'Free' && (
                      <div className="absolute top-2 right-2 rotate-6 z-10">
                        <div className="bg-gradient-to-br from-brand-primary to-brand-primary-dark text-white text-[10px] font-black px-2.5 py-1.5 rounded-md shadow-lg uppercase tracking-wider">
                          Free
                        </div>
                      </div>
                    )}

                    <div className="px-6 pt-4 pb-5">
                      <div className="flex items-center justify-end mb-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-primary/8 text-brand-primary text-[10px] font-bold uppercase tracking-[0.16em]">
                          {offer.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-brand-text-primary leading-snug mb-4 text-[15px]">
                        {offer.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        {offer.priceBefore && (
                          <span className="text-xs text-rose-400 line-through">{offer.priceBefore}</span>
                        )}
                        <span className="text-sm font-bold text-brand-text-primary">{offer.priceLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Perforated divider */}
                  <div
                    aria-hidden
                    className="h-px bg-transparent border-t border-dashed border-brand-surface-2 group-hover:border-brand-primary/30 transition-colors relative z-10"
                  >
                    <Scissors className="absolute -top-2 left-3 w-3.5 h-3.5 text-brand-text-muted/50 -rotate-90" />
                  </div>

                  {/* Stub */}
                  <div className="relative bg-white border border-t-0 border-brand-surface-2 group-hover:border-brand-primary/40 rounded-b-2xl px-6 py-3.5 flex items-center justify-center overflow-hidden">
                    <span className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-mesh-soft border-r border-brand-surface-2" />
                    <span className="absolute -right-3 top-0 w-6 h-6 rounded-full bg-mesh-soft border-l border-brand-surface-2" />
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                      <Tag className="w-3 h-3" />
                      {SPECIAL_OFFERS.ctaLabel}
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </div>
                </motion.a>
              ))}
            </AnimatePresence>
          </motion.div>
          )}
        </div>
      </div>
    </section>
  )
}
