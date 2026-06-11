'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Play, Layers } from 'lucide-react'
import { COURSES } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'

export function CoursesSection() {
  const [activeCategory, setActiveCategory] = useState(0)
  const [openModule, setOpenModule] = useState<number | null>(0)

  const category = COURSES.categories[activeCategory]
  const totalUnits = category.modules.reduce((s, m) => s + m.units.length, 0)

  return (
    <section id="courses" className="relative py-28 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <SectionHeader
            badge={COURSES.badge}
            heading="The Entrepreneur's"
            highlight="Journey"
          />
        </div>

        {/* Pill scroller */}
        <div className="relative mb-10">
          <div className="flex flex-wrap gap-2 justify-center">
            {COURSES.categories.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => {
                  setActiveCategory(i)
                  setOpenModule(0)
                }}
                className={`relative px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  activeCategory === i
                    ? 'text-white'
                    : 'text-brand-text-muted hover:text-brand-primary'
                }`}
              >
                {activeCategory === i && (
                  <motion.span
                    layoutId="course-pill"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark shadow-lg"
                  />
                )}
                <span className="relative z-10">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              {/* Stats bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6 px-1">
                <div className="flex items-center gap-3 text-brand-text-muted text-sm">
                  <Layers className="w-4 h-4 text-brand-primary" />
                  <span>
                    <span className="font-bold text-brand-text-primary">{category.modules.length}</span> module
                    {category.modules.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-brand-surface-2">•</span>
                  <span>
                    <span className="font-bold text-brand-text-primary">{totalUnits}</span> units
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {category.modules.map((mod, mi) => {
                  const open = openModule === mi
                  return (
                    <div
                      key={mod.title}
                      className={`rounded-2xl border bg-white transition-all ${
                        open
                          ? 'border-brand-primary/30 shadow-lg shadow-brand-primary/5'
                          : 'border-brand-surface-2 hover:border-brand-primary/20'
                      }`}
                    >
                      <button
                        onClick={() => setOpenModule(open ? null : mi)}
                        className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-5 text-left"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-primary font-bold text-sm">
                              {String(mi + 1).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-brand-text-primary leading-tight truncate">
                              {mod.title}
                            </p>
                            <p className="text-xs text-brand-text-muted mt-0.5">
                              {mod.units.length} units
                            </p>
                          </div>
                        </div>
                        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronDown className="w-5 h-5 text-brand-text-muted flex-shrink-0" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                            className="overflow-hidden"
                          >
                            <ul className="px-5 sm:px-6 pb-5 grid sm:grid-cols-2 gap-x-6">
                              {mod.units.map((unit, ui) => (
                                <motion.li
                                  key={unit}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.04 * ui }}
                                  className="flex items-start gap-3 py-2 text-sm text-brand-text-muted border-t border-brand-surface-2/60 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                                >
                                  <div className="w-6 h-6 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Play className="w-2.5 h-2.5 text-brand-primary fill-brand-primary" />
                                  </div>
                                  <span className="leading-snug">{unit}</span>
                                </motion.li>
                              ))}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
