'use client'

import { motion } from 'framer-motion'
import { COMMUNITY, REDESIGN_ASSETS } from '@/lib/constants'
import { AnimatedCounter } from '@/components/shared/AnimatedCounter'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { useReducedMotion } from '@/hooks/useReducedMotion'

// Approximate lat/lng → percentage positions for hub markers on the world map.
const HUBS = [
  { name: 'New York', x: 26, y: 38 },
  { name: 'London', x: 47, y: 32 },
  { name: 'Lagos', x: 49, y: 56 },
  { name: 'Dubai', x: 60, y: 47 },
  { name: 'Mumbai', x: 67, y: 53 },
  { name: 'Singapore', x: 74, y: 62 },
  { name: 'São Paulo', x: 33, y: 70 },
] as const

// Pairs of hub indices to draw arcs between.
const ARCS: Array<[number, number]> = [
  [0, 1],
  [1, 3],
  [3, 4],
  [4, 5],
  [1, 2],
  [0, 6],
  [3, 2],
]

function arcPath(x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.25 - 6
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

export function CommunitySection() {
  const reduced = useReducedMotion()

  return (
    <section id="community" className="relative py-28 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionHeader
            badge={COMMUNITY.badge}
            heading="Meet Our"
            highlight="Community"
            subtext={COMMUNITY.subtext}
          />
        </div>

        {/* Map with animated SVG arcs/nodes */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8 }}
          className="relative mx-auto max-w-5xl rounded-3xl overflow-hidden border border-brand-surface-2 shadow-xl bg-brand-deep"
        >
          <img
            src={REDESIGN_ASSETS.worldMap.src}
            alt={REDESIGN_ASSETS.worldMap.alt}
            className="w-full h-auto block opacity-90"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/50 via-transparent to-transparent pointer-events-none" />

          {/* SVG overlay — arcs + nodes */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden
          >
            <defs>
              <linearGradient id="arc-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#e83e94" stopOpacity="0" />
                <stop offset="50%" stopColor="#e83e94" stopOpacity="1" />
                <stop offset="100%" stopColor="#c026d3" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="node-glow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#e83e94" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#e83e94" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Arcs */}
            {ARCS.map(([a, b], i) => {
              const A = HUBS[a]
              const B = HUBS[b]
              return (
                <motion.path
                  key={`${a}-${b}`}
                  d={arcPath(A.x, A.y, B.x, B.y)}
                  fill="none"
                  stroke="url(#arc-grad)"
                  strokeWidth="0.4"
                  strokeLinecap="round"
                  initial={reduced ? { pathLength: 1, opacity: 0.7 } : { pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 0.85 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: 1.6, delay: 0.4 + i * 0.18, ease: 'easeOut' }
                  }
                />
              )
            })}

            {/* Nodes */}
            {HUBS.map((h, i) => (
              <g key={h.name}>
                {/* Pulsing halo */}
                <motion.circle
                  cx={h.x}
                  cy={h.y}
                  r="1.6"
                  fill="url(#node-glow)"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                />
                {!reduced && (
                  <motion.circle
                    cx={h.x}
                    cy={h.y}
                    r="0.8"
                    fill="none"
                    stroke="#e83e94"
                    strokeWidth="0.25"
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.4, 1] }}
                    transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.3 }}
                    style={{ transformOrigin: `${h.x}px ${h.y}px` }}
                  />
                )}
                {/* Solid dot */}
                <motion.circle
                  cx={h.x}
                  cy={h.y}
                  r="0.6"
                  fill="#fff"
                  stroke="#e83e94"
                  strokeWidth="0.18"
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 220 }}
                  style={{ transformOrigin: `${h.x}px ${h.y}px` }}
                />
              </g>
            ))}
          </svg>

          {/* City labels */}
          <div className="absolute inset-0 pointer-events-none">
            {HUBS.map((h, i) => (
              <motion.span
                key={h.name}
                initial={{ opacity: 0, y: 4 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="absolute -translate-x-1/2 translate-y-2 text-[9px] sm:text-[10px] font-semibold text-white/85 whitespace-nowrap drop-shadow"
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
              >
                {h.name}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* Stats overlapping */}
        <div className="relative -mt-12 sm:-mt-16 z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto px-4">
          {COMMUNITY.stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i, duration: 0.5 }}
              className="rounded-2xl bg-white border border-brand-surface-2 shadow-2xl p-6 text-center"
            >
              <div className="text-3xl sm:text-4xl font-bold text-gradient-magenta">
                <AnimatedCounter
                  value={stat.value}
                  display={stat.display}
                  animate={stat.animate}
                />
              </div>
              <p className="text-brand-text-muted text-sm font-medium mt-2">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
