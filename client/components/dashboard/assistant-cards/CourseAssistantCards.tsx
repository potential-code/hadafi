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
import { optimizedSrc } from '@/lib/images'

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
            className="w-52 flex-shrink-0 rounded-[14px] bg-ui-surface border border-ui-line overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-ui"
          >
            <div className="relative h-24 overflow-hidden">
              {course.cover ? (
                <img
                  src={optimizedSrc(course.cover)}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-ui-brand-soft flex items-center justify-center">
                  <BookOpenCheck className="w-6 h-6 text-ui-brand-text" aria-hidden />
                </div>
              )}
              <span
                className={cn(
                  'absolute top-1.5 end-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-ui-surface/95 text-ui-text',
                )}
              >
                {course.difficulty}
              </span>
            </div>

            {course.isEnrolled && pct > 0 && (
              <div className="px-3 pt-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-ui-muted mb-1">
                  <span>Progress</span>
                  <span className="text-ui-brand-text">{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-ui-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ui-brand"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="p-3 pt-2 flex flex-col gap-1.5">
              <h4 className="font-semibold text-[14px] text-ui-text leading-snug line-clamp-2">
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
                className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-3 text-[13px] font-semibold transition-colors disabled:opacity-70"
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
