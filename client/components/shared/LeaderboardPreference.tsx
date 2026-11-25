'use client'

/**
 * "Leaderboard" on the learner profile: appear on the Achievements leaderboard
 * or not (PUT /api/me/leaderboard-visibility). Off by default. It lives here,
 * not on Achievements, because the leaderboard stays hidden until enough
 * learners take part, and the page shouldn't hint at how many do.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type Achievements = { showOnLeaderboard: boolean }

export function LeaderboardPreference({ className }: { className?: string }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['me', 'achievements'],
    queryFn: () => apiFetch<{ data: Achievements }>('/api/me/achievements').then((r) => r.data),
  })
  const save = useMutation({
    mutationFn: (on: boolean) => apiFetch('/api/me/leaderboard-visibility', { method: 'PUT', body: JSON.stringify({ show: on }) }),
    onMutate: (on) => qc.setQueryData<Achievements>(['me', 'achievements'], (a) => (a ? { ...a, showOnLeaderboard: on } : a)),
    onSuccess: (_d, on) => {
      toast.success(on ? 'You’ll appear on the leaderboard' : 'You won’t appear on the leaderboard')
      void qc.invalidateQueries({ queryKey: ['me', 'leaderboard'] })
    },
    onError: () => {
      toast.error('That didn’t save. Try again.')
      void qc.invalidateQueries({ queryKey: ['me', 'achievements'] })
    },
  })
  return (
    <section aria-labelledby="p-leaderboard" className={cn('flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]', className)}>
      <h2 id="p-leaderboard" className="flex items-center gap-2 text-base font-semibold text-ui-text">
        <Trophy className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
        Leaderboard
      </h2>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="p-show-leaderboard" className="min-w-0">
          <span className="block text-sm font-medium text-ui-text">Show me on the leaderboard</span>
          <span className="block text-[13px] text-ui-muted">Other learners see your first name and initial and your points, never your email.</span>
        </label>
        <Switch
          id="p-show-leaderboard"
          checked={data?.showOnLeaderboard ?? false}
          disabled={!data || save.isPending}
          onCheckedChange={(v) => save.mutate(v)}
          className="data-[state=checked]:bg-ui-brand data-[state=unchecked]:bg-ui-line"
        />
      </div>
    </section>
  )
}
