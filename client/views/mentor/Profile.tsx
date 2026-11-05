'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, ChevronDown, Globe, Linkedin, Lock, LogOut, Mail } from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { Avatar, Button, Card, PageHeader, Skeleton, inputClass } from '@/components/kit'
import {
  IconTile,
  PhoneInput,
  apiErrorMessage,
  fetchMe,
  isHttpsUrl,
  updateMe,
  type ApiError,
  type MeUser,
} from '@/components/mentor/mentorKit'
import { changePassword, renameCachedUser, setFirstPassword, signOut } from '@/lib/auth'
import { getMyAvailability } from '@/lib/api/mentorAvailability'
import { uploadMentorPhoto } from '@/lib/api/redesign'
import { cn } from '@/lib/utils'

const COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

const MAX_PHOTO = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type Form = {
  fullName: string
  phone: string
  bio: string
  company: string
  country: string
  linkedinUrl: string
  meetingLink: string
}

function toForm(u: MeUser): Form {
  return {
    fullName: u.fullName,
    phone: u.phone ?? '',
    bio: u.bio ?? '',
    company: u.company ?? '',
    country: u.country ?? '',
    linkedinUrl: u.linkedinUrl ?? '',
    meetingLink: u.meetingLink ?? '',
  }
}

function isUrl(v: string) {
  try {
    new URL(v)
    return true
  } catch {
    return false
  }
}

function fieldErrors(err: unknown): Record<string, string> | null {
  const e = (err as ApiError)?.error
  if (e && typeof e === 'object' && e.code === 'VALIDATION_ERROR' && e.errors) {
    const out: Record<string, string> = {}
    for (const [k, msgs] of Object.entries(e.errors)) out[k] = msgs[0] ?? ''
    return out
  }
  return null
}

