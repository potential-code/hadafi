'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Award, ClipboardCheck, Download, GraduationCap } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, CoverTile, EmptyState, PageHeader, ProgressBar, Skeleton, btn } from '@/components/kit'
import { CertificateModal, saveCertificate } from '@/components/lms/CertificateModal'
import { fetchLearnerCourses, fetchUserCertificates, type CertificateWithCourse } from '@/lib/api/lms'
import { getUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { courseHref, topicIcon, useCourseSummaries, type CourseSummary } from '@/components/learner/courseProgress'

/** The certificate's background, as the server draws it (1200 x 849). */
const CERT_TEMPLATE = '/images/certificate-template.webp'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function closestLine(s: CourseSummary | undefined, pct: number) {
  if (!s) return ''
  const exam = s.finalExam ? 'then the final exam' : 'no final exam'
  if (s.allUnitsDone) return s.finalExam ? 'All units done, final exam to pass' : 'All units done'
  if (pct === 0) return `${s.totalUnits} units, ${exam}`
  return `On unit ${s.currentUnitNumber} of ${s.totalUnits}, ${exam}`
}

function remainingText(s: CourseSummary) {
  const left = s.totalUnits - s.completedUnits
  const units = left > 0 ? `${left} unit${left === 1 ? '' : 's'}` : ''
  if (s.finalExam) return units ? `${units} and the final exam to go` : 'just the final exam to go'
  return units ? `${units} to go` : 'almost there'
}

export default function CertificatesPage() {
  // Read after mount: the signed-in user lives in localStorage.
  const [name, setName] = useState<string | null>(null)
  useEffect(() => setName(getUser()?.fullName ?? null), [])
  const [viewing, setViewing] = useState<CertificateWithCourse | null>(null)

  const {
    data: certificates = [],
    isLoading: certsLoading,
    isError: certsError,
    error: certsErr,
    refetch: refetchCerts,
  } = useQuery({ queryKey: ['user-certificates'], queryFn: fetchUserCertificates })
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['learner-courses'],
    queryFn: fetchLearnerCourses,
  })

  const certified = useMemo(() => new Set(certificates.map((c) => c.courseId)), [certificates])
  const candidates = useMemo(
    () => courses.filter((c) => c.isEnrolled && c.enableCertificate && !certified.has(c.id)),
    [courses, certified],
  )
  const { byId: summaries } = useCourseSummaries(candidates.map((c) => c.id))
  const closest = useMemo(() => [...candidates].sort((a, b) => b.progressPercentage - a.progressPercentage), [candidates])
  const top = closest[0] ?? null
  const topSummary = top ? summaries.get(top.id) : undefined

  const passScores = useMemo(() => {
    const scores = new Set<number>()
    summaries.forEach((s) => s.finalExam?.isGraded && scores.add(s.finalExam.passingScore))
    return [...scores]
  }, [summaries])

  const previewCourse = certificates[0]?.courseTitle ?? top?.title ?? 'Your course'
  const loading = certsLoading || coursesLoading

  return (
    <DashboardLayout>
      <PageHeader title="Certificates" subtitle="Finish a course and pass its final exam to earn a certificate you can share." />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card aria-labelledby="c-earned" role="region" className="flex flex-col">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 id="c-earned" className="text-base font-semibold text-ui-text">
                Earned certificates
              </h2>
              {!loading && !certsError && (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ui-surface-2 px-2 text-xs font-semibold tabular-nums text-ui-muted">
                  {certificates.length}
                </span>
              )}
            </div>
            {loading ? (
              <div className="space-y-3 border-t border-ui-line p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : certsError ? (
              <div className="border-t border-ui-line">
                <EmptyState
                  icon={Award}
                  title="Your certificates could not load"
                  body={`${certsErr instanceof Error ? certsErr.message : ''} Please try again.`}
                  action={
                    <Button variant="secondary" size="sm" onClick={() => void refetchCerts()}>
                      Try again
                    </Button>
                  }
                />
              </div>
            ) : certificates.length === 0 ? (
              <div className="flex flex-1 items-center justify-center border-t border-ui-line">
                <div className="flex flex-col items-center gap-2.5 px-6 pb-10 pt-9 text-center">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-[14px] bg-ui-brand-soft text-ui-brand-text">
                    <Award className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="mt-1 text-[17px] font-semibold text-ui-text">No certificates yet</h3>
                  <p className="max-w-[380px] text-sm leading-relaxed text-ui-muted">
                    Complete a course to earn your first certificate of completion.
                    {top && topSummary && ` ${top.title} is the closest: ${remainingText(topSummary)}.`}
                  </p>
                  {top ? (
                    <Link
                      href={courseHref(top.id)}
                      // Course titles are long: let the label wrap rather than widen the card past a phone screen.
                      className={cn(btn(), 'mt-2 h-auto min-h-10 max-w-full whitespace-normal py-2 text-center')}
                    >
                      Continue {top.title}
                    </Link>
                  ) : (
                    <Link href="/dashboard/courses" className={cn(btn(), 'mt-2')}>
                      Browse courses
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <ul>
                {certificates.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ui-line px-5 py-3.5">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
                      <Award className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold text-ui-text">{c.courseTitle}</span>
                      <span className="text-[13px] text-ui-muted">
                        Issued {formatDate(c.issuedAt)}, <span className="break-all font-mono text-xs">{c.certificateNumber}</span>
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setViewing(c)} aria-label={`View ${c.courseTitle} certificate`}>
                        View
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void saveCertificate(c)} aria-label={`Download ${c.courseTitle} certificate`}>
                        <Download className="h-4 w-4" aria-hidden />
                        Download
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <figure aria-labelledby="c-prev-h" className="m-0 flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-4">
            <div className="flex items-baseline justify-between gap-2.5">
              <h2 id="c-prev-h" className="text-base font-semibold text-ui-text">
                What you&apos;ll earn
              </h2>
              <span className="text-xs text-ui-muted">Preview</span>
            </div>
            {/* The real certificate background with the learner's details placed
                where the server draws them; fixed colours match the issued image. */}
            <div aria-hidden className="relative aspect-[1200/849] overflow-hidden rounded-[10px] border border-ui-line [container-type:inline-size]">
              <img src={CERT_TEMPLATE} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute inset-x-[14%] top-[31.5%] truncate text-center text-[4.3cqw] font-bold leading-tight text-[#2d1147]">
                {name ?? 'Your name'}
              </span>
              <span className="absolute inset-x-[14%] top-[51%] line-clamp-2 text-center text-[3.2cqw] font-bold leading-tight text-[#2d1147]">
                {previewCourse}
              </span>
              <span className="absolute left-[15.2%] top-[78.5%] text-[2.1cqw] text-[#2d1147]">On the day you finish</span>
            </div>
            <figcaption className="text-[13px] leading-relaxed text-ui-muted">
              Issued when you finish, with a unique certificate number. Download it as an image to share on LinkedIn or keep for your records.
            </figcaption>
          </figure>
        </div>

        <Card aria-labelledby="c-close" role="region">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <h2 id="c-close" className="text-base font-semibold text-ui-text">
                Closest to a certificate
              </h2>
              <span className="text-[13px] text-ui-muted">Your courses in progress, nearest first</span>
            </div>
            <Link href="/dashboard/courses" className="whitespace-nowrap text-[13px] font-semibold text-ui-brand-text hover:underline">
              All my courses
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3 border-t border-ui-line p-5">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : closest.length === 0 ? (
            <div className="border-t border-ui-line">
              <EmptyState
                icon={GraduationCap}
                title="No courses in progress"
                body="Start a course and it shows up here with what's left before your certificate."
                action={
                  <Link href="/dashboard/courses" className={btn({ variant: 'secondary', size: 'sm' })}>
                    Browse courses
                  </Link>
                }
              />
            </div>
          ) : (
            <ul>
              {closest.map((c) => {
                const s = summaries.get(c.id)
                const pct = Math.round(s?.progress ?? c.progressPercentage)
                return (
                  <li
                    key={c.id}
                    className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-t border-ui-line px-5 py-3.5 md:grid-cols-[64px_minmax(0,1fr)_200px_auto]"
                  >
                    <CoverTile src={c.cover} title={c.title} icon={topicIcon(c.category)} className="aspect-auto h-10 rounded-lg md:h-11 [&_svg]:h-5 [&_svg]:w-5" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold text-ui-text">{c.title}</span>
                      <span className="text-[13px] text-ui-muted">{closestLine(s, pct)}</span>
                    </span>
                    <span className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                      <span className="flex items-center gap-2.5">
                        <ProgressBar value={pct} className="flex-1" label={`${c.title} progress`} />
                        <span className="w-[34px] text-right text-[13px] font-semibold tabular-nums text-ui-text">{pct}%</span>
                      </span>
                      {s && (
                        <span className="text-xs text-ui-muted">
                          {s.finalExam
                            ? `Final exam: ${s.finalExam.questions} questions${s.finalExam.isGraded ? `, pass at ${s.finalExam.passingScore}%` : ''}`
                            : 'Certificate issued at 100% progress'}
                        </span>
                      )}
                    </span>
                    <Link
                      href={courseHref(c.id)}
                      aria-label={`Continue ${c.title}`}
                      className={cn(btn({ variant: 'secondary', size: 'sm' }), 'col-span-2 h-9 md:col-span-1')}
                    >
                      Continue
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="c-how" role="region" className="flex flex-col gap-4 px-5 py-[18px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="c-how" className="text-base font-semibold text-ui-text">
              How certificates work
            </h2>
            <Link href="/dashboard/courses" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
              Browse courses
            </Link>
          </div>
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-3">
            {[
              {
                icon: GraduationCap,
                title: 'Finish every unit',
                body: 'Every unit step counts toward your course progress. Reach 100%.',
              },
              {
                icon: ClipboardCheck,
                title: 'Pass the final exam',
                body:
                  passScores.length === 1
                    ? `If the course has one. The final exams in your courses pass at ${passScores[0]}%.`
                    : 'If the course has one. Each exam shows its pass mark before you start.',
              },
              {
                icon: Award,
                title: 'Get your certificate',
                body: 'Issued with a unique number when you finish. Download it from this page.',
              },
            ].map((step) => (
              <li key={step.title} className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-text">
                  <step.icon className="h-[17px] w-[17px]" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ui-text">{step.title}</span>
                  <span className="text-[13px] leading-relaxed text-ui-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <CertificateModal open={!!viewing} certificate={viewing} courseTitle={viewing?.courseTitle ?? ''} onClose={() => setViewing(null)} />
    </DashboardLayout>
  )
}
