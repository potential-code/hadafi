'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Download,
  FileText,
  GraduationCap,
  ImageIcon,
  ListChecks,
  Lock,
  Menu,
  PlayCircle,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import {
  fetchLearnerCourse,
  apiEnrollInCourse,
  apiUpdateBlockProgress,
  fetchCourseCertificate,
  apiIssueCertificate,
  downloadActionPlanPdf,
  type LearnerCourseDetail,
  type LearnerBlock,
  type LearnerModule,
  type CourseCertificate,
} from '@/lib/api/lms'
import { VideoBlock } from '@/components/lms/VideoBlock'
import { TextBlock } from '@/components/lms/TextBlock'
import { ImageBlock } from '@/components/lms/ImageBlock'
import { SurveyBlock } from '@/components/lms/SurveyBlock'
import { ActionPlanBlock } from '@/components/lms/ActionPlanBlock'
import { AssessmentView } from '@/components/lms/AssessmentView'
import { CertificateModal } from '@/components/lms/CertificateModal'
import { cn } from '@/lib/utils'

// ─── Nav item types ────────────────────────────────────────────────────────────

type AssessmentItem = {
  kind: 'assessment'
  id: string
  title: string
  assessmentType: 'pre' | 'post'
  isLocked: boolean
  isCompleted: boolean
}

type BlockNavItem = {
  kind: 'block'
  block: LearnerBlock
  moduleIdx: number
  unitIdx: number
  blockIdx: number
  moduleId: string
  unitId: string
}