export default function MentorProfile() {
  const router = useRouter()
  const [serverUser, setServerUser] = useState<MeUser | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState<Form>({ fullName: '', phone: '', bio: '', company: '', country: '', linkedinUrl: '', meetingLink: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [openSlots, setOpenSlots] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((u) => {
        if (cancelled) return
        setServerUser(u)
        setForm(toForm(u))
        // Auto-detect and save the timezone when it isn't set yet (best effort).
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (!u.timezone && detected) {
          updateMe({ timezone: detected })
            .then(() => !cancelled && setServerUser((p) => (p ? { ...p, timezone: detected } : p)))
            .catch(() => {})
        }
      })
      .catch(() => !cancelled && toast.error('Failed to load profile'))
      .finally(() => !cancelled && setLoaded(true))
    getMyAvailability()
      .then((d) => !cancelled && setOpenSlots(d.upcoming.filter((s) => s.isAvailable).length))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }))
  }

  const dirty = !!serverUser && JSON.stringify(form) !== JSON.stringify(toForm(serverUser))

  function validate() {
    const e: Record<string, string> = {}
    if (form.fullName.trim().length < 2) e.fullName = 'Name must be at least 2 characters'
    if (form.linkedinUrl && !isUrl(form.linkedinUrl)) e.linkedinUrl = 'Must be a valid URL (e.g. https://linkedin.com/in/...)'
    if (form.meetingLink && !isHttpsUrl(form.meetingLink)) e.meetingLink = 'Please enter a valid URL that starts with https://'
    return e
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setSaving(true)
    updateMe({
      fullName: form.fullName.trim(),
      phone: form.phone || null,
      bio: form.bio || null,
      company: form.company || null,
      country: form.country || null,
      linkedinUrl: form.linkedinUrl || null,
      meetingLink: form.meetingLink || null,
    })
      .then((u) => {
        setServerUser(u)
        setForm(toForm(u))
        renameCachedUser(u.fullName)
        toast.success('Profile updated')
      })
      .catch((err) => {
        const mapped = fieldErrors(err)
        if (mapped) setErrors(mapped)
        else toast.error(apiErrorMessage(err, 'Failed to save changes'))
      })
      .finally(() => setSaving(false))
  }

  function cancelEdit() {
    if (!serverUser) return
    setForm(toForm(serverUser))
    setErrors({})
  }

  function onPhoto(file: File | undefined) {
    setPhotoError('')
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) return setPhotoError('Use a JPEG, PNG or WebP image.')
    if (file.size > MAX_PHOTO) return setPhotoError('The image must be 5 MB or smaller.')
    setUploading(true)
    uploadMentorPhoto(file)
      .then(({ avatarUrl }) => {
        setServerUser((p) => (p ? { ...p, avatarUrl } : p))
        window.dispatchEvent(new Event('hadafi:avatar-changed'))
        toast.success('Photo updated')
      })
      .catch((err) => setPhotoError(apiErrorMessage(err, 'Could not upload the photo. Try again.')))
      .finally(() => {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      })
  }

  // Accounts made by email code have no password yet; they add one instead of changing it.
  const firstPassword = serverUser?.hasPassword === false

  function validatePw() {
    const e: Record<string, string> = {}
    if (!firstPassword && !pwForm.current) e.current = 'Current password is required'
    if (pwForm.next.length < 8) e.next = 'Must be at least 8 characters'
    if (pwForm.next !== pwForm.confirm) e.confirm = "Passwords don't match"
    return e
  }

  function onChangePassword(e: FormEvent) {
    e.preventDefault()
    const errs = validatePw()
    if (Object.keys(errs).length) {
      setPwErrors(errs)
      return
    }
    setPwSaving(true)
    ;(firstPassword ? setFirstPassword(pwForm.next) : changePassword(pwForm.current, pwForm.next))
      .then(() => {
        setPwForm({ current: '', next: '', confirm: '' })
        setPwErrors({})
        if (firstPassword) setServerUser((p) => (p ? { ...p, hasPassword: true } : p))
        toast.success(firstPassword ? 'Password set' : 'Password updated')
      })
      .catch((err) => {
        const code = (err as { error?: { code?: string } })?.error?.code
        if (code === 'INVALID_PASSWORD') return setPwErrors({ current: 'Current password is incorrect' })
        const mapped = fieldErrors(err)
        if (mapped) setPwErrors(mapped)
        else toast.error(apiErrorMessage(err, 'Failed to update password'))
      })
      .finally(() => setPwSaving(false))
  }

  function updatePw(key: keyof typeof pwForm, value: string) {
    setPwForm((p) => ({ ...p, [key]: value }))
    setPwErrors((e) => ({ ...e, [key]: '' }))
  }

  async function logout() {
    await signOut().catch(() => {})
    router.push('/login')
  }

  const name = serverUser?.fullName ?? ''
  const missing = serverUser
    ? [
        { label: 'Meeting link', done: !!serverUser.meetingLink, required: true },
        { label: 'Photo', done: !!serverUser.avatarUrl },
        { label: 'Bio', done: !!serverUser.bio },
        { label: 'Country', done: !!serverUser.country },
        { label: 'Company', done: !!serverUser.company },
        { label: 'Phone', done: !!serverUser.phone },
      ].filter((m) => !m.done)
    : []

  return (
    <MentorLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          className="mb-0 items-center"
          title="Profile"
          subtitle="Manage your public mentor profile and account security."
          actions={
            <Button variant="secondary" onClick={logout}>
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              Log out
            </Button>
          }
        />

        {!loaded ? (
          <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="p-6"><Skeleton className="h-[520px]" /></Card>
            <Card className="p-5"><Skeleton className="h-64" /></Card>
          </div>
        ) : !serverUser ? (
          <Card className="p-6 text-sm text-ui-muted">Your profile could not be loaded. Refresh the page to try again.</Card>
        ) : (
          <div className="grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
            <form onSubmit={onSubmit} noValidate aria-labelledby="h-pub" className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
              <div className="flex flex-col gap-0.5 px-4 py-[18px] sm:px-[22px]">
                <h2 id="h-pub" className="text-lg font-semibold text-ui-text">Public profile</h2>
                <span className="text-[13px] text-ui-muted">Visible to mentees and the platform team.</span>
              </div>

              <div className={secCls}>
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar name={name} src={serverUser.avatarUrl} size={72} className="text-2xl" />
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold text-ui-text">Photo</span>
                    <span className="flex gap-2">
                      <input
                        ref={fileRef}
                        id="p-photo"
                        type="file"
                        aria-label="Profile photo"
                        tabIndex={-1}
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => onPhoto(e.target.files?.[0])}
                      />
                      <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} aria-describedby="p-photo-h">
                        <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        {uploading ? 'Uploading' : serverUser.avatarUrl ? 'Change photo' : 'Upload photo'}
                      </Button>
                    </span>
                    {photoError ? (
                      <span id="p-photo-h" role="alert" className="text-xs text-ui-danger">{photoError}</span>
                    ) : (
                      <span id="p-photo-h" className="text-xs text-ui-muted">Square image, at least 400 by 400 pixels. JPEG, PNG or WebP, up to 5 MB.</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <F label="Full name" htmlFor="p-name" error={errors.fullName}>
                    <input id="p-name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required className={cn(inputClass, errors.fullName && 'border-ui-danger')} />
                  </F>
                  <F label="Email" htmlFor="p-email" readOnly hint="Contact support to change your email.">
                    <span id="p-email" className={roCls}>
                      <Mail className="h-4 w-4 shrink-0 text-ui-muted" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{serverUser.email}</span>
                    </span>
                  </F>
                </div>

                <F label="Bio" htmlFor="p-bio" hint={`${form.bio.length} of 500 characters. Shown on your mentor card.`} error={errors.bio}>
                  <textarea
                    id="p-bio"
                    rows={4}
                    maxLength={500}
                    value={form.bio}
                    onChange={(e) => update('bio', e.target.value)}
                    placeholder="Share your expertise and what you enjoy mentoring."
                    className={cn(inputClass, 'h-auto resize-y py-2.5 leading-normal')}
                  />
                </F>
              </div>

              <div className={secCls}>
                <h3 className="text-[15px] font-semibold text-ui-text">Contact and background</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <F label="LinkedIn URL" htmlFor="p-li" error={errors.linkedinUrl}>
                    <div className="relative">
                      <Linkedin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" strokeWidth={1.75} aria-hidden />
                      <input
                        id="p-li"
                        type="url"
                        value={form.linkedinUrl}
                        onChange={(e) => update('linkedinUrl', e.target.value)}
                        placeholder="https://linkedin.com/in/yourname"
                        className={cn(inputClass, 'pl-[38px]', errors.linkedinUrl && 'border-ui-danger')}
                      />
                    </div>
                  </F>
                  <F label="Company" htmlFor="p-co" error={errors.company}>
                    <input id="p-co" value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Where you work today" className={inputClass} />
                  </F>
                  <F label="Country" htmlFor="p-country" error={errors.country}>
                    <div className="relative">
                      <select id="p-country" value={form.country} onChange={(e) => update('country', e.target.value)} className={cn(inputClass, 'cursor-pointer appearance-none pr-9')}>
                        <option value="">Select country</option>
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        {form.country && !COUNTRIES.includes(form.country) && <option value={form.country}>{form.country}</option>}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" aria-hidden />
                    </div>
                  </F>
                  <F label="Phone" htmlFor="p-phone" error={errors.phone}>
                    <PhoneInput id="p-phone" value={form.phone} onChange={(v) => update('phone', v)} />
                  </F>
                </div>
              </div>

              <div className={secCls}>
                <h3 className="text-[15px] font-semibold text-ui-text">Sessions</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="p-meet" className="text-[13px] font-semibold text-ui-text">Meeting link</label>
                    <input
                      id="p-meet"
                      type="url"
                      value={form.meetingLink}
                      onChange={(e) => update('meetingLink', e.target.value)}
                      placeholder="https://zoom.us/j/your-room"
                      aria-describedby="p-meet-h"
                      aria-invalid={!!errors.meetingLink}
                      className={cn(inputClass, (!form.meetingLink || errors.meetingLink) && 'border-ui-brand')}
                    />
                    {errors.meetingLink ? (
                      <span id="p-meet-h" role="alert" className="text-xs text-ui-danger">{errors.meetingLink}</span>
                    ) : (
                      <span id="p-meet-h" className={cn('text-xs', form.meetingLink ? 'text-ui-muted' : 'text-ui-brand-text')}>
                        {form.meetingLink ? 'Mentees join your sessions with this link.' : 'Required before mentees can book you. Must start with https://'}
                      </span>
                    )}
                  </div>
                  <F label="Timezone" htmlFor="p-tz" readOnly>
                    <span id="p-tz" className={roCls}>
                      <Globe className="h-4 w-4 shrink-0 text-ui-muted" strokeWidth={1.75} aria-hidden />
                      {serverUser.timezone ? (
                        <>
                          {serverUser.timezone} <span className="text-ui-muted">(auto-detected)</span>
                        </>
                      ) : (
                        <span className="text-ui-muted">Not set</span>
                      )}
                    </span>
                  </F>
                </div>
              </div>

              <div className="flex flex-col-reverse items-stretch gap-2.5 border-t border-ui-line bg-ui-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-[22px]">
                <span className="hidden flex-1 text-xs text-ui-muted sm:block">
                  {dirty ? 'You have unsaved changes. They are discarded if you leave this page.' : 'Unsaved changes are discarded if you leave this page.'}
                </span>
                <Button variant="secondary" onClick={cancelEdit} disabled={!dirty || saving}>Cancel</Button>
                <Button type="submit" disabled={!dirty || saving}>{saving ? 'Saving' : 'Save changes'}</Button>
              </div>
            </form>

            <aside className="flex flex-col gap-4">
              <section aria-labelledby="h-prev" className="flex flex-col gap-2.5">
                <h2 id="h-prev" className="text-sm font-semibold text-ui-muted">How learners see you</h2>
                <article className="flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-[18px] shadow-ui">
                  <div className="flex items-center gap-3">
                    <Avatar name={name} src={serverUser.avatarUrl} size={52} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h3 className="truncate text-[15px] font-semibold text-ui-text">{name}</h3>
                      <span className="truncate text-[13px] text-ui-muted">
                        {[serverUser.company, serverUser.country].filter(Boolean).join(', ') || 'Mentor'}
                      </span>
                    </div>
                  </div>
                  {serverUser.bio ? (
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-ui-text">{serverUser.bio}</p>
                  ) : (
                    <p className="text-[13px] text-ui-muted">No bio yet. Add one so learners know what you help with.</p>
                  )}
                  {openSlots ? (
                    <>
                      <span aria-disabled="true" className="inline-flex h-10 items-center justify-center rounded-[10px] bg-ui-brand text-sm font-semibold text-white">
                        See available times
                      </span>
                      <span className="text-center text-xs text-ui-muted">{openSlots} open slot{openSlots === 1 ? '' : 's'} learners can book.</span>
                    </>
                  ) : (
                    <>
                      <span aria-disabled="true" className="inline-flex h-10 items-center justify-center rounded-[10px] bg-ui-surface-2 text-sm font-semibold text-ui-muted">
                        See available times
                      </span>
                      <span className="text-center text-xs text-ui-muted">
                        No open times yet.{' '}
                        <Link href="/mentor/dashboard/availability" className="font-semibold text-ui-brand-text hover:underline">Add availability</Link>
                      </span>
                    </>
                  )}
                </article>
              </section>

              <section aria-labelledby="h-chk" className="flex flex-col gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4">
                <h2 id="h-chk" className="text-[15px] font-semibold text-ui-text">{missing.length ? 'Still missing' : 'Profile complete'}</h2>
                {missing.length === 0 ? (
                  <p className="text-[13px] text-ui-muted">Everything learners look for is filled in.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-[13px] text-ui-text">
                    {missing.map((m) => (
                      <li key={m.label} className="flex items-center gap-2">
                        <span aria-hidden className={cn('h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px]', m.required ? 'border-ui-brand' : 'border-ui-line')} />
                        {m.label}
                        {m.required && <span className="ml-auto text-xs font-semibold text-ui-brand-text">Required</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="h-acc" className="flex flex-col gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4 text-[13px]">
                <h2 id="h-acc" className="text-[15px] font-semibold text-ui-text">Account</h2>
                <div className="flex justify-between gap-3"><span className="text-ui-muted">Role</span><span className="font-semibold text-ui-text">Mentor</span></div>
                <div className="flex justify-between gap-3">
                  <span className="text-ui-muted">Mentor since</span>
                  <span className="font-semibold text-ui-text">
                    {serverUser.createdAt ? new Date(serverUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Not available'}
                  </span>
                </div>
              </section>
            </aside>
          </div>
        )}

        {/* Security */}
        <form onSubmit={onChangePassword} noValidate aria-labelledby="h-sec" className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface px-4 py-5 sm:px-[22px]">
          <div className="flex items-center gap-3">
            <IconTile size={36}><Lock className="h-[18px] w-[18px]" strokeWidth={1.75} /></IconTile>
            <div className="flex flex-col">
              <h2 id="h-sec" className="text-base font-semibold text-ui-text">Security</h2>
              <span className="text-[13px] text-ui-muted">
                {firstPassword
                  ? 'You sign in with a code sent to your email. Add a password if you also want to sign in with one. At least 8 characters.'
                  : 'Change your password. Use at least 8 characters.'}
              </span>
            </div>
          </div>
          <div className={cn('grid grid-cols-1 gap-4', firstPassword ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
            {!firstPassword && (
              <F label="Current password" htmlFor="s-cur" error={pwErrors.current}>
                <input id="s-cur" type="password" autoComplete="current-password" value={pwForm.current} onChange={(e) => updatePw('current', e.target.value)} className={cn(inputClass, pwErrors.current && 'border-ui-danger')} />
              </F>
            )}
            <F label={firstPassword ? 'Password' : 'New password'} htmlFor="s-new" error={pwErrors.next ?? pwErrors.newPassword}>
              <input id="s-new" type="password" autoComplete="new-password" value={pwForm.next} onChange={(e) => updatePw('next', e.target.value)} className={cn(inputClass, (pwErrors.next || pwErrors.newPassword) && 'border-ui-danger')} />
            </F>
            <F label={firstPassword ? 'Confirm password' : 'Confirm new password'} htmlFor="s-con" error={pwErrors.confirm}>
              <input id="s-con" type="password" autoComplete="new-password" value={pwForm.confirm} onChange={(e) => updatePw('confirm', e.target.value)} className={cn(inputClass, pwErrors.confirm && 'border-ui-danger')} />
            </F>
          </div>
          <Button type="submit" variant="secondary" disabled={pwSaving} className="self-stretch sm:self-end">
            {pwSaving ? 'Saving' : firstPassword ? 'Set password' : 'Update password'}
          </Button>
        </form>
      </div>
    </MentorLayout>
  )
}

const secCls = 'flex flex-col gap-4 border-t border-ui-line px-4 py-[18px] sm:px-[22px] sm:py-5'
const roCls = 'flex min-h-10 min-w-0 items-center gap-2 rounded-[10px] bg-ui-surface-2 px-3 text-sm text-ui-text'

function F({
  label,
  htmlFor,
  hint,
  error,
  readOnly,
  children,
}: {
  label: string
  htmlFor: string
  readOnly?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {readOnly ? (
        <span id={`${htmlFor}-l`} className="text-[13px] font-semibold text-ui-text">{label}</span>
      ) : (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ui-text">{label}</label>
      )}
      {children}
      {error ? (
        <span role="alert" className="text-xs text-ui-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ui-muted">{hint}</span>
      ) : null}
    </div>
  )
}
