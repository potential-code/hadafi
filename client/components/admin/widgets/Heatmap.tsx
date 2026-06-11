'use client'

import { motion } from 'framer-motion'
import { HEATMAP_DAYS, HEATMAP_HOURS, HEATMAP_DATA } from '@/lib/adminData'

function colorFor(value: number) {
  // 0..100 → magenta intensity
  const alpha = 0.08 + (value / 100) * 0.85
  return `rgba(159, 32, 99, ${alpha.toFixed(3)})`
}

export function Heatmap() {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 min-w-full">
        <thead>
          <tr>
            <th className="w-12" />
            {HEATMAP_HOURS.map((h) => (
              <th key={h} className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted px-2 pb-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HEATMAP_DATA.map((row, ri) => (
            <tr key={HEATMAP_DAYS[ri]}>
              <td className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted pr-2 text-right">
                {HEATMAP_DAYS[ri]}
              </td>
              {row.map((v, ci) => (
                <td key={ci}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: (ri * row.length + ci) * 0.012, duration: 0.3 }}
                    className="h-9 w-full rounded-md flex items-center justify-center text-[10px] font-bold text-brand-text-primary/70 hover:scale-110 transition-transform cursor-default"
                    style={{ background: colorFor(v) }}
                    title={`${HEATMAP_DAYS[ri]} ${HEATMAP_HOURS[ci]} · ${v}`}
                  >
                    {v}
                  </motion.div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
