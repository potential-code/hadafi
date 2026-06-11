import type { LearnerCourse } from '@/lib/api/lms'
import type { Offer } from '@/lib/api/offers'
import type { LiveEvent } from '@/lib/api/liveEvents'

export function filterCourses(
  courses: LearnerCourse[],
  intent: string,
  topic?: string,
): LearnerCourse[] {
  let result: LearnerCourse[]

  if (intent === 'all') {
    result = [...courses].sort((a, b) => Number(b.isEnrolled) - Number(a.isEnrolled))
  } else if (intent === 'enrolled') {
    result = courses
      .filter((c) => c.isEnrolled)
      .sort((a, b) => b.progressPercentage - a.progressPercentage)
  } else if (intent === 'in-progress') {
    result = courses.filter(
      (c) => c.isEnrolled && c.progressPercentage > 0 && c.progressPercentage < 100,
    )
  } else if (intent === 'not-started') {
    result = courses.filter((c) => c.isEnrolled && c.progressPercentage === 0)
  } else if (intent === 'completed') {
    result = courses.filter((c) => c.isEnrolled && c.progressPercentage === 100)
  } else if (intent === 'topic') {
    if (!topic) {
      result = []
    } else {
      const kw = topic.toLowerCase()
      result = courses.filter(
        (c) =>
          c.title.toLowerCase().includes(kw) ||
          (c.description?.toLowerCase().includes(kw) ?? false),
      )
    }
  } else {
    result = []
  }

  return result
}

export function getCourseCta(course: LearnerCourse): {
  label: string
  intent: 'enroll' | 'start' | 'continue' | 'review'
} {
  if (!course.isEnrolled) return { label: 'Enroll & Start', intent: 'enroll' }
  if (course.progressPercentage === 0) return { label: 'Start Course', intent: 'start' }
  if (course.progressPercentage < 100) return { label: 'Continue Course', intent: 'continue' }
  return { label: 'Review Course', intent: 'review' }
}

export function filterOffers(offers: Offer[], topic?: string): Offer[] {
  if (!topic) return offers
  const kw = topic.toLowerCase()
  return offers.filter(
    (o) =>
      o.title.toLowerCase().includes(kw) || o.category.toLowerCase().includes(kw),
  )
}

export function filterCoursesByIds(courses: LearnerCourse[], ids: string[]): LearnerCourse[] {
  return courses.filter((c) => ids.includes(c.id))
}

export function filterOffersByIds(offers: Offer[], ids: string[]): Offer[] {
  return offers.filter((o) => ids.includes(o.id))
}

export function filterMentorsByIds<T extends { id: string }>(mentors: T[], ids: string[]): T[] {
  return mentors.filter((m) => ids.includes(m.id))
}

export function filterAiMentorsBySlugs<T extends { slug: string }>(mentors: readonly T[], slugs: string[]): T[] {
  return mentors.filter((m) => slugs.includes(m.slug))
}

export function filterEventsByIds(events: LiveEvent[], ids: string[]): LiveEvent[] {
  return events.filter((e) => ids.includes(e.id))
}

export function isEventPast(event: LiveEvent): boolean {
  return new Date(event.date) < new Date(new Date().setHours(0, 0, 0, 0))
}
