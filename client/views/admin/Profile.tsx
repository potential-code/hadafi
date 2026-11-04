'use client'

import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import {
  Briefcase,
  Building2,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Avatar, btn, inputClass, PageHeader } from '@/components/kit'
import { fmtDate, Pill, selectClass } from '@/components/admin/ui'
import { changePassword as updatePassword, getUser, renameCachedUser, setFirstPassword } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { PhoneField } from '@/components/ui/PhoneField'
import { cn } from '@/lib/utils'

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
  avatarUrl: string | null
  timezone?: string | null
  createdAt?: string
  hasPassword?: boolean
}

type ApiErr = { error?: { message?: string; code?: string; errors?: Record<string, string[]> } }

/** The signed-in admin's own profile and password. */
export default function AdminProfilePage() {
  const cached = getUser()

  const [serverUser, setServerUser] = useState<MeUser | null>(null)
  const [form, setForm] = useState({
    fullName: cached?.fullName ?? '',
    phone: '',
    bio: '',
    company: '',
    country: cached?.country ?? '',
  })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})


  useEffect(() => {
    let cancelled = false
    apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/account/me')
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
      })
      .catch(() => {
        // keep the cached values
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
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
    apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/account/me', {
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
        renameCachedUser(data.user.fullName)
        setEditing(false)
        toast.success('Profile updated')
      })
      .catch((err: ApiErr) => {
        if (err?.error?.code === 'VALIDATION_ERROR' && err.error.errors) {
          const mapped: Record<string, string> = {}
          for (const [k, msgs] of Object.entries(err.error.errors)) mapped[k] = msgs[0] ?? ''
          setErrors(mapped)
        } else {
          toast.error(err?.error?.message ?? 'Failed to save changes')
        }
      })
      .finally(() => setSaving(false))
  }

  function cancelEdit() {
    if (serverUser) {
      setForm({
        fullName: serverUser.fullName,
        phone: serverUser.phone ?? '',
        bio: serverUser.bio ?? '',
        company: serverUser.company ?? '',
        country: serverUser.country ?? '',
      })
    }
    setErrors({})
    setEditing(false)
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

  function changePassword(e: FormEvent) {
    e.preventDefault()
    const errs = validatePw()
    if (Object.keys(errs).length > 0) {
      setPwErrors(errs)
      return
    }
    setPwSaving(true)
    ;(firstPassword ? setFirstPassword(pwForm.next) : updatePassword(pwForm.current, pwForm.next))
      .then(() => {
        setPwForm({ current: '', next: '', confirm: '' })
        setPwErrors({})
        if (firstPassword) setServerUser((p) => (p ? { ...p, hasPassword: true } : p))
        toast.success(firstPassword ? 'Password set' : 'Password updated')
      })
      .catch((err: ApiErr) => {
        if (err?.error?.code === 'INVALID_PASSWORD') {
          setPwErrors({ current: 'Current password is incorrect' })
        } else if (err?.error?.code === 'VALIDATION_ERROR' && err.error.errors) {
          const mapped: Record<string, string> = {}
          for (const [k, msgs] of Object.entries(err.error.errors)) mapped[k] = msgs[0] ?? ''
          setPwErrors(mapped)
        } else {
          toast.error(err?.error?.message ?? 'Failed to update password')
        }
      })
      .finally(() => setPwSaving(false))
  }

  const displayName = serverUser?.fullName ?? cached?.fullName ?? ''
  const email = serverUser?.email ?? cached?.email ?? ''
  const role = serverUser?.role ?? cached?.role ?? ''

  return (
    <AdminLayout>
      <PageHeader
        className="mb-5 max-md:flex-col max-md:items-start"
        title="Profile"
        subtitle="Manage your administrator profile and security settings."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Identity card */}
        <aside className="rounded-[14px] border border-ui-line bg-ui-surface p-6 text-center">
          <Avatar name={displayName || 'Admin'} src={serverUser?.avatarUrl} size={88} className="mx-auto text-[28px]" />
          <h2 className="mt-4 break-words text-lg font-semibold text-ui-text">{displayName}</h2>
          <p className="mt-0.5 break-all text-sm text-ui-muted">{email}</p>
          <Pill tone="brand" className="mt-3">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Administrator
          </Pill>
          <dl className="mt-5 space-y-2 border-t border-ui-line pt-4 text-left text-[13px]">
            <InfoRow label="Role" value={<span className="capitalize">{role}</span>} />
            {serverUser?.createdAt && <InfoRow label="Member since" value={fmtDate(serverUser.createdAt)} />}
            {serverUser?.timezone && <InfoRow label="Time zone" value={serverUser.timezone} />}
          </dl>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Details */}
          <form onSubmit={onSubmit} className="rounded-[14px] border border-ui-line bg-ui-surface" aria-labelledby="h-details">
            <div className="flex items-start justify-between gap-3 border-b border-ui-line px-5 py-4">
              <div>
                <h2 id="h-details" className="text-base font-semibold text-ui-text">
                  {editing ? 'Editing details' : 'Personal details'}
                </h2>
                <p className="mt-0.5 text-[13px] text-ui-muted">Name, contact and bio shown to other admins.</p>
              </div>
              {!editing && (
                <button type="button" onClick={() => setEditing(true)} className={btn({ variant: 'secondary', size: 'sm' })}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Edit profile
                </button>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 py-5 sm:grid-cols-2">
              <FormRow id="p-name" icon={UserIcon} label="Full name" error={errors.fullName}>
                {editing ? (
                  <input
                    id="p-name"
                    value={form.fullName}
                    onChange={(e) => update('fullName', e.target.value)}
                    aria-invalid={!!errors.fullName}
                    className={cn(inputClass, errors.fullName && 'border-ui-danger')}
                  />
                ) : (
                  <ReadValue>{displayName}</ReadValue>
                )}
              </FormRow>
              <FormRow id="p-email" icon={Mail} label="Email">
                {editing ? <input id="p-email" value={email} readOnly className={cn(inputClass, 'bg-ui-surface-2 text-ui-muted')} /> : <ReadValue>{email}</ReadValue>}
              </FormRow>
              <FormRow id="p-phone" icon={Phone} label="Phone" error={errors.phone}>
                {editing ? (
                  <PhoneField
                    value={form.phone}
                    onChange={(v) => update('phone', v)}
                    hasError={!!errors.phone}
                    placeholder="Add a phone number"
                    className="h-10 rounded-[10px] border-ui-line bg-ui-surface focus-within:border-ui-brand focus-within:ring-ui-brand/20 [&>div]:border-ui-line [&_input]:text-ui-text [&_input]:placeholder:text-ui-muted [&_select]:text-ui-text [&_svg]:text-ui-muted"
                  />
                ) : (
                  <ReadValue empty={!serverUser?.phone}>{serverUser?.phone || 'Not added'}</ReadValue>
                )}
              </FormRow>
              <FormRow id="p-country" icon={MapPin} label="Country">
                {editing ? (
                  <select
                    id="p-country"
                    value={form.country}
                    onChange={(e) => update('country', e.target.value)}
                    className={cn(selectClass, 'h-10 w-full text-sm font-normal')}
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <ReadValue empty={!serverUser?.country}>{serverUser?.country || 'Not set'}</ReadValue>
                )}
              </FormRow>
              <FormRow id="p-company" icon={Building2} label="Company" error={errors.company}>
                {editing ? (
                  <input
                    id="p-company"
                    value={form.company}
                    onChange={(e) => update('company', e.target.value)}
                    placeholder="Add a company"
                    className={inputClass}
                  />
                ) : (
                  <ReadValue empty={!serverUser?.company}>{serverUser?.company || 'Not added'}</ReadValue>
                )}
              </FormRow>
              <FormRow id="p-role" icon={Briefcase} label="Role">
                {editing ? (
                  <input id="p-role" value={role} readOnly className={cn(inputClass, 'bg-ui-surface-2 capitalize text-ui-muted')} />
                ) : (
                  <ReadValue>
                    <span className="capitalize">{role}</span>
                  </ReadValue>
                )}
              </FormRow>
              <FormRow id="p-bio" label="Bio" error={errors.bio} className="sm:col-span-2">
                {editing ? (
                  <textarea
                    id="p-bio"
                    value={form.bio}
                    onChange={(e) => update('bio', e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Tell us more about yourself."
                    className={cn(inputClass, 'h-auto resize-y py-2.5 leading-normal')}
                  />
                ) : (
                  <ReadValue empty={!serverUser?.bio} className="whitespace-pre-line">
                    {serverUser?.bio || 'No bio yet'}
                  </ReadValue>
                )}
              </FormRow>
            </div>

            {editing && (
              <div className="flex justify-end gap-2 border-t border-ui-line px-5 py-3">
                <button type="button" onClick={cancelEdit} className={btn({ variant: 'secondary' })}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className={btn()}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {saving ? 'Saving' : 'Save changes'}
                </button>
              </div>
            )}
          </form>

          {/* Security */}
          <form onSubmit={changePassword} className="rounded-[14px] border border-ui-line bg-ui-surface" aria-labelledby="h-security">
            <div className="border-b border-ui-line px-5 py-4">
              <h2 id="h-security" className="text-base font-semibold text-ui-text">Security</h2>
              <p className="mt-0.5 text-[13px] text-ui-muted">
                {firstPassword
                  ? 'You sign in with a code sent to your email. Add a password if you also want to sign in with one.'
                  : 'Keep this account locked down.'}
              </p>
            </div>
            <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-4 px-5 py-5', firstPassword ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
              {!firstPassword && (
                <FormRow id="pw-current" icon={KeyRound} label="Current password" error={pwErrors.current}>
                  <input
                    id="pw-current"
                    type="password"
                    autoComplete="current-password"
                    value={pwForm.current}
                    onChange={(e) => {
                      setPwForm((p) => ({ ...p, current: e.target.value }))
                      setPwErrors((e2) => ({ ...e2, current: '' }))
                    }}
                    aria-invalid={!!pwErrors.current}
                    className={cn(inputClass, pwErrors.current && 'border-ui-danger')}
                  />
                </FormRow>
              )}
              <FormRow id="pw-next" icon={KeyRound} label={firstPassword ? 'Password' : 'New password'} error={pwErrors.next}>
                <input
                  id="pw-next"
                  type="password"
                  autoComplete="new-password"
                  value={pwForm.next}
                  onChange={(e) => {
                    setPwForm((p) => ({ ...p, next: e.target.value }))
                    setPwErrors((e2) => ({ ...e2, next: '' }))
                  }}
                  aria-invalid={!!pwErrors.next}
                  className={cn(inputClass, pwErrors.next && 'border-ui-danger')}
                />
              </FormRow>
              <FormRow id="pw-confirm" icon={KeyRound} label="Confirm" error={pwErrors.confirm}>
                <input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={pwForm.confirm}
                  onChange={(e) => {
                    setPwForm((p) => ({ ...p, confirm: e.target.value }))
                    setPwErrors((e2) => ({ ...e2, confirm: '' }))
                  }}
                  aria-invalid={!!pwErrors.confirm}
                  className={cn(inputClass, pwErrors.confirm && 'border-ui-danger')}
                />
              </FormRow>
            </div>
            <div className="flex justify-end border-t border-ui-line px-5 py-3">
              <button type="submit" disabled={pwSaving} className={btn({ variant: 'secondary' })}>
                {pwSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {pwSaving ? 'Saving' : firstPassword ? 'Set password' : 'Update password'}
              </button>
            </div>
          </form>

        </div>
      </div>

    </AdminLayout>
  )
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ui-muted">{label}</dt>
      <dd className="text-right text-ui-text">{value}</dd>
    </div>
  )
}

function FormRow({
  id,
  label,
  icon: Icon,
  error,
  children,
  className,
}: {
  id: string
  label: string
  icon?: typeof UserIcon
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-semibold text-ui-text">
        {Icon && <Icon className="h-3.5 w-3.5 text-ui-muted" strokeWidth={1.75} aria-hidden />}
        {label}
      </label>
      {children}
      {error && (
        <p className="text-[13px] text-ui-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function ReadValue({ children, empty, className }: { children: ReactNode; empty?: boolean; className?: string }) {
  return (
    <p className={cn('min-h-10 break-words rounded-[10px] bg-ui-bg px-3 py-2.5 text-sm', empty ? 'text-ui-muted' : 'text-ui-text', className)}>
      {children}
    </p>
  )
}