type NavItem = AssessmentItem | BlockNavItem

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const courseId = params?.id ?? ''

  const queryClient = useQueryClient()

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ['learner-course', courseId],
    queryFn: () => fetchLearnerCourse(courseId),
    enabled: !!courseId,
    staleTime: 30_000,
  })

  const enrollMutation = useMutation({
    mutationFn: () => apiEnrollInCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-course', courseId] })
    },
  })

  const completeBlockMutation = useMutation({
    mutationFn: (blockId: string) => apiUpdateBlockProgress(blockId, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-course', courseId] })
    },
  })

  // ─── Flat navigation list ──────────────────────────────────────────────────
  const navItems = useMemo<NavItem[]>(() => {
    if (!course) return []
    const items: NavItem[] = []

    if (course.preAssessment) {
      items.push({
        kind: 'assessment',
        id: course.preAssessment.id,
        title: course.preAssessment.title,
        assessmentType: 'pre',
        isLocked: course.preAssessment.isLocked,
        isCompleted: course.preAssessment.isCompleted,
      })
    }

    for (let mi = 0; mi < course.modules.length; mi++) {
      const mod = course.modules[mi]
      for (let ui = 0; ui < mod.units.length; ui++) {
        const unit = mod.units[ui]
        for (let bi = 0; bi < unit.blocks.length; bi++) {
          items.push({
            kind: 'block',
            block: unit.blocks[bi],
            moduleIdx: mi,
            unitIdx: ui,
            blockIdx: bi,
            moduleId: mod.id,
            unitId: unit.id,
          })
        }
      }
    }

    if (course.postAssessment) {
      items.push({
        kind: 'assessment',
        id: course.postAssessment.id,
        title: course.postAssessment.title,
        assessmentType: 'post',
        isLocked: course.postAssessment.isLocked,
        isCompleted: course.progressPercentage >= 100,
      })
    }

    return items
  }, [course])

  const [activeIdx, setActiveIdx] = useState(0)
  const [videoWatchUnlocked, setVideoWatchUnlocked] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const hasAutoNavigated = useRef(false)
  const [certModal, setCertModal] = useState<{ open: boolean; certificate: CourseCertificate | null }>({
    open: false,
    certificate: null,
  })
  const mainRef = useRef<HTMLDivElement>(null)
  const certShownRef = useRef(false)

  // Reset state when courseId changes
  useEffect(() => {
    setActiveIdx(0)
    setMobileMenuOpen(false)
    hasAutoNavigated.current = false
  }, [courseId])

  // Auto-navigate to the first incomplete item when the course loads
  useEffect(() => {
    if (hasAutoNavigated.current || navItems.length === 0) return
    const firstIncompleteIdx = navItems.findIndex((item) => {
      if (item.kind === 'block') {
        return !item.block.isLocked && item.block.blockProgress?.status !== 'completed'
      }
      if (item.kind === 'assessment') {
        return !item.isLocked && !item.isCompleted
      }
      return false
    })
    if (firstIncompleteIdx >= 0) {
      setActiveIdx(firstIncompleteIdx)
    }
    hasAutoNavigated.current = true
  }, [navItems])

  const activeItem = navItems[activeIdx] ?? null
  const isLast = activeIdx === navItems.length - 1

  const hasActionPlanQuestions = course?.modules.some((m) =>
    m.units.some((u) =>
      u.blocks.some((b) =>
        b.questions.some((q) => q.kind === 'action-plan')
      )
    )
  ) ?? false

  const handleComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['learner-course', courseId] })
  }, [queryClient, courseId])

  // Check certificate after invalidation resolves when progress hits 100
  useEffect(() => {
    if (!course || course.progressPercentage < 100 || !course.enableCertificate) return
    if (certShownRef.current) return

    const checkCert = async () => {
      try {
        let cert: CourseCertificate | null
        try {
          cert = await fetchCourseCertificate(courseId)
        } catch {
          // 404 (or any fetch error) means no cert exists yet — issue one
          cert = await apiIssueCertificate(courseId)
        }
        certShownRef.current = true
        setCertModal({ open: true, certificate: cert })
      } catch {
        // Certificate issue also failed — not critical, skip modal
      }
    }

    checkCert()
  }, [course?.progressPercentage, courseId, course?.enableCertificate])

  const handleViewCertificate = async () => {
    if (certModal.certificate) {
      setCertModal((prev) => ({ ...prev, open: true }))
      return
    }
    try {
      const cert = await fetchCourseCertificate(courseId)
      setCertModal({ open: true, certificate: cert })
    } catch {
      toast.error('Certificate not available yet')
    }
  }

  const handleDownloadActionPlan = async () => {
    try {
      const response = await downloadActionPlanPdf(courseId)
      if (!response.ok) {
        toast.error('No action plan available yet')
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'action-plan.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download action plan')
    }
  }

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= navItems.length) return
    setActiveIdx(idx)
    setVideoWatchUnlocked(false)
    setMobileMenuOpen(false)
    requestAnimationFrame(() => {
      mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleAdvance = () => {
    if (!isLast) {
      goTo(activeIdx + 1)
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-24 rounded bg-brand-surface-2" />
          <div className="h-48 rounded-2xl bg-brand-surface-2" />
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            <div className="h-96 rounded-2xl bg-brand-surface-2" />
            <div className="h-96 rounded-2xl bg-brand-surface-2" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (isError || !course) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto text-center py-24">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-primary/10 text-brand-primary mb-6">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-brand-text-primary mb-2">Course not found</h1>
          <p className="text-sm text-brand-text-muted mb-6">
            We couldn&apos;t find the course you&apos;re looking for. It may have been moved.
          </p>
          <Link
            href="/dashboard/courses"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary text-white px-4 py-2 text-sm font-bold hover:bg-brand-primary-dark transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to courses
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  // ─── Enrollment guard ──────────────────────────────────────────────────────
  if (!course.isEnrolled) {
    return (
      <DashboardLayout>
        <div className="mb-4">
          <Link
            href="/dashboard/courses"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted hover:text-brand-primary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All courses
          </Link>
        </div>
        <div className="max-w-xl mx-auto text-center py-12">
          {course.cover && (
            <div className="mx-auto w-56 mb-6">
              <div className="relative aspect-[16/10] rounded-2xl overflow-hidden ring-1 ring-brand-surface-2 shadow-lg">
                <img src={course.cover} alt={course.title} className="absolute inset-0 w-full h-full object-cover" />
              </div>
            </div>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-[0.2em] mb-3">
            <Sparkles className="w-3 h-3" />
            {course.difficulty}
          </span>
          <h1 className="mt-2 text-2xl font-black text-brand-text-primary mb-2">{course.title}</h1>
          {course.description && (
            <p className="text-sm text-brand-text-muted mb-8 max-w-md mx-auto leading-relaxed">
              {course.description}
            </p>
          )}
          <div className="mb-8">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-brand-text-muted font-bold mb-1.5">
              <span>Progress</span>
              <span>0%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-brand-surface-2" />
          </div>
          <button
            onClick={() => enrollMutation.mutate()}
            disabled={enrollMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-6 py-3 text-sm font-bold shadow-lg shadow-brand-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            {enrollMutation.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Enrolling…
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4" />
                Enroll in Course
              </>
            )}
          </button>
          {enrollMutation.isError && (
            <p className="mt-3 text-xs text-red-600">Failed to enroll. Please try again.</p>
          )}
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      {/* Back link */}
      <div className="mb-4">
        <Link
          href="/dashboard/courses"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-text-muted hover:text-brand-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All courses
        </Link>
      </div>

      {/* Course header */}
      <CourseHeader
        course={course}
        activeItem={activeItem}
        onViewCertificate={course.enableCertificate && course.progressPercentage >= 100 ? handleViewCertificate : undefined}
        onDownloadActionPlan={course.progressPercentage >= 100 && hasActionPlanQuestions ? handleDownloadActionPlan : undefined}
      />

      {/* Mobile menu trigger */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden mt-4 inline-flex items-center gap-2 rounded-xl bg-white border border-brand-surface-2 px-3 py-2 text-xs font-bold text-brand-text-primary shadow-sm"
      >
        <Menu className="w-4 h-4" />
        Course menu
        <span className="ml-1 text-brand-text-muted">
          · {Math.round(course.progressPercentage)}%
        </span>
      </button>

      {/* Two-column layout */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr] gap-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <CourseMenu
              course={course}
              navItems={navItems}
              activeIdx={activeIdx}
              onSelect={goTo}
            />
          </div>
        </aside>

        {/* Main content */}
        <div ref={mainRef} className="min-w-0">
          {activeItem ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.kind === 'block' ? activeItem.block.id : `assessment-${activeItem.id}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {activeItem.kind === 'assessment' ? (
                  <AssessmentView
                    assessmentId={activeItem.id}
                    isLocked={activeItem.isLocked}
                    onCompleted={handleComplete}
                  />
                ) : (
                  <BlockShell
                    course={course}
                    item={activeItem}
                  >
                    <BlockRenderer
                      block={activeItem.block}
                      onCompleted={handleComplete}
                      onAdvance={isLast ? undefined : handleAdvance}
                      onWatchThreshold={() => setVideoWatchUnlocked(true)}
                    />
                  </BlockShell>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="rounded-2xl bg-white border border-brand-surface-2 p-8 text-center text-sm text-brand-text-muted">
              Select a section from the menu to begin.
            </div>
          )}

          {/* Prev / Next nav */}
          {navItems.length > 0 && (
            <div className="mt-6 flex items-center justify-between gap-3">
              {/* Previous — hidden on first item */}
              {activeIdx > 0 ? (
                <button
                  onClick={() => goTo(activeIdx - 1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white border border-brand-surface-2 px-4 py-2.5 text-xs font-bold text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous
                </button>
              ) : (
                <span />
              )}

              {/* Right: context-aware CTA */}
              {(() => {
                const isPreAssessmentGating =
                  activeItem?.kind === 'assessment' &&
                  activeItem.assessmentType === 'pre' &&
                  !(course.preAssessment?.isCompleted ?? false)

                if (isPreAssessmentGating) return <span />

                const activeBlock = activeItem?.kind === 'block' ? activeItem.block : null
                const isBlockCompleted = activeBlock?.blockProgress?.status === 'completed'

                // Question blocks: disabled until submitted internally
                if (activeBlock?.type === 'question' && !isBlockCompleted) {
                  return (
                    <button
                      disabled
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold opacity-40 cursor-not-allowed shadow-none transition-all"
                    >
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )
                }

                // Video blocks: gated by 95% watch — unlock signal comes from VideoBlock
                if (activeBlock?.type === 'video' && !isBlockCompleted) {
                  if (!videoWatchUnlocked) {
                    return (
                      <button
                        disabled
                        className="inline-flex items-center gap-2 rounded-xl bg-brand-surface-2 text-brand-text-muted px-5 py-2.5 text-xs font-bold cursor-not-allowed"
                      >
                        <Lock className="w-4 h-4" />
                        Watch to complete
                      </button>
                    )
                  }
                  return (
                    <button
                      onClick={() => completeBlockMutation.mutate(activeBlock.id)}
                      disabled={completeBlockMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-lg shadow-brand-primary/30 hover:shadow-xl hover:shadow-brand-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {completeBlockMutation.isPending ? 'Saving…' : 'Mark as complete'}
                    </button>
                  )
                }

                // Text / image blocks not yet complete: "Mark as complete" → advance
                if (activeBlock && !isBlockCompleted) {
                  return (
                    <button
                      onClick={() =>
                        completeBlockMutation.mutate(activeBlock.id, {
                          onSuccess: handleAdvance,
                        })
                      }
                      disabled={completeBlockMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-lg shadow-brand-primary/30 hover:shadow-xl hover:shadow-brand-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {completeBlockMutation.isPending ? 'Saving…' : 'Mark as complete'}
                    </button>
                  )
                }

                // Block complete, assessment done, or last item: Next / All done
                return (
                  <button
                    onClick={handleAdvance}
                    disabled={isLast}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-xs font-bold shadow-lg shadow-brand-primary/30 hover:shadow-xl hover:shadow-brand-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all"
                  >
                    {isLast ? 'All done' : 'Next'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )
              })()}
            </div>
          )}

          {course.progressPercentage >= 100 && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => router.push('/dashboard/courses')}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-5 py-2.5 text-sm font-bold shadow-lg shadow-brand-primary/30 hover:-translate-y-0.5 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to my courses
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-brand-surface p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-brand-text-primary">Course menu</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-xs font-bold text-brand-text-muted hover:text-brand-primary"
                >
                  Close
                </button>
              </div>
              <CourseMenu
                course={course}
                navItems={navItems}
                activeIdx={activeIdx}
                onSelect={goTo}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Certificate modal */}
      <CertificateModal
        open={certModal.open}
        certificate={certModal.certificate}
        courseTitle={course.title}
        onClose={() => setCertModal((prev) => ({ ...prev, open: false }))}
      />
    </DashboardLayout>
  )
}

// ─── Header card ───────────────────────────────────────────────────────────────

function CourseHeader({
  course,
  activeItem,
  onViewCertificate,
  onDownloadActionPlan,
}: {
  course: LearnerCourseDetail
  activeItem: NavItem | null
  onViewCertificate?: () => void
  onDownloadActionPlan?: () => void
}) {
  const pct = Math.round(course.progressPercentage)

  const currentLabel = useMemo(() => {
    if (!activeItem) return ''
    if (activeItem.kind === 'assessment') return activeItem.title
    return activeItem.block.title
  }, [activeItem])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl bg-brand-deep text-white shadow-xl"
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: course.cover ? `url(${encodeURI(course.cover)})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(1px)',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-brand-deep via-brand-deep/95 to-brand-primary/40" />

      <div className="relative p-6 sm:p-8 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="md:w-56 w-full">
          <div className="relative aspect-[16/10] rounded-xl overflow-hidden ring-1 ring-white/15 shadow-lg">
            {course.cover ? (
              <img src={course.cover} alt={course.title} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center">
                <BookOpenCheck className="w-10 h-10 text-white/70" />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur text-[10px] font-bold uppercase tracking-[0.2em]">
            <Sparkles className="w-3 h-3 text-brand-primary-light" />
            {course.difficulty}
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-black leading-tight text-balance">
            {course.title}
          </h1>
          {course.description && (
            <p className="mt-2 text-sm text-white/70 max-w-2xl leading-relaxed">{course.description}</p>
          )}

          {currentLabel && (
            <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-wider text-white/60">
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-white/80">
                <span className="text-white/40">Now:</span>
                <span className="font-semibold">{currentLabel}</span>
              </span>
            </div>
          )}

          <div className="mt-5 w-full">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/60 mb-1.5">
              <span>Progress</span>
              <motion.span
                key={pct}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-base font-black text-white"
              >
                {pct}%
              </motion.span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-brand-primary-light via-brand-primary to-brand-primary-dark shadow-[0_0_18px_rgba(159,32,99,0.6)]"
              />
            </div>
            {pct >= 100 && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 uppercase tracking-wider"
              >
                <Trophy className="w-3 h-3" />
                Course complete
              </motion.span>
            )}
          </div>

          {(onViewCertificate || onDownloadActionPlan) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-4 flex flex-wrap gap-2"
            >
              {onViewCertificate && (
                <button
                  onClick={onViewCertificate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-xs font-bold transition-all backdrop-blur"
                >
                  <Award className="w-3.5 h-3.5" />
                  View Certificate
                </button>
              )}
              {onDownloadActionPlan && (
                <button
                  onClick={onDownloadActionPlan}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-xs font-bold transition-all backdrop-blur"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Action Plan PDF
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Course menu (sidebar) ─────────────────────────────────────────────────────

function CourseMenu({
  course,
  navItems,
  activeIdx,
  onSelect,
}: {
  course: LearnerCourseDetail
  navItems: NavItem[]
  activeIdx: number
  onSelect: (idx: number) => void
}) {
  // Track which modules are expanded
  const activeItem = navItems[activeIdx]
  const activeModuleIdx = activeItem?.kind === 'block' ? activeItem.moduleIdx : -1
  const [expanded, setExpanded] = useState<Record<number, boolean>>(
    () => (activeModuleIdx >= 0 ? { [activeModuleIdx]: true } : {})
  )

  useEffect(() => {
    if (activeModuleIdx >= 0) {
      setExpanded((prev) => ({ ...prev, [activeModuleIdx]: true }))
    }
  }, [activeModuleIdx])

  // Pre-assessment nav item index
  const preAssessmentNavIdx = course.preAssessment
    ? navItems.findIndex((item) => item.kind === 'assessment' && item.assessmentType === 'pre')
    : -1

  // Post-assessment nav item index
  const postAssessmentNavIdx = course.postAssessment
    ? navItems.findIndex((item) => item.kind === 'assessment' && item.assessmentType === 'post')
    : -1

  return (
    <div className="rounded-2xl bg-white border border-brand-surface-2 overflow-hidden">
      <div className="p-4 border-b border-brand-surface-2 bg-gradient-to-br from-brand-primary/5 to-transparent">
        <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Course menu</p>
        <h2 className="mt-1 text-sm font-black text-brand-text-primary leading-tight line-clamp-2">
          {course.title}
        </h2>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {/* Pre-assessment button */}
        {course.preAssessment && preAssessmentNavIdx >= 0 && (
          <AssessmentRow
            title={course.preAssessment.title}
            assessmentType="pre"
            isLocked={course.preAssessment.isLocked}
            isActive={activeIdx === preAssessmentNavIdx}
            navIdx={preAssessmentNavIdx}
            onSelect={onSelect}
          />
        )}

        {/* Modules */}
        {course.modules.map((mod, mi) => (
          <ModuleSection
            key={mod.id}
            mod={mod}
            moduleIdx={mi}
            navItems={navItems}
            activeIdx={activeIdx}
            expanded={!!expanded[mi]}
            onToggle={() => setExpanded((p) => ({ ...p, [mi]: !p[mi] }))}
            onSelect={onSelect}
          />
        ))}

        {/* Post-assessment button */}
        {course.postAssessment && postAssessmentNavIdx >= 0 && (
          <AssessmentRow
            title={course.postAssessment.title}
            assessmentType="post"
            isLocked={course.postAssessment.isLocked}
            isActive={activeIdx === postAssessmentNavIdx}
            navIdx={postAssessmentNavIdx}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  )
}

function AssessmentRow({
  title,
  assessmentType,
  isLocked,
  isActive,
  navIdx,
  onSelect,
}: {
  title: string
  assessmentType: 'pre' | 'post'
  isLocked: boolean
  isActive: boolean
  navIdx: number
  onSelect: (idx: number) => void
}) {
  return (
    <div className="relative border-b border-brand-surface-2">
      {isActive && (
        <motion.span
          layoutId="course-menu-active"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-gradient-to-b from-brand-primary to-brand-primary-dark"
        />
      )}
      <button
        onClick={() => !isLocked && onSelect(navIdx)}
        disabled={isLocked}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          isActive ? 'bg-brand-primary/5 text-brand-primary' : 'hover:bg-brand-surface/40 text-brand-text-primary',
          isLocked && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-[10px] font-black',
            assessmentType === 'pre'
              ? 'bg-brand-primary/10 text-brand-primary'
              : 'bg-brand-violet/10 text-brand-violet',
          )}
        >
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-text-muted mb-0.5">
            {assessmentType === 'pre' ? 'Pre-test' : 'Post-test'}
          </p>
          <p className={cn('text-xs font-bold leading-snug line-clamp-2', isActive && 'text-brand-primary')}>
            {title}
          </p>
        </div>
      </button>
    </div>
  )
}

function ModuleSection({
  mod,
  moduleIdx,
  navItems,
  activeIdx,
  expanded,
  onToggle,
  onSelect,
}: {
  mod: LearnerModule
  moduleIdx: number
  navItems: NavItem[]
  activeIdx: number
  expanded: boolean
  onToggle: () => void
  onSelect: (idx: number) => void
}) {
  // Compute module-level completion from units
  const totalUnits = mod.units.length
  const completedUnits = mod.units.filter((u) => u.unitProgress?.status === 'completed').length
  const modDone = totalUnits > 0 && completedUnits === totalUnits
  const modStarted = completedUnits > 0

  return (
    <li className="list-none border-b border-brand-surface-2 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-surface/40 transition-colors"
      >
        <span
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-black shrink-0 transition-colors',
            modDone
              ? 'bg-emerald-500 text-white'
              : modStarted
                ? 'bg-brand-primary text-white'
                : 'bg-brand-surface-2 text-brand-text-muted',
          )}
        >
          {modDone ? <CheckCircle2 className="w-4 h-4" /> : moduleIdx + 1}
        </span>
        <span className="flex-1 min-w-0">
          <p className="text-xs font-bold text-brand-text-primary line-clamp-2 leading-snug">{mod.title}</p>
          <p className="text-[10px] text-brand-text-muted mt-0.5">
            {completedUnits}/{totalUnits} units
          </p>
        </span>
        <ChevronRight
          className={cn('w-4 h-4 text-brand-text-muted shrink-0 transition-transform', expanded && 'rotate-90')}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden bg-brand-surface/20"
          >
            {mod.units.map((unit, ui) => (
              <div key={unit.id} className="border-t border-brand-surface-2/60">
                {/* Unit header row */}
                <div className="flex items-center gap-2 px-4 pl-8 py-2">
                  <span
                    className={cn(
                      'flex items-center justify-center w-4 h-4 rounded-full shrink-0',
                      unit.unitProgress?.status === 'completed'
                        ? 'text-emerald-500'
                        : 'text-brand-text-muted',
                    )}
                  >
                    {unit.unitProgress?.status === 'completed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : unit.isLocked ? (
                      <Lock className="w-3 h-3 opacity-50" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                  </span>
                  <p className="text-[11px] font-semibold text-brand-text-muted line-clamp-1">{unit.title}</p>
                  {unit.durationMinutes && (
                    <span className="ml-auto text-[10px] text-brand-text-muted flex items-center gap-0.5 shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      {unit.durationMinutes}m
                    </span>
                  )}
                </div>

                {/* Block rows */}
                <ul className="pb-1">
                  {unit.blocks.map((block, bi) => {
                    const navIdx = navItems.findIndex(
                      (item) => item.kind === 'block' && item.block.id === block.id,
                    )
                    const isActive = activeIdx === navIdx
                    const isDone = block.blockProgress?.status === 'completed'
                    const isLocked = block.isLocked

                    return (
                      <li key={block.id} className="relative">
                        {isActive && (
                          <motion.span
                            layoutId="course-menu-active-block"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-gradient-to-b from-brand-primary to-brand-primary-dark"
                          />
                        )}
                        <button
                          disabled={isLocked}
                          onClick={() => navIdx >= 0 && onSelect(navIdx)}
                          className={cn(
                            'w-full flex items-center gap-3 pl-14 pr-4 py-2 text-left transition-colors',
                            isActive
                              ? 'bg-brand-primary/5 text-brand-primary'
                              : 'text-brand-text-primary hover:bg-brand-surface',
                            isLocked && 'opacity-50 cursor-not-allowed',
                          )}
                        >
                          <span className="shrink-0 text-brand-text-muted">
                            {isDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : isLocked ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <BlockTypeIcon type={block.type} />
                            )}
                          </span>
                          <span
                            className={cn('text-[11px] leading-snug line-clamp-2 flex-1', isActive && 'font-bold')}
                          >
                            {block.title}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function BlockTypeIcon({ type }: { type: LearnerBlock['type'] }) {
  if (type === 'video') return <PlayCircle className="w-3.5 h-3.5" />
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />
  if (type === 'question') return <ListChecks className="w-3.5 h-3.5" />
  return <FileText className="w-3.5 h-3.5" />
}

// ─── Block shell ───────────────────────────────────────────────────────────────

function BlockShell({
  course,
  item,
  children,
}: {
  course: LearnerCourseDetail
  item: BlockNavItem
  children: React.ReactNode
}) {
  const mod = course.modules[item.moduleIdx]
  const unit = mod?.units[item.unitIdx]
  if (!mod || !unit) return null

  const totalBlocksInUnit = unit.blocks.length
  const pct = Math.round(((item.blockIdx + 1) / totalBlocksInUnit) * 100)

  return (
    <article className="rounded-2xl bg-white border border-brand-surface-2 overflow-hidden shadow-sm">
      <div className="px-5 sm:px-7 pt-5 pb-4 border-b border-brand-surface-2 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent">
        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-brand-text-muted font-bold">
          <span>{mod.title}</span>
          <span>Block {item.blockIdx + 1} / {totalBlocksInUnit}</span>
        </div>
        <h2 className="mt-1.5 text-base sm:text-lg font-black text-brand-text-primary leading-snug">
          {unit.title}
        </h2>
        <div className="mt-3 h-1 rounded-full bg-brand-surface-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
            className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark"
          />
        </div>
      </div>
      <div className="p-5 sm:p-7">{children}</div>
    </article>
  )
}

// ─── Block renderer ────────────────────────────────────────────────────────────

function BlockRenderer({
  block,
  onCompleted,
  onAdvance,
  onWatchThreshold,
}: {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
  onWatchThreshold?: () => void
}) {
  if (block.type === 'video') {
    return <VideoBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} onWatchThreshold={onWatchThreshold} />
  }
  if (block.type === 'image') {
    return <ImageBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} />
  }
  if (block.type === 'text') {
    return <TextBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} />
  }
  if (block.type === 'question') {
    const hasActionPlanOnly =
      block.questions.length > 0 && block.questions.every((q) => q.kind === 'action-plan')
    if (hasActionPlanOnly) {
      return <ActionPlanBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} />
    }
    return <SurveyBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} />
  }
  // Fallback for unknown block types
  return (
    <div className="text-sm text-brand-text-muted p-4">
      Unsupported block type: {block.type}
    </div>
  )
}
