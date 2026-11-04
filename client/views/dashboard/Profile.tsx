'use client'

import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Award,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Tag,
  User as UserIcon,
} from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Avatar, Button, Card, Field, PageHeader, ProgressBar, Skeleton, inputClass } from '@/components/kit'
import { PhoneInput, errorRing } from '@/components/learner-grow/PhoneInput'
import { apiFetch } from '@/lib/api'
import { getToken, getUser, setAuth } from '@/lib/auth'
import { downloadCertificate, fetchLearnerCourses, fetchUserCertificates, type CertificateWithCourse } from '@/lib/api/lms'
import { fetchOffers } from '@/lib/api/offers'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'

const COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

interface MeUser {
  id: string
  fullName: string
  email: string
  role: string
  country: string | null
  bio: string | null
  company: string | null
  phone: string | null
  timezone: string | null
  avatarUrl: string | null
  certificatesCount: number
  coursesCount: number
  createdAt: string
}

type ProfileForm = { fullName: string; phone: string; bio: string; company: string; country: string }

function formFrom(u: MeUser): ProfileForm {
  return { fullName: u.fullName, phone: u.phone ?? '', bio: u.bio ?? '', company: u.company ?? '', country: u.country ?? '' }
}

function formatTimezone(tz: string) {
  try {
    const offset =
      new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset', timeZone: tz })
        .formatToParts()
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    return `${tz} (${offset})`
  } catch {
    return tz
  }
}

const ROLE_LABEL: Record<string, string> = { sme: 'Learner', mentor: 'Mentor', admin: 'Admin' }

// ── Pieces ────────────────────────────────────────────────────────────────────

function DetailRow({
  icon: Icon,
  label,
  hint,
  children,
  className,
}: {
  icon: typeof Mail
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-t border-ui-line py-3.5', className)}>
      <Icon className="mt-px h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-xs text-ui-muted">{label}</span>
        <span className="text-[15px] font-medium text-ui-text [overflow-wrap:anywhere]">{children}</span>
        {hint && <span className="text-xs text-ui-muted">{hint}</span>}
      </div>
    </div>
  )
}

function NotAdded({ children = 'Not added' }: { children?: ReactNode }) {
  return <span className="text-ui-muted">{children}</span>
}

