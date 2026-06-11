'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Save,
  Pencil,
  X,
  User as UserIcon,
  Mail,
  Briefcase,
  Shield,
  Lock,
  KeyRound,
  Phone,
  MapPin,
  Building2,
  ChevronDown,
} from 'lucide-react'
import { getCountryDataList } from 'countries-list'

const COUNTRIES = getCountryDataList().map((c) => c.name).sort((a, b) => a.localeCompare(b))
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { getUser, getToken, setAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { PhoneField } from '@/components/ui/PhoneField'

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
}

function avatarUrl(name: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=4c1d6e&fontSize=42&radius=50`
}

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
      })
      .catch(() => {
        if (cancelled) return
        // silently keep cached values
      })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
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
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
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
        toast.success('Profile updated')
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

  function changePassword(e: FormEvent) {
    e.preventDefault()
    const errs = validatePw()
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return }
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

  const displayName = serverUser?.fullName ?? cached?.fullName ?? ''

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Profile"
        title="Admin"
        highlight="account"
        subtitle="Manage your administrator profile and security settings."
      />

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
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
              <img src={avatarUrl(displayName)} alt={displayName} className="w-full h-full object-cover" />
              <span className="absolute -bottom-0.5 right-3 w-4 h-4 rounded-full bg-emerald-400 ring-2 ring-brand-deep" />
            </div>
            <h3 className="mt-4 text-xl font-black">{displayName}</h3>
            <p className="text-sm text-white/70 capitalize">{serverUser?.role ?? cached?.role}</p>

            <div className="mt-5 flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-brand-primary-light" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary-light">
                Super admin
              </span>
            </div>
          </div>
        </motion.aside>

        {/* Personal details form */}
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="col-span-12 lg:col-span-8 rounded-2xl bg-white border border-brand-surface-2 p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
                {editing ? 'Editing details' : 'Personal details'}
              </p>
              <p className="text-xs text-brand-text-muted/80 mt-0.5">
                Update your administrator identity.
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
                />
              ) : (
                <p className="profile-readonly">{displayName}</p>
              )}
            </Field>
            <Field icon={<Mail className="w-3.5 h-3.5" />} label="Email">
              <p className="profile-readonly">{serverUser?.email ?? cached?.email}</p>
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
            <Field icon={<Briefcase className="w-3.5 h-3.5" />} label="Role">
              <p className="profile-readonly capitalize">{serverUser?.role ?? cached?.role}</p>
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
                placeholder="Tell us more about yourself."
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
        </motion.form>

        {/* Security */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-12 rounded-2xl bg-white border border-brand-surface-2 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-brand-text-primary">Security</p>
              <p className="text-[11px] text-brand-text-muted">Keep this account locked down.</p>
            </div>
          </div>

          <form onSubmit={changePassword} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field icon={<KeyRound className="w-3.5 h-3.5" />} label="Current" error={pwErrors.current}>
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
            <Field icon={<KeyRound className="w-3.5 h-3.5" />} label="Confirm" error={pwErrors.confirm}>
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
      </div>

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
    </AdminLayout>
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
