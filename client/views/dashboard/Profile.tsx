'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Save,
  Pencil,
  X,
  User as UserIcon,
  Mail,
  Phone,
  Building2,
  MapPin,
  Award,
  Download,
  ChevronDown,
  Lock,
  KeyRound,
  GraduationCap,
  Loader2,
  Globe,
} from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { PhoneField } from '@/components/ui/PhoneField'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { apiFetch } from '@/lib/api'
import { getToken, getUser, setAuth } from '@/lib/auth'
import { fetchUserCertificates, downloadCertificate, type CertificateWithCourse } from '@/lib/api/lms'

const COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

const SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

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

function formatTimezone(tz: string) {
  try {
    const offset = new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset', timeZone: tz })
      .formatToParts()
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
    return `${tz} (${offset})`
  } catch {
    return tz
  }
}

function avatarUrl(name: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=9f2063&fontSize=42&radius=50`
}

export default function ProfilePage() {
  const [loaded, setLoaded] = useState(false)
  const [serverUser, setServerUser] = useState<MeUser | null>(null)
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    bio: '',
    company: '',
    country: '',
  })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  const [certificates, setCertificates] = useState<CertificateWithCourse[]>([])
  const [certsLoading, setCertsLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const loadProfile = () => {
    let cancelled = false
    apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/auth/me')
      .then(({ data }) => {
        if (cancelled) return
        const u = data.user
        setServerUser(u)
        setForm({
          fullName: u.fullName,
          phone: u.phone ?? '',
          bio: u.bio ?? '',
          company: u.company ?? '',
          country: u.country ?? '',
        })
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Failed to load profile')
        setLoaded(true)
      })
    return () => { cancelled = true }
  }

  // Initial load
  useEffect(loadProfile, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch whenever the Copilot bot saves a profile update
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('smeep:profile-updated', handler)
    return () => window.removeEventListener('smeep:profile-updated', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    fetchUserCertificates()
      .then((data) => {
        if (!cancelled) setCertificates(data)
      })
      .catch(() => {
        if (!cancelled) setCertificates([])
      })
      .finally(() => {
        if (!cancelled) setCertsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }))
  }

  function validateForm() {
    const e: Record<string, string> = {}
    if (!form.fullName.trim() || form.fullName.trim().length < 2)
      e.fullName = 'Name must be at least 2 characters'
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
        setForm({
          fullName: data.user.fullName,
          phone: data.user.phone ?? '',
          bio: data.user.bio ?? '',
          company: data.user.company ?? '',
          country: data.user.country ?? '',
        })
        const currentUser = getUser()
        if (currentUser) {
          setAuth(getToken()!, { ...currentUser, fullName: data.user.fullName })
        }
        setEditing(false)
        toast.success('Profile updated', {
          description: 'Your changes are now reflected across the dashboard.',
        })
      })
      .catch((err: { error?: { message?: string; code?: string; errors?: Record<string, string[]> } }) => {
        if (err?.error?.code === 'VALIDATION_ERROR' && err.error.errors) {
          const mapped: Record<string, string> = {}
          for (const [k, msgs] of Object.entries(err.error.errors)) {
            mapped[k] = msgs[0] ?? ''
          }
          setErrors(mapped)
        } else {
          toast.error(err?.error?.message ?? 'Failed to save changes')
        }
      })
      .finally(() => setSaving(false))
  }

  function cancelEdit() {
    if (!serverUser) return
    setForm({
      fullName: serverUser.fullName,
      phone: serverUser.phone ?? '',
      bio: serverUser.bio ?? '',
      company: serverUser.company ?? '',
      country: serverUser.country ?? '',
    })
    setErrors({})
    setEditing(false)
  }

  function validatePw() {
    const e: Record<string, string> = {}
    if (!pwForm.current) e.current = 'Current password is required'
    if (pwForm.next.length < 8) e.next = 'Must be at least 8 characters'
    if (pwForm.next !== pwForm.confirm) e.confirm = "Passwords don't match"
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
      headers: { 'Content-Type': 'application/json' },
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
          for (const [k, msgs] of Object.entries(err.error.errors)) {
            mapped[k] = msgs[0] ?? ''
          }
          setPwErrors(mapped)
        } else {
          toast.error(err?.error?.message ?? 'Failed to update password')
        }
      })
      .finally(() => setPwSaving(false))
  }

  async function handleDownload(cert: CertificateWithCourse) {
    setDownloadingId(cert.id)
    try {
      const response = await downloadCertificate(cert.id)
      if (!response.ok) {
        toast.error('Certificate file not available')
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
      toast.error('Failed to download certificate')
    } finally {
      setDownloadingId(null)
    }
  }

  if (!loaded) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32 text-brand-text-muted text-sm">
          Loading…
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Profile"
        title="Your"
        highlight="account"
        subtitle="Update your details so SMEEP, mentors, and the AI assistant can tailor everything to you."
      />

      <form onSubmit={onSubmit} className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* Profile card */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-12 lg:col-span-4 rounded-2xl bg-brand-deep text-white border border-white/10 p-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
          <motion.div
            aria-hidden
            className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-brand-primary/40 blur-3xl"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <div className="relative text-center">
            <div className="relative w-28 h-28 mx-auto rounded-full overflow-hidden ring-4 ring-white/15 shadow-2xl">
              <img
                src={serverUser?.avatarUrl ?? avatarUrl(serverUser?.fullName ?? '')}
                alt={serverUser?.fullName}
                className="w-full h-full object-cover"
              />
              <span className="absolute -bottom-0.5 right-3 w-4 h-4 rounded-full bg-emerald-400 ring-2 ring-brand-deep" />
            </div>
            <h3 className="mt-4 text-xl font-black">{serverUser?.fullName}</h3>
            <p className="text-sm text-white/60 capitalize">{serverUser?.role}</p>
            <p className="text-xs text-white/40 mt-1">{serverUser?.company}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/[0.05] border border-white/10 py-2.5">
                <p className="text-base font-black">{serverUser?.certificatesCount ?? 0}</p>
                <p className="text-[9px] text-white/60 uppercase tracking-wider">Certs</p>
              </div>
              <div className="rounded-lg bg-white/[0.05] border border-white/10 py-2.5">
                <p className="text-base font-black">{serverUser?.coursesCount ?? 0}</p>
                <p className="text-[9px] text-white/60 uppercase tracking-wider">Courses</p>
              </div>
            </div>

            <p className="mt-5 text-[11px] text-white/40 uppercase tracking-wider">
              Member since{' '}
              {serverUser?.createdAt
                ? new Date(serverUser.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </p>
          </div>
        </motion.aside>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="col-span-12 lg:col-span-8 rounded-2xl bg-white border border-brand-surface-2 p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
                {editing ? 'Editing profile' : 'Personal details'}
              </p>
              <p className="text-xs text-brand-text-muted/80 mt-0.5">
                {editing
                  ? "Update your details and save when you're ready."
                  : 'These details power your AI assistant and certificates.'}
              </p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit profile
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field icon={<UserIcon className="w-3.5 h-3.5" />} label="Full name" error={errors.fullName}>
              {editing ? (
                <input
                  value={form.fullName}
                  onChange={(e) => update('fullName', e.target.value)}
                  className={`profile-input${errors.fullName ? ' border-rose-400' : ''}`}
                  required
                />
              ) : (
                <p className="profile-readonly">{serverUser?.fullName}</p>
              )}
            </Field>
            <Field icon={<Mail className="w-3.5 h-3.5" />} label="Email">
              <p className="profile-readonly">{serverUser?.email}</p>
            </Field>
            <Field icon={<Phone className="w-3.5 h-3.5" />} label="Phone">
              {editing ? (
                <PhoneField
                  value={form.phone}
                  onChange={(v) => update('phone', v)}
                />
              ) : (
                <p className="profile-readonly">{serverUser?.phone || '—'}</p>
              )}
            </Field>
            <Field icon={<MapPin className="w-3.5 h-3.5" />} label="Country">
              {editing ? (
                <div className="relative">
                  <select
                    value={form.country}
                    onChange={(e) => update('country', e.target.value)}
                    className="profile-input appearance-none pr-8 cursor-pointer"
                  >
                    <option value="">Select country…</option>
                    {COUNTRIES.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted pointer-events-none" />
                </div>
              ) : (
                <p className="profile-readonly">{serverUser?.country || '—'}</p>
              )}
            </Field>
            <Field icon={<Building2 className="w-3.5 h-3.5" />} label="Company">
              {editing ? (
                <input
                  value={form.company}
                  onChange={(e) => update('company', e.target.value)}
                  className="profile-input"
                />
              ) : (
                <p className="profile-readonly">{serverUser?.company || '—'}</p>
              )}
            </Field>
            <Field icon={<Globe className="w-3.5 h-3.5" />} label="Timezone">
              <p className="profile-readonly text-brand-text-muted">
                {serverUser?.timezone ? formatTimezone(serverUser.timezone) : '—'}
              </p>
            </Field>
          </div>

          <Field label="Bio">
            {editing ? (
              <textarea
                value={form.bio}
                onChange={(e) => update('bio', e.target.value)}
                rows={4}
                maxLength={500}
                className="profile-input resize-none"
                placeholder="Tell us about your business so the AI assistant can personalise its answers."
              />
            ) : (
              <p className="profile-readonly leading-relaxed whitespace-pre-line">
                {serverUser?.bio || '—'}
              </p>
            )}
          </Field>

          {editing && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-surface text-brand-text-primary text-sm font-semibold hover:bg-brand-surface-2 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark disabled:opacity-50 transition-colors shadow-lg"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </motion.div>
      </form>

      {/* Password change */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-4 rounded-2xl bg-white border border-brand-surface-2 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-brand-text-primary">Security</p>
            <p className="text-[11px] text-brand-text-muted">Keep your account secure.</p>
          </div>
        </div>
        <form onSubmit={onChangePassword} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field icon={<KeyRound className="w-3.5 h-3.5" />} label="Current password" error={pwErrors.current}>
            <input
              type="password"
              autoComplete="current-password"
              value={pwForm.current}
              onChange={(e) => { setPwForm((p) => ({ ...p, current: e.target.value })); setPwErrors((e2) => ({ ...e2, current: '' })) }}
              className={`profile-input${pwErrors.current ? ' border-rose-400' : ''}`}
            />
          </Field>
          <Field icon={<KeyRound className="w-3.5 h-3.5" />} label="New password" error={pwErrors.next}>
            <input
              type="password"
              autoComplete="new-password"
              value={pwForm.next}
              onChange={(e) => { setPwForm((p) => ({ ...p, next: e.target.value })); setPwErrors((e2) => ({ ...e2, next: '' })) }}
              className={`profile-input${pwErrors.next ? ' border-rose-400' : ''}`}
            />
          </Field>
          <Field icon={<KeyRound className="w-3.5 h-3.5" />} label="Confirm new password" error={pwErrors.confirm}>
            <input
              type="password"
              autoComplete="new-password"
              value={pwForm.confirm}
              onChange={(e) => { setPwForm((p) => ({ ...p, confirm: e.target.value })); setPwErrors((e2) => ({ ...e2, confirm: '' })) }}
              className={`profile-input${pwErrors.confirm ? ' border-rose-400' : ''}`}
            />
          </Field>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={pwSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark disabled:opacity-50 transition-colors"
            >
              {pwSaving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </motion.section>

      {/* Certifications — real earned certificates */}
      <section className="mt-6">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
              Certifications
            </p>
            <h3 className="text-2xl sm:text-3xl font-black text-brand-text-primary mt-1">
              Your verified <span className="text-brand-primary">achievements</span>
            </h3>
            <p className="text-sm text-brand-text-muted/80 mt-1 max-w-2xl">
              Each certificate proves a SMEEP course you completed. Download to share on LinkedIn or keep for your records.
            </p>
          </div>
        </div>

        {certsLoading ? (
          <div className="flex items-center justify-center py-16 text-brand-text-muted text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading certificates…
          </div>
        ) : certificates.length === 0 ? (
          <div className="rounded-2xl border border-brand-surface-2 bg-white flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
              <Award className="w-7 h-7 text-brand-primary/60" />
            </div>
            <p className="text-sm font-semibold text-brand-text-primary">No certificates yet</p>
            <p className="text-xs text-brand-text-muted text-center max-w-xs">
              Complete a course to earn your first certificate of completion.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {certificates.map((cert, i) => {
              const certImageUrl = cert.certificateUrl
                ? `${SERVER_URL}${cert.certificateUrl}`
                : null
              const issuedDate = new Date(cert.issuedAt).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
              const isDownloading = downloadingId === cert.id

              return (
                <motion.article
                  key={cert.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.5 }}
                  whileHover={{ rotate: -0.5, y: -4 }}
                  className="group relative overflow-hidden rounded-2xl shadow-xl border border-brand-surface-2"
                >
                  {/* Certificate preview */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {certImageUrl ? (
                      <img
                        src={certImageUrl}
                        alt={`Certificate for ${cert.courseTitle}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex flex-col items-center justify-center text-white gap-3 p-6">
                        <Award className="w-12 h-12 text-white/80" />
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold mb-1">Certificate of Completion</p>
                          <p className="text-sm font-black leading-tight line-clamp-3">{cert.courseTitle}</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
                        <Award className="w-3 h-3" />
                        Verified
                      </span>
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="bg-white px-5 py-3">
                    <p className="text-sm font-bold text-brand-text-primary line-clamp-1">{cert.courseTitle}</p>
                    <p className="text-[11px] text-brand-text-muted mt-0.5">{issuedDate}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-mono text-brand-text-muted/70 truncate">{cert.certificateNumber}</p>
                      <button
                        type="button"
                        onClick={() => handleDownload(cert)}
                        disabled={isDownloading}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-surface text-brand-text-primary hover:bg-brand-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        aria-label="Download certificate"
                      >
                        {isDownloading
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                </motion.article>
              )
            })}
          </div>
        )}
      </section>

      <style>{`
        .profile-input {
          width: 100%;
          background: var(--color-brand-surface);
          border: 1px solid var(--color-brand-surface-2);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: var(--color-brand-text-primary);
          transition: all 0.15s ease;
        }
        .profile-input:focus {
          outline: none;
          background: white;
          border-color: var(--color-brand-primary);
          box-shadow: 0 0 0 3px rgba(159, 32, 99, 0.15);
        }
        .profile-readonly {
          width: 100%;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: var(--color-brand-text-primary);
          background: transparent;
          border: 1px dashed transparent;
          border-radius: 0.75rem;
          min-height: 2.5rem;
          word-break: break-word;
        }
      `}</style>
    </DashboardLayout>
  )
}

function Field({
  label,
  icon,
  error,
  children,
}: {
  label: string
  icon?: React.ReactNode
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-1.5 cursor-default">
        {icon}
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
    </div>
  )
}
