// client/components/dashboard/assistant-cards/CourseAssistantCards.tsx
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { BookOpenCheck, GraduationCap, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { fetchLearnerCourses, apiEnrollInCourse } from '@/lib/api/lms'
import { filterCourses, filterCoursesByIds, getCourseCta } from './filterUtils'
import { AssistantCardStrip, AssistantCardSkeleton } from './AssistantCardStrip'
import { cn } from '@/lib/utils'

interface Props {
  intent: string
  topic?: string
  ids?: string[]
  actionStatus: string
}

export function CourseAssistantCards({ intent, topic, ids, actionStatus }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['learner-courses'],
    queryFn: fetchLearnerCourses,
    enabled: actionStatus !== 'inProgress',
  })

  const enrollMutation = useMutation({
    mutationFn: apiEnrollInCourse,
    onSuccess: (_, courseId) => {
      queryClient.invalidateQueries({ queryKey: ['learner-courses'] })
      router.push(`/dashboard/courses/${courseId}`)
    },
    onError: () => toast.error('Failed to enroll. Please try again.'),
  })

  if (actionStatus === 'inProgress' || isLoading) return <AssistantCardSkeleton />

  const filtered = ids && ids.length > 0
    ? filterCoursesByIds(courses, ids)
    : filterCourses(courses, intent, topic)
  if (filtered.length === 0) return null

  return (
    <AssistantCardStrip>
      {filtered.map((course, i) => {
        const cta = getCourseCta(course)
        const pct = course.progressPercentage
        const isEnrolling =
          enrollMutation.isPending && enrollMutation.variables === course.id

        return (
          <motion.div
            key={course.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="w-52 flex-shrink-0 rounded-xl bg-white border border-brand-surface-2 overflow-hidden hover:border-brand-primary/40 hover:shadow-md transition-all"
          >
            <div className="relative h-24 overflow-hidden">
              {course.cover ? (
                <img
                  src={course.cover}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center">
                  <BookOpenCheck className="w-6 h-6 text-white/60" />
                </div>
              )}
              <span
                className={cn(
                  'absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider',
                  course.difficulty === 'Beginner' && 'bg-emerald-500 text-white',
                  course.difficulty === 'Intermediate' && 'bg-amber-500 text-white',
                  course.difficulty === 'Advanced' && 'bg-rose-500 text-white',
                )}
              >
                {course.difficulty}
              </span>
            </div>

            {course.isEnrolled && pct > 0 && (
              <div className="px-3 pt-2">
                <div className="flex items-center justify-between text-[9px] font-bold text-brand-text-muted uppercase tracking-wider mb-1">
                  <span>Progress</span>
                  <span className="text-brand-primary">{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-brand-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="p-3 pt-2 flex flex-col gap-1.5">
              <h4 className="font-bold text-[12px] text-brand-text-primary leading-snug line-clamp-2">
                {course.title}
              </h4>
              <button
                onClick={() => {
                  if (cta.intent === 'enroll') {
                    enrollMutation.mutate(course.id)
                  } else {
                    router.push(`/dashboard/courses/${course.id}`)
                  }
                }}
                disabled={isEnrolling}
                className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-3 py-1.5 text-[11px] font-bold shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all disabled:opacity-70"
              >
                {isEnrolling ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <GraduationCap className="w-3 h-3" />
                )}
                {isEnrolling ? 'Enrolling…' : cta.label}
              </button>
            </div>
          </motion.div>
        )
      })}
    </AssistantCardStrip>
  )
}
