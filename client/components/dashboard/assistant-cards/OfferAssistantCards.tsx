// client/components/dashboard/assistant-cards/OfferAssistantCards.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Coins, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { fetchOffers } from '@/lib/api/offers'
import { filterOffers, filterOffersByIds } from './filterUtils'
import { AssistantCardStrip, AssistantCardSkeleton } from './AssistantCardStrip'
import { optimizedSrc } from '@/lib/images'

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
            className="w-52 flex-shrink-0 rounded-[14px] bg-ui-surface border border-ui-line overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-ui"
          >
            <div className="relative h-24 overflow-hidden bg-ui-brand-soft">
              {offer.imageUrl && (
                <img
                  src={optimizedSrc(offer.imageUrl)}
                  alt={offer.title}
                  className="w-full h-full object-cover"
                />
              )}
              <span className="absolute top-1.5 start-1.5 px-2 py-0.5 rounded-full bg-ui-surface/90 text-ui-brand-text text-[11px] font-semibold">
                {offer.category}
              </span>
            </div>

            <div className="p-3 flex flex-col gap-1.5">
              <h4 className="font-semibold text-[14px] text-ui-text leading-snug line-clamp-2">
                {offer.title}
              </h4>
              <div className="flex items-center gap-1 text-[13px]">
                <Coins className="w-3 h-3 text-ui-brand-text flex-shrink-0" />
                <span className="font-semibold text-ui-brand-text">
                  {offer.pointsCost.toLocaleString()} pts
                </span>
                {offer.priceLabel && (
                  <span className="text-ui-muted">· {offer.priceLabel}</span>
                )}
              </div>

              {canRedeem ? (
                <button
                  onClick={() => router.push(`/dashboard/offers/${offer.id}`)}
                  className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-3 text-[13px] font-semibold transition-colors"
                >
                  <ShoppingBag className="w-3 h-3" />
                  Redeem now
                </button>
              ) : (
                <div className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-ui-line bg-ui-surface-2 text-ui-muted h-8 px-3 text-[13px] font-semibold cursor-default">
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
