'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  GraduationCap,
  ImageIcon,
  Info,
  ListChecks,
  ListTree,
  Lock,
  PanelLeft,
  Play,
  PlayCircle,
} from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, Chip, CoverTile, EmptyState, ProgressBar, Skeleton, btn } from '@/components/kit'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  fetchLearnerCourse,
  apiEnrollInCourse,
  apiUpdateBlockProgress,
  fetchCourseCertificate,
  apiIssueCertificate,
  downloadActionPlanPdf,
  type LearnerCourseDetail,
  type LearnerBlock,
  type LearnerUnit,
  type CourseCertificate,
} from '@/lib/api/lms'
import { VideoBlock } from '@/components/lms/VideoBlock'
import { TextBlock } from '@/components/lms/TextBlock'
import { ImageBlock } from '@/components/lms/ImageBlock'
import { SurveyBlock } from '@/components/lms/SurveyBlock'
import { ActionPlanBlock } from '@/components/lms/ActionPlanBlock'
import { AssessmentView } from '@/components/lms/AssessmentView'
import { CertificateModal } from '@/components/lms/CertificateModal'
import { blockKindLabel, blockLabel, blockTitle } from '@/components/learner/courseProgress'
import type { CoursePreviewUnit } from '@/lib/api/lms'
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
  /** 1-based unit number across the whole course. */
  unitNumber: number
}

type NavItem = AssessmentItem | BlockNavItem

const OUTLINE_KEY = 'hadafi.coursePlayer.outline'
const FOCUS_KEY = 'hadafi.coursePlayer.focus'

function itemLabel(item: NavItem | undefined) {
  if (!item) return ''
  if (item.kind === 'assessment') return item.assessmentType === 'pre' ? 'Pre-test' : 'Final exam'
  return blockLabel(item.block)
}

