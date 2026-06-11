// client/components/dashboard/assistant-cards/OfferAssistantCards.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Coins, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { fetchOffers } from '@/lib/api/offers'
import { filterOffers, filterOffersByIds } from './filterUtils'
import { AssistantCardStrip, AssistantCardSkeleton } from './AssistantCardStrip'

interface Props {
  topic?: string
  ids?: string[]
  redeemableOnly?: boolean
  actionStatus: string
}

export function OfferAssistantCards({ topic, ids, redeemableOnly, actionStatus }: Props) {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: fetchOffers,
    enabled: actionStatus !== 'inProgress',
  })

  if (actionStatus === 'inProgress' || isLoading) return <AssistantCardSkeleton />

  const offers = data?.offers ?? []
  const userPoints = data?.userPoints ?? 0
  const idOrTopicFiltered = ids && ids.length > 0 ? filterOffersByIds(offers, ids) : filterOffers(offers, topic)
  const filtered = redeemableOnly ? idOrTopicFiltered.filter((o) => userPoints >= o.pointsCost) : idOrTopicFiltered

  if (filtered.length === 0) return null

  return (
    <AssistantCardStrip>
      {filtered.map((offer, i) => {
        const canRedeem = userPoints >= offer.pointsCost
        const pointsShort = offer.pointsCost - userPoints

        return (
          <motion.div
            key={offer.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="w-52 flex-shrink-0 rounded-xl bg-white border border-brand-surface-2 overflow-hidden hover:border-brand-primary/40 hover:shadow-md transition-all"
          >
            <div className="relative h-24 overflow-hidden bg-gradient-to-br from-brand-primary via-brand-primary-dark to-violet-700">
              {offer.imageUrl && (
                <img
                  src={offer.imageUrl}
                  alt={offer.title}
                  className="w-full h-full object-cover"
                />
              )}
              <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-white/90 text-brand-primary text-[9px] font-bold uppercase tracking-wider">
                {offer.category}
              </span>
            </div>

            <div className="p-3 flex flex-col gap-1.5">
              <h4 className="font-bold text-[12px] text-brand-text-primary leading-snug line-clamp-2">
                {offer.title}
              </h4>
              <div className="flex items-center gap-1 text-[11px]">
                <Coins className="w-3 h-3 text-violet-500 flex-shrink-0" />
                <span className="font-semibold text-violet-600">
                  {offer.pointsCost.toLocaleString()} pts
                </span>
                {offer.priceLabel && (
                  <span className="text-brand-text-muted">· {offer.priceLabel}</span>
                )}
              </div>

              {canRedeem ? (
                <button
                  onClick={() => router.push(`/dashboard/offers/${offer.id}`)}
                  className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-3 py-1.5 text-[11px] font-bold shadow-sm hover:-translate-y-0.5 transition-all"
                >
                  <ShoppingBag className="w-3 h-3" />
                  Redeem Now
                </button>
              ) : (
                <div className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-surface-2 bg-brand-surface text-brand-text-muted px-3 py-1.5 text-[11px] font-semibold cursor-default">
                  <Lock className="w-3 h-3" />
                  Need {pointsShort.toLocaleString()} more pts
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </AssistantCardStrip>
  )
}