function SummaryLink({ href, icon: Icon, label, value }: { href: string; icon: typeof Mail; label: string; value: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded py-0.5 text-sm font-semibold text-ui-text">
      <Icon className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
      <span className="flex-1 group-hover:underline">{label}</span>
      <span className="text-[13px] font-medium text-ui-muted">{value}</span>
      <ChevronRight className="h-4 w-4 text-ui-muted" aria-hidden />
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [loaded, setLoaded] = useState(false)
  const [serverUser, setServerUser] = useState<MeUser | null>(null)
  const [form, setForm] = useState<ProfileForm>({ fullName: '', phone: '', bio: '', company: '', country: '' })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  // Points come with the offers list; course progress from the learner course list.
  const { data: offersData } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })
  const { data: courses } = useQuery({ queryKey: ['learner-courses'], queryFn: fetchLearnerCourses })
  const points = offersData?.userPoints
  const enrolled = (courses ?? []).filter((c) => c.isEnrolled).sort((a, b) => b.progressPercentage - a.progressPercentage)
  const { data: certificates, isError: certsError } = useQuery({ queryKey: ['user-certificates'], queryFn: fetchUserCertificates })
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleDownload(cert: CertificateWithCourse) {
    setDownloadingId(cert.id)
    try {
      const response = await downloadCertificate(cert.id)
      if (!response.ok) {
        toast.error('This certificate file is not ready yet')
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${cert.certificateNumber}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('The download did not start. Try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  const loadProfile = () => {
    let cancelled = false
    apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/auth/me')
      .then(({ data }) => {
        if (cancelled) return
        setServerUser(data.user)
        setForm(formFrom(data.user))
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Could not load your profile')
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }

  // Initial load
  useEffect(loadProfile, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch whenever the Copilot bot saves a profile update
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('hadafi:profile-updated', handler)
    return () => window.removeEventListener('hadafi:profile-updated', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }))
  }

  function validateForm() {
    const e: Record<string, string> = {}
    if (!form.fullName.trim() || form.fullName.trim().length < 2) e.fullName = 'Name must be at least 2 characters'
    return e
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateForm()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSaving(true)
    apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: form.fullName.trim(),
        phone: form.phone || null,
        bio: form.bio || null,
        company: form.company || null,
        country: form.country || null,
      }),
    })
      .then(({ data }) => {
        setServerUser(data.user)
        setForm(formFrom(data.user))
        const cached = getUser()
        const token = getToken()
        if (cached && token) setAuth(token, { ...cached, fullName: data.user.fullName })
        setEditing(false)
        toast.success('Profile updated', { description: 'Your changes now show across Hadafi.' })
      })
      .catch((err: { error?: { message?: string; code?: string; errors?: Record<string, string[]> } }) => {
        if (err?.error?.code === 'VALIDATION_ERROR' && err.error.errors) {
          const mapped: Record<string, string> = {}
          for (const [k, msgs] of Object.entries(err.error.errors)) mapped[k] = msgs[0] ?? ''
          setErrors(mapped)
        } else {
          toast.error(err?.error?.message ?? 'Could not save your changes')
        }
      })
      .finally(() => setSaving(false))
  }

  function cancelEdit() {
    if (!serverUser) return
    setForm(formFrom(serverUser))
    setErrors({})
    setEditing(false)
  }

  function validatePw() {
    const e: Record<string, string> = {}
    if (!pwForm.current) e.current = 'Enter your current password'
    if (pwForm.next.length < 8) e.next = 'Use at least 8 characters'
    if (pwForm.next !== pwForm.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  function onChangePassword(e: FormEvent) {
    e.preventDefault()
    const errs = validatePw()
    if (Object.keys(errs).length > 0) {
      setPwErrors(errs)
      return
    }
    setPwSaving(true)
    apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    })
      .then(() => {
        setPwForm({ current: '', next: '', confirm: '' })
        setPwErrors({})
        toast.success('Password updated')
      })
      .catch((err: { error?: { message?: string; code?: string; errors?: Record<string, string[]> } }) => {
        if (err?.error?.code === 'INVALID_PASSWORD') {
          setPwErrors({ current: 'Current password is incorrect' })
        } else if (err?.error?.code === 'VALIDATION_ERROR' && err.error.errors) {
          const mapped: Record<string, string> = {}
          for (const [k, msgs] of Object.entries(err.error.errors)) mapped[k] = msgs[0] ?? ''
          setPwErrors(mapped)
        } else {
          toast.error(err?.error?.message ?? 'Could not update your password')
        }
      })
      .finally(() => setPwSaving(false))
  }

  function pwInput(key: keyof typeof pwForm, id: string, label: string, autoComplete: string) {
    return (
      <Field label={label} htmlFor={id} error={pwErrors[key]}>
        <input
          id={id}
          type="password"
          autoComplete={autoComplete}
          value={pwForm[key]}
          aria-invalid={!!pwErrors[key] || undefined}
          onChange={(e) => {
            setPwForm((p) => ({ ...p, [key]: e.target.value }))
            setPwErrors((p) => ({ ...p, [key]: '' }))
          }}
          className={cn(inputClass, pwErrors[key] && errorRing)}
        />
      </Field>
    )
  }

  const u = serverUser
  const memberSince = u?.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
  const roleLine = [u ? ROLE_LABEL[u.role] ?? u.role : null, u?.country].filter(Boolean).join(', ')

  return (
    <DashboardLayout>
      <PageHeader title="Profile" subtitle="Update your details so Hadafi, mentors and Hana can tailor everything to you." />

      {!loaded ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading profile">
          <Card className="flex flex-col items-center gap-3 p-5">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-16 w-full" />
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-40 w-full" />
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* ── Summary ─────────────────────────────────────────────────── */}
          <aside aria-label="Your summary" className="flex flex-col gap-[18px] rounded-[14px] border border-ui-line bg-ui-surface p-5">
            <div className="flex flex-col items-center gap-1 text-center">
              <Avatar name={u?.fullName ?? ''} src={u?.avatarUrl} size={80} className="mb-2" />
              <span className="text-lg font-semibold text-ui-text">{u?.fullName}</span>
              {roleLine && <span className="text-[13px] text-ui-muted">{roleLine}</span>}
              {memberSince && <span className="text-xs text-ui-muted">Member since {memberSince}</span>}
            </div>

            <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-ui-line">
              {[
                { label: 'Points', value: points },
                { label: 'Courses', value: u?.coursesCount },
                { label: 'Certificates', value: u?.certificatesCount },
              ].map((s, i) => (
                <div key={s.label} className={cn('flex flex-col-reverse gap-0.5 px-1.5 py-3 text-center', i > 0 && 'border-l border-ui-line')}>
                  <dt className="text-xs text-ui-muted">{s.label}</dt>
                  <dd className="text-xl font-bold text-ui-text tabular-nums">{s.value ?? '-'}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-ui-text">Learning summary</h2>
                <Link href="/dashboard/courses" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
                  My courses
                </Link>
              </div>
              {courses === undefined ? (
                <Skeleton className="h-24 w-full" />
              ) : enrolled.length === 0 ? (
                <p className="text-[13px] text-ui-muted">You have not started a course yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {enrolled.slice(0, 4).map((c) => (
                    <li key={c.id} className="grid grid-cols-[40px_minmax(0,1fr)_38px] items-center gap-2.5">
                      {c.cover ? (
                        <img src={optimizedSrc(c.cover)} alt="" className="h-[30px] w-10 rounded-md object-cover" />
                      ) : (
                        <span aria-hidden className="inline-flex h-[30px] w-10 items-center justify-center rounded-md bg-[#4c1d6e] text-[#f3d7ea]">
                          <FileText className="h-4 w-4" />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col gap-[5px]">
                        <Link href={`/dashboard/courses/${c.id}`} className="truncate text-[13px] font-semibold text-ui-text hover:underline">
                          {c.title}
                        </Link>
                        <ProgressBar value={c.progressPercentage} label={`${c.title} progress`} />
                      </span>
                      <span className="text-right text-xs font-semibold text-ui-text tabular-nums">{Math.round(c.progressPercentage)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-ui-line pt-3.5">
              <SummaryLink
                href="/dashboard/certificates"
                icon={Award}
                label="Certificates"
                value={u?.certificatesCount ? `${u.certificatesCount} earned` : 'None yet'}
              />
              <SummaryLink
                href="/dashboard/offers"
                icon={Tag}
                label="Points and offers"
                value={points !== undefined ? `${points.toLocaleString()} to spend` : ''}
              />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {/* ── Personal details ─────────────────────────────────────── */}
            <section aria-labelledby="p-details" className="rounded-[14px] border border-ui-line bg-ui-surface px-5 pb-1.5 pt-[18px]">
              <form onSubmit={onSubmit} noValidate>
                <div className="flex flex-wrap items-center gap-3 pb-3.5">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <h2 id="p-details" className="text-base font-semibold text-ui-text">
                      {editing ? 'Edit personal details' : 'Personal details'}
                    </h2>
                    <span className="text-[13px] text-ui-muted">
                      {editing ? 'Update your details and save when you are ready.' : 'These details power Hana and your certificates'}
                    </span>
                  </div>
                  {!editing && (
                    <Button size="sm" className="h-9" onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit profile
                    </Button>
                  )}
                </div>

                {editing ? (
                  <div className="flex flex-col gap-4 border-t border-ui-line pb-4 pt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Full name" htmlFor="p-name" error={errors.fullName}>
                        <input
                          id="p-name"
                          value={form.fullName}
                          autoComplete="name"
                          aria-invalid={!!errors.fullName || undefined}
                          onChange={(e) => update('fullName', e.target.value)}
                          className={cn(inputClass, errors.fullName && errorRing)}
                        />
                      </Field>
                      <Field label="Email" htmlFor="p-email" hint="Used to sign in, cannot be changed here">
                        <input id="p-email" value={u?.email ?? ''} disabled readOnly className={inputClass} />
                      </Field>
                      <Field label="Phone" htmlFor="p-phone" error={errors.phone}>
                        <PhoneInput id="p-phone" value={form.phone} onChange={(v) => update('phone', v)} invalid={!!errors.phone} />
                      </Field>
                      <Field label="Country" htmlFor="p-country" error={errors.country}>
                        <div className="relative">
                          <select
                            id="p-country"
                            value={form.country}
                            autoComplete="country-name"
                            onChange={(e) => update('country', e.target.value)}
                            className={cn(inputClass, 'cursor-pointer appearance-none pr-9', errors.country && errorRing)}
                          >
                            <option value="">Select a country</option>
                            {COUNTRIES.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
                        </div>
                      </Field>
                      <Field label="Company" htmlFor="p-company" error={errors.company}>
                        <input
                          id="p-company"
                          value={form.company}
                          autoComplete="organization"
                          onChange={(e) => update('company', e.target.value)}
                          className={cn(inputClass, errors.company && errorRing)}
                        />
                      </Field>
                      <Field label="Timezone" htmlFor="p-tz" hint="Set from your device">
                        <input id="p-tz" value={u?.timezone ? formatTimezone(u.timezone) : ''} disabled readOnly className={inputClass} />
                      </Field>
                    </div>
                    <Field
                      label="Bio"
                      htmlFor="p-bio"
                      error={errors.bio}
                      hint={`${form.bio.length}/500. Tell us about your business so Hana can personalise its answers.`}
                    >
                      <textarea
                        id="p-bio"
                        value={form.bio}
                        rows={4}
                        maxLength={500}
                        onChange={(e) => update('bio', e.target.value)}
                        className={cn(inputClass, 'h-auto resize-y py-2.5 leading-normal', errors.bio && errorRing)}
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Saving' : 'Save changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-7">
                      <DetailRow icon={UserIcon} label="Full name">
                        {u?.fullName}
                      </DetailRow>
                      <DetailRow icon={Mail} label="Email" hint="Used to sign in, cannot be changed here">
                        {u?.email}
                      </DetailRow>
                      <DetailRow icon={Phone} label="Phone">
                        {u?.phone || <NotAdded />}
                      </DetailRow>
                      <DetailRow icon={MapPin} label="Country">
                        {u?.country || <NotAdded />}
                      </DetailRow>
                      <DetailRow icon={Building2} label="Company">
                        {u?.company || <NotAdded />}
                      </DetailRow>
                      <DetailRow icon={Clock} label="Timezone" hint={u?.timezone ? 'Set from your device' : undefined}>
                        {u?.timezone ? formatTimezone(u.timezone) : <NotAdded />}
                      </DetailRow>
                    </div>
                    <DetailRow icon={FileText} label="Bio">
                      {u?.bio ? (
                        <span className="whitespace-pre-line">{u.bio}</span>
                      ) : (
                        <NotAdded>Not added. Tell us about your business so Hana can personalise its answers.</NotAdded>
                      )}
                    </DetailRow>
                  </>
                )}
              </form>
            </section>

            {/* ── Certificates ─────────────────────────────────────────── */}
            <section aria-labelledby="p-certs" className="flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 id="p-certs" className="text-base font-semibold text-ui-text">Certificates</h2>
                  <span className="text-[13px] text-ui-muted">Each one proves a Hadafi course you completed. Download it to share or keep.</span>
                </div>
              </div>
              {certificates === undefined && !certsError ? (
                <Skeleton className="h-16 w-full" />
              ) : !certificates || certificates.length === 0 ? (
                <p className="text-[13px] text-ui-muted">
                  {certsError ? 'Your certificates could not load right now.' : 'Complete a course to earn your first certificate.'}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {certificates.map((cert) => (
                    <li key={cert.id} className="flex items-center gap-3 border-t border-ui-line py-3 first:border-t-0">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
                        <Award className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold text-ui-text">{cert.courseTitle}</span>
                        <span className="truncate text-xs text-ui-muted">
                          {new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
                          <span className="font-mono">{cert.certificateNumber}</span>
                        </span>
                      </span>
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => handleDownload(cert)}
                        disabled={downloadingId === cert.id}
                        aria-label={`Download the certificate for ${cert.courseTitle}`}
                      >
                        {downloadingId === cert.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Security ─────────────────────────────────────────────── */}

            <section aria-labelledby="p-sec" className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-text">
                  <Lock className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="flex flex-col gap-0.5">
                  <h2 id="p-sec" className="text-base font-semibold text-ui-text">Security</h2>
                  <span className="text-[13px] text-ui-muted">
                    Change your password. New passwords need at least 8 characters.
                  </span>
                </div>
              </div>
              <form onSubmit={onChangePassword} noValidate className="flex flex-col gap-4">
                <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-3">
                  {pwInput('current', 'p-cur', 'Current password', 'current-password')}
                  {pwInput('next', 'p-new', 'New password', 'new-password')}
                  {pwInput('confirm', 'p-conf', 'Confirm new password', 'new-password')}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary" disabled={pwSaving}>
                    {pwSaving ? 'Saving' : 'Update password'}
                  </Button>
                </div>
              </form>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