/** ['Pre-test', 'done'] -> "Pre-test, done"; capitalises the first word. */
function sentence(parts: Array<string | null | false | undefined>) {
  const text = parts.filter(Boolean).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  const norm = (t: string | null | undefined) => (t ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return norm(a) === norm(b)
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const courseId = params?.id ?? ''

  const queryClient = useQueryClient()

  const { data: course, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['learner-course', courseId],
    queryFn: () => fetchLearnerCourse(courseId),
    enabled: !!courseId,
    staleTime: 30_000,
  })

  const enrollMutation = useMutation({
    mutationFn: () => apiEnrollInCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-course', courseId] })
      queryClient.invalidateQueries({ queryKey: ['learner-courses'] })
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

    let unitNumber = 0
    for (let mi = 0; mi < course.modules.length; mi++) {
      const mod = course.modules[mi]
      for (let ui = 0; ui < mod.units.length; ui++) {
        const unit = mod.units[ui]
        unitNumber++
        for (let bi = 0; bi < unit.blocks.length; bi++) {
          items.push({
            kind: 'block',
            block: unit.blocks[bi],
            moduleIdx: mi,
            unitIdx: ui,
            blockIdx: bi,
            moduleId: mod.id,
            unitId: unit.id,
            unitNumber,
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

  const totalUnits = useMemo(() => course?.modules.reduce((n, m) => n + m.units.length, 0) ?? 0, [course])

  const [activeIdx, setActiveIdx] = useState(0)
  const [videoWatchUnlocked, setVideoWatchUnlocked] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const hasAutoNavigated = useRef(false)
  const [certModal, setCertModal] = useState<{ open: boolean; certificate: CourseCertificate | null }>({
    open: false,
    certificate: null,
  })
  const mainRef = useRef<HTMLDivElement>(null)
  const certCheckedRef = useRef(false)

  // Panels, remembered per device (wide screens, where their buttons live):
  // the outline can be hidden on its own, and focus mode hides both the app
  // sidebar and the outline, then puts back whatever was showing.
  const [outlineShown, setOutlineShown] = useState(true)
  const [focus, setFocus] = useState(false)
  const outlineBeforeFocus = useRef(true)
  useEffect(() => {
    try {
      const focused = localStorage.getItem(FOCUS_KEY) === '1'
      setFocus(focused)
      if (focused || localStorage.getItem(OUTLINE_KEY) === '0') setOutlineShown(false)
    } catch {
      /* storage blocked: keep the default */
    }
  }, [])
  const remember = (key: string, on: boolean) => {
    try {
      localStorage.setItem(key, on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  const setOutline = useCallback((shown: boolean) => {
    setOutlineShown(shown)
    remember(OUTLINE_KEY, shown)
  }, [])
  const toggleFocus = useCallback(() => {
    if (focus) {
      setFocus(false)
      setOutlineShown(outlineBeforeFocus.current)
    } else {
      outlineBeforeFocus.current = outlineShown
      setFocus(true)
      setOutlineShown(false)
    }
    remember(FOCUS_KEY, !focus)
  }, [focus, outlineShown])

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

  const hasActionPlanQuestions =
    course?.modules.some((m) => m.units.some((u) => u.blocks.some((b) => b.questions.some((q) => q.kind === 'action-plan')))) ??
    false

  const handleComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['learner-course', courseId] })
  }, [queryClient, courseId])

  // Once the course is complete, find its certificate, issuing it the first
  // time (the server checks it has been earned; asking again returns the same
  // one). It opens by itself only when it was just issued.
  useEffect(() => {
    if (!course || course.progressPercentage < 100 || !course.enableCertificate) return
    if (certCheckedRef.current) return
    certCheckedRef.current = true

    const checkCert = async () => {
      try {
        const existing = await fetchCourseCertificate(courseId)
        if (existing) {
          setCertModal((prev) => ({ ...prev, certificate: existing }))
          return
        }
        const issued = await apiIssueCertificate(courseId)
        setCertModal({ open: true, certificate: issued })
        queryClient.invalidateQueries({ queryKey: ['user-certificates'] })
      } catch {
        // Not earned yet (e.g. the final exam is still to pass): the View
        // certificate button explains why when pressed.
        certCheckedRef.current = false
      }
    }

    void checkCert()
  }, [course?.progressPercentage, courseId, course?.enableCertificate]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewCertificate = async () => {
    if (certModal.certificate) {
      setCertModal((prev) => ({ ...prev, open: true }))
      return
    }
    try {
      const cert = (await fetchCourseCertificate(courseId)) ?? (await apiIssueCertificate(courseId))
      setCertModal({ open: true, certificate: cert })
      queryClient.invalidateQueries({ queryKey: ['user-certificates'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Your certificate is not ready yet.')
    }
  }

  const handleDownloadActionPlan = async () => {
    try {
      const response = await downloadActionPlanPdf(courseId)
      if (!response.ok) {
        toast.error('Your action plan is not ready yet. Answer the action plan steps first.')
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
      toast.error('Your action plan could not be downloaded. Please try again.')
    }
  }

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= navItems.length) return
    setActiveIdx(idx)
    setVideoWatchUnlocked(false)
    setMobileMenuOpen(false)
  }

  // Every step opens at its top. Instant, not smooth: the new step's content has
  // already replaced the old, so a smooth scroll would glide through it and move
  // the buttons while the learner reaches for them.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [activeIdx])

  const handleAdvance = () => {
    if (!isLast) {
      goTo(activeIdx + 1)
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout fullBleed>
        <div className="flex min-h-0 flex-1 flex-col bg-ui-bg">
          <div className="flex h-[60px] shrink-0 items-center gap-4 border-b border-ui-line bg-ui-surface px-5">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="flex flex-1">
            <div className="hidden w-[300px] space-y-3 border-e border-ui-line bg-ui-surface p-4 min-[1100px]:block">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
            <div className="flex-1 space-y-4 px-4 py-7 sm:px-12">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-2/3 max-w-[560px]" />
              <Skeleton className="aspect-video w-full max-w-[720px]" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (isError || !course) {
    const notFound = !isError || error?.message === 'Course not found'
    return (
      <DashboardLayout>
        <Card className="mx-auto mt-10 max-w-xl">
          <EmptyState
            icon={GraduationCap}
            title={notFound ? 'Course not found' : 'This course could not load'}
            body={notFound ? "We couldn't find the course you're looking for. It may have been moved." : `${error?.message ?? ''} Please try again.`}
            action={
              <span className="flex flex-wrap justify-center gap-2">
                {!notFound && (
                  <Button variant="secondary" onClick={() => void refetch()}>
                    Try again
                  </Button>
                )}
                <Link href="/dashboard/courses" className={btn()}>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Back to courses
                </Link>
              </span>
            }
          />
        </Card>
      </DashboardLayout>
    )
  }

  // ─── Enrollment guard ──────────────────────────────────────────────────────
  if (!course.isEnrolled) {
    return (
      <CourseIntro course={course} enroll={enrollMutation} />
    )
  }

  const pct = Math.round(course.progressPercentage)
  const headerSub = !activeItem
    ? `${totalUnits} units`
    : activeItem.kind === 'block'
      ? `Unit ${activeItem.unitNumber} of ${totalUnits}`
      : activeItem.assessmentType === 'pre'
        ? 'Before you start'
        : 'Final exam'

  const outline = (
    <CourseOutline course={course} navItems={navItems} activeIdx={activeIdx} onSelect={goTo} />
  )

  const description = course.description?.trim() || null

  return (
    <DashboardLayout fullBleed>
      {/* Focus mode (wide screens only, where its toggle lives) lifts the player
          over the app sidebar; otherwise it sits inside the app shell. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col bg-ui-bg text-ui-text',
          focus && 'min-[1100px]:fixed min-[1100px]:inset-0 min-[1100px]:z-40',
        )}
      >
        {/* ── Top bar ── */}
        <header className="relative flex h-[60px] shrink-0 items-center gap-2 border-b border-ui-line bg-ui-surface px-3 sm:gap-4 sm:px-5">
          <Link
            href="/dashboard/courses"
            aria-label="Back to courses"
            className={cn(btn({ variant: 'secondary' }), 'h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3')}
          >
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Courses</span>
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-semibold" title={course.title}>
                {course.title}
              </span>
              {course.difficulty && (
                <Chip className="h-5 shrink-0 px-1.5 text-[11px]">{course.difficulty}</Chip>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-ui-muted">
              <span className="shrink-0">{headerSub}</span>
              {description && (
                <>
                  <span aria-hidden className="hidden sm:inline">
                    ·
                  </span>
                  <span className="hidden truncate sm:inline" title={description}>
                    {description}
                  </span>
                </>
              )}
            </span>
          </div>
          {description && <CourseInfo course={course} description={description} totalUnits={totalUnits} pct={pct} />}
          <div className="hidden w-[220px] items-center gap-2.5 md:flex">
            <ProgressBar value={pct} className="flex-1" label="Course progress" />
            <span className="text-[13px] font-semibold tabular-nums">{pct}%</span>
          </div>
          <Button
            variant="secondary"
            className="h-9 w-9 min-[1100px]:hidden"
            size="icon"
            aria-label="Course content"
            onClick={() => setMobileMenuOpen(true)}
          >
            <ListTree className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </Button>
          <div role="group" aria-label="Panels" className="hidden items-center gap-1.5 min-[1100px]:flex">
            <Button
              variant="secondary"
              size="icon"
              className={cn('h-9 w-9', outlineShown && 'bg-ui-surface-2')}
              aria-pressed={outlineShown}
              aria-label={outlineShown ? 'Hide course outline' : 'Show course outline'}
              title={outlineShown ? 'Hide course outline' : 'Show course outline'}
              onClick={() => setOutline(!outlineShown)}
            >
              <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </Button>
            <Button variant="secondary" className={cn('h-9', focus && 'bg-ui-surface-2')} aria-pressed={focus} onClick={toggleFocus}>
              {focus ? 'Exit focus' : 'Focus mode'}
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {outlineShown && (
            <nav
              aria-label="Course outline"
              className="hidden w-[300px] shrink-0 overflow-y-auto border-e border-ui-line bg-ui-surface px-3 py-4 min-[1100px]:block"
            >
              {outline}
            </nav>
          )}

          <div ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
            <div
              className={cn(
                'flex min-h-full w-full max-w-[816px] flex-col gap-[22px] px-4 pb-10 pt-5 sm:px-8 sm:pt-7 lg:px-12',
                !outlineShown && 'mx-auto',
              )}
            >
              {pct >= 100 && (
                <Card className="flex flex-wrap items-center gap-3 border-transparent bg-ui-ok-soft p-4">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ui-ok text-white">
                    <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-ui-text">Course complete</span>
                    <span className="text-[13px] text-ui-muted">Well done. Your progress is saved.</span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {course.enableCertificate && (
                      <Button size="sm" onClick={handleViewCertificate}>
                        <Award className="h-4 w-4" aria-hidden />
                        View certificate
                      </Button>
                    )}
                    {hasActionPlanQuestions && (
                      <Button size="sm" variant="secondary" onClick={handleDownloadActionPlan}>
                        <Download className="h-4 w-4" aria-hidden />
                        Action plan PDF
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => router.push('/dashboard/courses')}>
                      Back to my courses
                    </Button>
                  </span>
                </Card>
              )}

              {activeItem ? (
                <>
                  <StepHeading course={course} item={activeItem} />

                  {activeItem.kind === 'block' && activeItem.block.type === 'text' && (
                    <UnitVideoCard
                      course={course}
                      item={activeItem}
                      navItems={navItems}
                      onReplay={goTo}
                    />
                  )}

                  <div key={activeItem.kind === 'block' ? activeItem.block.id : `assessment-${activeItem.id}`}>
                    {activeItem.kind === 'assessment' ? (
                      <AssessmentView assessmentId={activeItem.id} isLocked={activeItem.isLocked} onCompleted={handleComplete} />
                    ) : (
                      <BlockRenderer
                        block={activeItem.block}
                        onCompleted={handleComplete}
                        onAdvance={isLast ? undefined : handleAdvance}
                        onWatchThreshold={() => setVideoWatchUnlocked(true)}
                      />
                    )}
                  </div>
                </>
              ) : (
                <Card>
                  <EmptyState icon={BookOpen} title="This course has no lessons yet" body="Check back soon." />
                </Card>
              )}

              {/* Prev / Next */}
              {navItems.length > 0 && (
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-ui-line pt-[18px]">
                  {activeIdx > 0 ? (
                    <Button variant="secondary" className="min-w-0" onClick={() => goTo(activeIdx - 1)}>
                      <ChevronLeft className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {(() => {
                        const prev = navItems[activeIdx - 1]
                        const sameUnit =
                          prev?.kind === 'block' && activeItem?.kind === 'block' && prev.unitId === activeItem.unitId
                        // Short labels only: a long title would push Next off a phone screen.
                        let label = 'Previous'
                        if (prev?.kind === 'assessment') label = itemLabel(prev)
                        else if (prev && sameUnit) {
                          const full = blockLabel(prev.block)
                          label = full.length <= 24 ? full : blockKindLabel(prev.block)
                        }
                        return <span className="truncate">{label}</span>
                      })()}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <NextAction
                    course={course}
                    activeItem={activeItem}
                    isLast={isLast}
                    videoWatchUnlocked={videoWatchUnlocked}
                    saving={completeBlockMutation.isPending}
                    onComplete={(blockId) => completeBlockMutation.mutate(blockId, { onSuccess: handleAdvance })}
                    onAdvance={handleAdvance}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Outline on smaller screens */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-[320px] max-w-[85vw] gap-0 overflow-y-auto border-r border-ui-line bg-ui-surface p-0 text-ui-text">
            <SheetTitle className="px-5 pb-1 pt-5 text-base font-semibold text-ui-text">{course.title}</SheetTitle>
            <div className="flex items-center gap-2.5 px-5 pb-3">
              <ProgressBar value={pct} className="flex-1" label="Course progress" />
              <span className="text-[13px] font-semibold tabular-nums">{pct}%</span>
            </div>
            <nav aria-label="Course outline" className="px-3 pb-6">
              {outline}
            </nav>
          </SheetContent>
        </Sheet>

        <CertificateModal
          open={certModal.open}
          certificate={certModal.certificate}
          courseTitle={course.title}
          onClose={() => setCertModal((prev) => ({ ...prev, open: false }))}
        />
      </div>
    </DashboardLayout>
  )
}

// ─── Step heading: where you are, unit title, block title ──────────────────────

function StepHeading({ course, item }: { course: LearnerCourseDetail; item: NavItem }) {
  const eyebrowCls = 'text-[13px] text-ui-muted'
  const h1Cls = 'text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]'

  if (item.kind === 'assessment') {
    return (
      <div className="flex flex-col gap-2">
        <span className={eyebrowCls}>
          {item.assessmentType === 'pre'
            ? 'Before you start'
            : course.enableCertificate
              ? 'Pass it to earn your certificate'
              : 'After the last unit'}
        </span>
        <h1 className={h1Cls}>{itemLabel(item)}</h1>
      </div>
    )
  }

  const mod = course.modules[item.moduleIdx]
  const unit = mod?.units[item.unitIdx]
  const blocks = unit?.blocks ?? []
  const title = blockTitle(item.block)
  const showTitle = !!title && !sameText(title, unit?.title)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <span className={cn(eyebrowCls, 'min-w-0')}>
          {course.modules.length > 1 && mod ? `${mod.title} / ` : ''}Unit {item.unitNumber} /{' '}
          {showTitle ? blockKindLabel(item.block) : blockLabel(item.block)}
        </span>
        {blocks.length > 1 && (
          <span className="flex shrink-0 items-center gap-2 text-xs text-ui-muted">
            <span className="tabular-nums">
              Step {item.blockIdx + 1} of {blocks.length}
            </span>
            <span className="flex gap-1" aria-hidden>
              {blocks.map((b, i) => (
                <span
                  key={b.id}
                  className={cn(
                    'h-1.5 w-3 rounded-full sm:w-4',
                    i === item.blockIdx
                      ? 'bg-ui-brand'
                      : b.blockProgress?.status === 'completed'
                        ? 'bg-ui-ok'
                        : 'bg-ui-line',
                  )}
                />
              ))}
            </span>
          </span>
        )}
      </div>
      <h1 className={h1Cls}>{unit?.title}</h1>
      {showTitle && (
        <h2 className="text-lg font-semibold leading-snug text-ui-text [overflow-wrap:anywhere] sm:text-xl">{title}</h2>
      )}
    </div>
  )
}

// ─── Course info popover (full description) ────────────────────────────────────

function CourseInfo({
  course,
  description,
  totalUnits,
  pct,
}: {
  course: LearnerCourseDetail
  description: string
  totalUnits: number
  pct: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Not `relative`: the panel anchors to the top bar so it fits a phone screen.
  return (
    <div ref={ref} className="shrink-0">
      <Button
        variant="secondary"
        size="icon"
        className={cn('h-9 w-9', open && 'bg-ui-surface-2')}
        aria-label="About this course"
        title="About this course"
        aria-expanded={open}
        aria-controls="course-info"
        onClick={() => setOpen((o) => !o)}
      >
        <Info className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </Button>
      {open && (
        <div
          id="course-info"
          role="dialog"
          aria-label="About this course"
          className="absolute inset-x-3 top-full z-40 mt-2 rounded-[14px] border border-ui-line bg-ui-surface p-4 text-ui-text shadow-ui sm:inset-x-auto sm:end-5 sm:w-[380px]"
        >
          <div className="flex flex-wrap gap-2">
            {course.difficulty && <Chip>{course.difficulty}</Chip>}
            {course.enableCertificate && <Chip tone="brand">Certificate</Chip>}
          </div>
          <p className="mt-2.5 text-[15px] font-semibold leading-snug">{course.title}</p>
          <p className="mt-1.5 max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ui-muted">
            {description}
          </p>
          <p className="mt-3 text-xs text-ui-muted">
            {sentence([totalUnits > 0 ? `${totalUnits} units` : null, `${pct}% complete`])}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Next / complete action ────────────────────────────────────────────────────

function NextAction({
  course,
  activeItem,
  isLast,
  videoWatchUnlocked,
  saving,
  onComplete,
  onAdvance,
}: {
  course: LearnerCourseDetail
  activeItem: NavItem | null
  isLast: boolean
  videoWatchUnlocked: boolean
  saving: boolean
  onComplete: (blockId: string) => void
  onAdvance: () => void
}) {
  const isPreAssessmentGating =
    activeItem?.kind === 'assessment' && activeItem.assessmentType === 'pre' && !(course.preAssessment?.isCompleted ?? false)
  if (isPreAssessmentGating) return <span />

  const activeBlock = activeItem?.kind === 'block' ? activeItem.block : null
  const isBlockCompleted = activeBlock?.blockProgress?.status === 'completed'
  const next = <ChevronRight className="h-[18px] w-[18px]" aria-hidden />

  // Question blocks: disabled until they complete themselves
  if (activeBlock?.type === 'question' && !isBlockCompleted) {
    return (
      <span className="flex items-center gap-3">
        <span className="hidden text-[13px] text-ui-muted sm:inline">Submit your answers to continue</span>
        <Button disabled>Next{next}</Button>
      </span>
    )
  }

  // Video blocks: gated by a 95% watch; the unlock signal comes from VideoBlock
  if (activeBlock?.type === 'video' && !isBlockCompleted) {
    if (!videoWatchUnlocked) {
      return (
        <Button variant="secondary" disabled>
          <Lock className="h-4 w-4" aria-hidden />
          Watch to complete
        </Button>
      )
    }
    return (
      <Button onClick={() => onComplete(activeBlock.id)} disabled={saving}>
        {saving ? 'Saving' : 'Mark as watched, next'}
        {next}
      </Button>
    )
  }

  // Text / image blocks not yet complete: mark complete, then advance
  if (activeBlock && !isBlockCompleted) {
    return (
      <Button onClick={() => onComplete(activeBlock.id)} disabled={saving}>
        {saving ? 'Saving' : activeBlock.type === 'text' ? 'Mark as read, next' : 'Mark as done, next'}
        {next}
      </Button>
    )
  }

  // Block complete, assessment done, or last item
  return (
    <Button onClick={onAdvance} disabled={isLast}>
      {isLast ? 'All done' : 'Next'}
      {!isLast && next}
    </Button>
  )
}

// ─── "Unit video" card on reading steps ────────────────────────────────────────

function UnitVideoCard({
  course,
  item,
  navItems,
  onReplay,
}: {
  course: LearnerCourseDetail
  item: BlockNavItem
  navItems: NavItem[]
  onReplay: (idx: number) => void
}) {
  const videoIdx = navItems.findIndex(
    (n) => n.kind === 'block' && n.unitId === item.unitId && n.block.type === 'video' && n.block.blockProgress?.status === 'completed',
  )
  if (videoIdx < 0) return null
  const hasReadMore = navItems.some(
    (n) => n.kind === 'block' && n.unitId === item.unitId && n.block.type === 'text' && n.block.id !== item.block.id && /more/i.test(n.block.title),
  )
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-ui-line bg-ui-surface p-2.5">
      <div className="relative w-[96px] shrink-0 sm:w-[120px]">
        <CoverTile src={course.cover} title={course.title} className="h-[56px] rounded-lg sm:h-[68px] [&_svg]:h-5 [&_svg]:w-5" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/95 text-[#c8106a]">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" aria-hidden />
          </span>
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">Unit video</span>
        <span className="text-[13px] text-ui-muted">
          Watched. Replay it{hasReadMore ? ' or read the transcript in Read more' : ''}.
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={() => onReplay(videoIdx)}>
        Replay
      </Button>
    </div>
  )
}

// ─── Course outline ────────────────────────────────────────────────────────────

function BlockTypeIcon({ type, className }: { type: LearnerBlock['type']; className?: string }) {
  const Icon =
    type === 'video' ? PlayCircle : type === 'image' ? ImageIcon : type === 'question' ? ListChecks : FileText
  return <Icon className={className} strokeWidth={1.75} aria-hidden />
}

function StatusDot({ state, children }: { state: 'done' | 'active' | 'todo' | 'locked'; children?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
        state === 'done' && 'bg-ui-ok-soft text-ui-ok',
        state === 'active' && 'bg-ui-brand font-bold text-white',
        state === 'todo' && 'border-[1.5px] border-ui-line font-semibold text-ui-muted',
        state === 'locked' && 'bg-ui-surface-2 text-ui-muted',
      )}
    >
      {state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-label="Completed" /> : children}
    </span>
  )
}

function CourseOutline({
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
  const activeItem = navItems[activeIdx]
  const activeUnitId = activeItem?.kind === 'block' ? activeItem.unitId : null
  const preIdx = navItems.findIndex((i) => i.kind === 'assessment' && i.assessmentType === 'pre')
  const postIdx = navItems.findIndex((i) => i.kind === 'assessment' && i.assessmentType === 'post')
  let unitNumber = 0

  const firstIdxOf = (unit: LearnerUnit) => {
    const idxs = navItems
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.kind === 'block' && n.unitId === unit.id)
    const open = idxs.find(({ n }) => n.kind === 'block' && !n.block.isLocked && n.block.blockProgress?.status !== 'completed')
    return (open ?? idxs[0])?.i ?? -1
  }

  const rowCls = 'grid w-full grid-cols-[24px_minmax(0,1fr)] items-start gap-3 rounded-[10px] p-2.5 text-start transition-colors'

  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2.5 pb-2 text-xs font-semibold text-ui-muted">Course content</span>

      {course.preAssessment && preIdx >= 0 && (
        <button
          type="button"
          disabled={course.preAssessment.isLocked}
          onClick={() => onSelect(preIdx)}
          aria-current={activeIdx === preIdx ? 'step' : undefined}
          className={cn(rowCls, activeIdx === preIdx ? 'bg-ui-brand-soft' : 'hover:bg-ui-surface-2', 'disabled:cursor-not-allowed disabled:opacity-60')}
        >
          <StatusDot state={course.preAssessment.isCompleted ? 'done' : activeIdx === preIdx ? 'active' : 'todo'}>
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
          </StatusDot>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 text-sm font-medium leading-snug text-ui-text" title={course.preAssessment.title || undefined}>
              {course.preAssessment.title?.trim() || 'Pre-test'}
            </span>
            <span className="text-xs text-ui-muted">
              {sentence([course.preAssessment.title?.trim() ? 'Pre-test' : null, course.preAssessment.isCompleted ? 'done' : 'start here'])}
            </span>
          </span>
        </button>
      )}

      {course.modules.map((mod) => (
        <div key={mod.id} className="flex flex-col gap-0.5">
          {course.modules.length > 1 && (
            <span className="px-2.5 pb-1 pt-3 text-[13px] font-semibold text-ui-text">{mod.title}</span>
          )}
          {mod.units.map((unit) => {
            unitNumber++
            const n = unitNumber
            const done = unit.unitProgress?.status === 'completed'
            const isActiveUnit = unit.id === activeUnitId
            const blocksDone = unit.blocks.filter((b) => b.blockProgress?.status === 'completed').length
            const meta = [
              `Unit ${n}`,
              isActiveUnit && !done && unit.blocks.length > 0 ? `${blocksDone} of ${unit.blocks.length} done` : null,
              unit.isLocked ? 'locked' : null,
              unit.durationMinutes ? `${unit.durationMinutes} min` : null,
            ]
              .filter(Boolean)
              .join(', ')

            if (isActiveUnit) {
              return (
                <div key={unit.id} className="flex flex-col gap-0.5 rounded-[10px] bg-ui-bg pb-1.5 pt-1">
                  <div className={cn(rowCls, 'pb-1.5')}>
                    <StatusDot state={done ? 'done' : 'active'}>{n}</StatusDot>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold leading-snug text-ui-text">{unit.title}</span>
                      <span className="text-xs text-ui-muted">{meta}</span>
                      {!done && unit.blocks.length > 1 && (
                        <ProgressBar
                          value={(blocksDone / unit.blocks.length) * 100}
                          className="mt-1 h-1"
                          label={`Unit ${n} progress`}
                        />
                      )}
                    </span>
                  </div>
                  <ul>
                    {unit.blocks.map((block) => {
                      const idx = navItems.findIndex((i) => i.kind === 'block' && i.block.id === block.id)
                      const isActive = idx === activeIdx
                      const isDone = block.blockProgress?.status === 'completed'
                      const label = blockLabel(block)
                      return (
                        <li key={block.id}>
                          <button
                            type="button"
                            disabled={block.isLocked}
                            onClick={() => idx >= 0 && onSelect(idx)}
                            aria-current={isActive ? 'step' : undefined}
                            className={cn(
                              'flex min-h-9 w-full items-center gap-2.5 rounded-lg py-1.5 pe-2.5 ps-[46px] text-start text-[13px] leading-snug transition-colors',
                              isActive ? 'bg-ui-brand-soft font-semibold text-ui-brand-text' : 'text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text',
                              'disabled:cursor-not-allowed disabled:opacity-60',
                            )}
                          >
                            {isDone ? (
                              <Check className="h-4 w-4 shrink-0 text-ui-ok" strokeWidth={2.25} aria-label="Done" />
                            ) : block.isLocked ? (
                              <Lock className="h-3.5 w-3.5 shrink-0" aria-label="Locked" />
                            ) : (
                              <BlockTypeIcon type={block.type} className="h-4 w-4 shrink-0" />
                            )}
                            <span className="line-clamp-2 min-w-0" title={label.length > 28 ? label : undefined}>
                              {label}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            }

            const target = firstIdxOf(unit)
            return (
              <button
                key={unit.id}
                type="button"
                disabled={unit.isLocked || target < 0}
                onClick={() => onSelect(target)}
                className={cn(rowCls, 'hover:bg-ui-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent')}
              >
                <StatusDot state={done ? 'done' : unit.isLocked ? 'locked' : 'todo'}>
                  {unit.isLocked ? <Lock className="h-3 w-3" aria-label="Locked" /> : n}
                </StatusDot>
                <span className="flex flex-col gap-0.5">
                  <span className={cn('text-sm font-medium leading-snug', unit.isLocked ? 'text-ui-muted' : 'text-ui-text')}>
                    {unit.title}
                  </span>
                  <span className="text-xs text-ui-muted">{meta}</span>
                </span>
              </button>
            )
          })}
        </div>
      ))}

      {course.postAssessment && postIdx >= 0 && (
        <button
          type="button"
          disabled={course.postAssessment.isLocked}
          onClick={() => onSelect(postIdx)}
          aria-current={activeIdx === postIdx ? 'step' : undefined}
          className={cn(
            rowCls,
            'mt-1.5 border border-dashed border-ui-line',
            activeIdx === postIdx ? 'border-solid border-ui-brand bg-ui-brand-soft' : 'hover:bg-ui-surface-2',
            'disabled:cursor-not-allowed disabled:hover:bg-transparent',
          )}
        >
          <StatusDot
            state={course.progressPercentage >= 100 ? 'done' : course.postAssessment.isLocked ? 'locked' : activeIdx === postIdx ? 'active' : 'todo'}
          >
            {course.postAssessment.isLocked ? <Lock className="h-3.5 w-3.5" aria-label="Locked" /> : <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />}
          </StatusDot>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-ui-text" title={course.postAssessment.title || undefined}>
              {course.postAssessment.title?.trim() || 'Final exam'}
            </span>
            <span className="text-xs text-ui-muted">
              {sentence([course.postAssessment.title?.trim() ? 'Final exam' : null, course.enableCertificate ? 'pass it to earn your certificate' : null])}
            </span>
          </span>
        </button>
      )}
    </div>
  )
}

// ─── Course intro (not enrolled yet) ───────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function unitParts(u: CoursePreviewUnit) {
  return [
    u.videos ? plural(u.videos, 'video') : null,
    u.readings ? plural(u.readings, 'reading') : null,
    u.activities ? plural(u.activities, 'activity', 'activities') : null,
  ].filter(Boolean).join(' · ')
}

function CourseIntro({
  course,
  enroll,
}: {
  course: LearnerCourseDetail
  enroll: { mutate: () => void; isPending: boolean; isError: boolean; error: Error | null }
}) {
  const preview = course.preview
  const t = preview?.totals
  const facts: { icon: typeof BookOpen; label: string }[] = [
    t?.units ? { icon: ListTree, label: plural(t.units, 'unit') } : null,
    t?.lessons ? { icon: BookOpen, label: plural(t.lessons, 'lesson') } : null,
    t?.videos ? { icon: PlayCircle, label: plural(t.videos, 'video') } : null,
    t?.activities ? { icon: ListChecks, label: plural(t.activities, 'activity', 'activities') } : null,
    preview?.hasFinalExam ? { icon: ClipboardCheck, label: 'Final exam' } : null,
    course.enableCertificate ? { icon: Award, label: 'Certificate' } : null,
  ].filter((f): f is { icon: typeof BookOpen; label: string } => !!f)

  const steps = [
    preview?.hasPreTest ? { title: 'Quick pre-test', body: 'A few questions to see where you start. It is not graded.' } : null,
    { title: 'Learn unit by unit', body: 'Watch, read and put each idea to work in your own business. Units unlock in order.' },
    preview?.hasFinalExam ? { title: 'Final exam', body: 'Show what you learned at the end of the course.' } : null,
    course.enableCertificate ? { title: 'Certificate', body: 'Pass the final exam to earn a certificate you can share.' } : null,
  ].filter((s): s is { title: string; body: string } => !!s)

  const start = (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg" onClick={() => enroll.mutate()} disabled={enroll.isPending}>
        <GraduationCap className="h-[18px] w-[18px]" aria-hidden />
        {enroll.isPending ? 'Starting' : 'Start course'}
      </Button>
      {preview && preview.learners > 0 && (
        <span className="text-[13px] text-ui-muted">{plural(preview.learners, 'learner')} started this course</span>
      )}
      {enroll.isError && (
        <p className="basis-full text-[13px] text-ui-danger" role="alert">
          {enroll.error?.message ?? 'The course could not start.'} Please try again.
        </p>
      )}
    </div>
  )

  return (
    <DashboardLayout>
      <Link href="/dashboard/courses" className={cn(btn({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-4')}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All courses
      </Link>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <CoverTile src={course.cover} title={course.title} className="aspect-[16/10] h-full max-h-[340px] md:max-h-none" />
          <div className="flex flex-col gap-3.5 p-5 sm:p-7">
            <div className="flex flex-wrap gap-2">
              {course.category && <Chip>{course.category}</Chip>}
              <Chip>{course.difficulty}</Chip>
              {course.enableCertificate && <Chip tone="brand">Certificate</Chip>}
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text sm:text-[30px]">{course.title}</h1>
            {course.description && <p className="max-w-[62ch] text-[15px] leading-relaxed text-ui-muted">{course.description}</p>}
            {facts.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ui-text" aria-label="What this course includes">
                {facts.map((f) => (
                  <li key={f.label} className="inline-flex items-center gap-1.5">
                    <f.icon className="h-4 w-4 text-ui-brand-text" strokeWidth={1.75} aria-hidden />
                    {f.label}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1">{start}</div>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {preview && preview.units.length > 0 && (
          <Card>
            <div className="border-b border-ui-line px-5 py-4">
              <h2 className="text-base font-semibold text-ui-text">What you&apos;ll learn</h2>
              <p className="mt-0.5 text-[13px] text-ui-muted">
                {plural(preview.units.length, 'unit')}, in order{preview.hasFinalExam ? ', then a final exam' : ''}
              </p>
            </div>
            <ol className="flex flex-col p-2.5">
              {preview.units.map((u, i) => (
                <li key={`${u.title}-${i}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-[10px] p-2.5">
                  <span className="mt-px inline-flex h-7 w-7 items-center justify-center rounded-full bg-ui-brand-soft text-[13px] font-semibold text-ui-brand-text tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-snug text-ui-text">{u.title}</span>
                    {u.description && <span className="text-[13px] leading-snug text-ui-muted">{u.description}</span>}
                    {unitParts(u) && <span className="text-xs text-ui-muted">{unitParts(u)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        <div className="flex flex-col gap-5">
          <Card className="px-5 py-4">
            <h2 className="text-base font-semibold text-ui-text">How this course works</h2>
            <ol className="mt-3 flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                  <StatusDot state="todo">{i + 1}</StatusDot>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ui-text">{s.title}</span>
                    <span className="text-[13px] leading-snug text-ui-muted">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </DashboardLayout>
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
    const hasActionPlanOnly = block.questions.length > 0 && block.questions.every((q) => q.kind === 'action-plan')
    if (hasActionPlanOnly) {
      return <ActionPlanBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} />
    }
    return <SurveyBlock block={block} onCompleted={onCompleted} onAdvance={onAdvance} />
  }
  return <p className="text-sm text-ui-muted">This step can&apos;t be shown here yet.</p>
}
