'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ArrowLeft, Check, Info, CheckCircle2, Loader2, ChevronDown } from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { cn } from '@/lib/utils'
import { btn, inputClass } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { PhoneField } from '@/components/ui/PhoneField'
import type { StakeholderKind } from '@/lib/constants/content'
import { LEGAL_LINKS } from './legal'

const COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

const TITLE: Record<StakeholderKind, string> = {
  expert: 'Join as an Expert',
  vc: 'Join as a Supporter',
  government: 'Join as a Government',
  corporate: 'Join as a Corporate',
  university: 'Join as a University',
  incubator: 'Join as an Incubator',
}

const EXPERTISE_AREAS = [
  'Digital Marketing and Social Media',
  'Enterprise Selling',
  'Leadership and Team Building',
  'Strategy',
  'Finance and Accounting',
  'Project Management',
  'HR and L&D',
  'CSR and Corporate Affairs',
  'Marketing',
  'Team Building',
  'Others',
]

const SHARING_METHODS = [
  '1 on 1 Coaching or Consulting',
  'Workshop up to 20 people',
  'Reporting, Content, Planning',
  'Public Speaking Events',
]

const VC_REPRESENTING = [
  'Angel Network, Venture Capital or Private Equity',
  'Bank or Financing Firm',
  'Corporate with solutions for women entrepreneurs',
  'Corporate interested in supporting women entrepreneurs',
  'An entity that is interested in the research from the program',
]

const VC_INVOLVEMENT = [
  "Advertise on the program's platform",
  'Attract leads to specific products or services',
  'Invest in or finance women-led businesses',
  'Support the program',
  'An entity that is interested in the research from the program',
]

const GOV_REPRESENTING = ['Ministry', 'Chamber', 'Incubator', 'Co-working space', 'Accelerator', 'NGO']

const GOV_INVOLVEMENT = [
  'Extend the program to my community',
  'Get a custom white labeled local version of the program',
]

type ExpertForm = {
  name: string
  email: string
  linkedin: string
  hourlyRate: string
  expertise: string[]
  methods: string[]
  passion: string
}

type OrgForm = {
  fullName: string
  title: string
  email: string
  country: string
  website: string
  phone: string
  representing: string
  involvement: string[]
}

const isOrgKind = (k: StakeholderKind) => k !== 'expert'
const isGovStyle = (k: StakeholderKind) => k === 'government' || k === 'incubator'

export function StakeholderRegisterDialog({
  kind,
  open,
  onClose,
}: {
  kind: StakeholderKind | null
  open: boolean
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && kind && <DialogInner kind={kind} onClose={onClose} />}
    </AnimatePresence>
  )
}

function DialogInner({ kind, onClose }: { kind: StakeholderKind; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = `stakeholder-${kind}-title`

  const [tab, setTab] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedName, setSubmittedName] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [expertErrors, setExpertErrors] = useState<Record<string, string>>({})
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const [expert, setExpert] = useState<ExpertForm>({
    name: '',
    email: '',
    linkedin: '',
    hourlyRate: '',
    expertise: [],
    methods: [],
    passion: '',
  })
  const [org, setOrg] = useState<OrgForm>({
    fullName: '',
    title: '',
    email: '',
    country: '',
    website: '',
    phone: '',
    representing: '',
    involvement: [],
  })

  // Esc + focus trap + lock scroll
  useEffect(() => {
    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
    closeBtnRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  function toggleArr(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  }

  async function submitExpert(e: React.FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setFormError(null)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/
    const errs: Record<string, string> = {}
    if (!expert.name.trim()) errs.name = 'Please enter your name'
    if (!expert.email.trim()) {
      errs.email = 'Please enter your email'
    } else if (!emailRegex.test(expert.email.trim())) {
      errs.email = 'Please enter a valid email address'
    }
    if (!expert.linkedin.trim()) {
      errs.linkedin = 'Please enter your LinkedIn profile URL'
    } else if (!/^https?:\/\/.+/.test(expert.linkedin.trim())) {
      errs.linkedin = 'Please enter a valid URL (e.g. https://linkedin.com/in/you)'
    }
    if (!expert.hourlyRate) errs.hourlyRate = 'Please enter your hourly rate'
    if (expert.expertise.length === 0) errs.expertise = 'Please select at least one area of expertise'
    if (expert.methods.length === 0) errs.methods = 'Please select at least one method'
    if (!expert.passion.trim()) errs.passion = 'Please share your passion and mission'

    if (Object.keys(errs).length > 0) {
      setExpertErrors(errs)
      return
    }
    setExpertErrors({})

    setLoading(true)
    try {
      await apiFetch('/api/stakeholders/expert', {
        method: 'POST',
        body: JSON.stringify({
          name: expert.name,
          email: expert.email,
          linkedin: expert.linkedin,
          hourlyRate: parseInt(expert.hourlyRate, 10),
          expertise: expert.expertise,
          methods: expert.methods,
          passion: expert.passion,
        }),
      })
      setSubmittedName(expert.name)
      setSubmittedEmail(expert.email)
      setSubmitted(true)
    } catch (err: unknown) {
      const body = err as { error?: { code?: string; message?: string; errors?: Record<string, string[]> } }
      const code = body?.error?.code
      if (code === 'EXPERT_EMAIL_EXISTS') {
        setEmailError('An expert with this email is already registered')
      } else if (code === 'VALIDATION_ERROR') {
        const fieldErrs = body?.error?.errors ?? {}
        const newErrs: Record<string, string> = {}
        if (fieldErrs.email?.length) setEmailError(fieldErrs.email[0])
        if (fieldErrs.linkedin?.length) newErrs.linkedin = fieldErrs.linkedin[0]
        if (fieldErrs.name?.length) newErrs.name = fieldErrs.name[0]
        if (fieldErrs.hourlyRate?.length) newErrs.hourlyRate = fieldErrs.hourlyRate[0]
        if (fieldErrs.expertise?.length) newErrs.expertise = fieldErrs.expertise[0]
        if (fieldErrs.methods?.length) newErrs.methods = fieldErrs.methods[0]
        if (fieldErrs.passion?.length) newErrs.passion = fieldErrs.passion[0]
        if (Object.keys(newErrs).length > 0) setExpertErrors(newErrs)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function nextTab() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/
    const errs: Record<string, string> = {}
    if (!org.fullName.trim()) errs.fullName = 'Please enter your full name'
    if (!org.title.trim()) errs.title = 'Please enter your title'
    if (!org.email.trim()) {
      errs.email = 'Please enter your email'
    } else if (!emailRegex.test(org.email.trim())) {
      errs.email = 'Please enter a valid email address'
    }
    if (!org.country.trim()) errs.country = 'Please enter your country'
    if (!org.website.trim()) {
      errs.website = 'Please enter your website'
    } else if (!/^https?:\/\/.+/.test(org.website.trim())) {
      errs.website = 'Please enter a valid URL (e.g. https://yourorg.com)'
    }
    // PhoneField always emits at least the dial code — only the local number can be missing
    if (!org.phone.trim() || !/\s\d/.test(org.phone)) errs.phone = 'Please enter your phone number'

    if (Object.keys(errs).length > 0) {
      setOrgErrors(errs)
      return
    }
    setOrgErrors({})
    setTab(2)
  }

  async function submitOrg(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!org.representing || org.involvement.length === 0) {
      setFormError('Please answer both questions.')
      return
    }

    setLoading(true)
    try {
      await apiFetch('/api/stakeholders/organisation', {
        method: 'POST',
        body: JSON.stringify({
          type: kind,
          fullName: org.fullName,
          title: org.title,
          email: org.email,
          country: org.country,
          website: org.website,
          phone: org.phone,
          representing: org.representing,
          involvement: org.involvement,
        }),
      })
      setSubmittedName(org.fullName)
      setSubmitted(true)
    } catch (err: unknown) {
      const body = err as { error?: { code?: string; errors?: Record<string, string[]> } }
      const code = body?.error?.code
      if (code === 'VALIDATION_ERROR') {
        const fe = body?.error?.errors ?? {}
        const mapped: Record<string, string> = {}
        if (fe.fullName?.[0]) mapped.fullName = fe.fullName[0]
        if (fe.title?.[0]) mapped.title = fe.title[0]
        if (fe.email?.[0]) mapped.email = fe.email[0]
        if (fe.country?.[0]) mapped.country = fe.country[0]
        if (fe.website?.[0]) mapped.website = fe.website[0]
        if (fe.phone?.[0]) mapped.phone = fe.phone[0]
        if (fe.representing?.[0]) mapped.representing = fe.representing[0]
        if (Object.keys(mapped).length > 0) {
          setOrgErrors(mapped)
        } else {
          setFormError('Please check your details. Some fields are invalid.')
        }
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text shadow-ui"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative border-b border-ui-line px-6 py-5">
          <h2 id={titleId} className="pr-10 text-xl font-semibold tracking-[-0.01em] text-ui-text">
            {submitted ? 'Application received' : TITLE[kind]}
          </h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {!submitted && isOrgKind(kind) && (
            <div className="mt-4 flex items-center gap-2 text-xs">
              <Step n={1} label="Personal details" active={tab === 1} done={tab > 1} />
              <span className="h-px flex-1 bg-ui-line" />
              <Step n={2} label="Extra information" active={tab === 2} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {formError && !submitted && (
            <p role="alert" className="mb-4 rounded-[10px] border border-ui-danger/30 bg-ui-danger-soft px-3 py-2.5 text-[13px] text-ui-danger">
              {formError}
            </p>
          )}
          {/* ---------- Thank-you states ---------- */}
          {submitted ? (
            kind === 'expert' ? (
              <ExpertThankYou name={submittedName} email={submittedEmail} onClose={onClose} />
            ) : (
              <OrgThankYou name={submittedName} onClose={onClose} />
            )
          ) : kind === 'expert' ? (
            /* ---------- Expert form ---------- */
            <form onSubmit={submitExpert} className="space-y-5">
              <SectionHeading
                title="Tell us a bit about you"
                hint="All fields marked * are required."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name" required>
                  <div>
                    <input
                      value={expert.name}
                      onChange={(e) => { setExpert({ ...expert, name: e.target.value }); setExpertErrors(p => ({...p, name: ''})) }}
                      placeholder="Your name"
                      className={inputClass}
                      disabled={loading}
                    />
                    {expertErrors.name && <p className="mt-1 text-xs text-ui-danger">{expertErrors.name}</p>}
                  </div>
                </Field>
                <Field label="Email" required>
                  <div>
                    <input
                      type="email"
                      value={expert.email}
                      onChange={(e) => { setExpert({ ...expert, email: e.target.value }); setEmailError(null); setExpertErrors(p => ({...p, email: ''})) }}
                      placeholder="you@company.com"
                      className={inputClass}
                      disabled={loading}
                    />
                    {(emailError || expertErrors.email) && (
                      <p className="mt-1 text-xs text-ui-danger">{emailError || expertErrors.email}</p>
                    )}
                  </div>
                </Field>
                <Field label="LinkedIn profile URL" required>
                  <div>
                    <input
                      value={expert.linkedin}
                      onChange={(e) => { setExpert({ ...expert, linkedin: e.target.value }); setExpertErrors(p => ({...p, linkedin: ''})) }}
                      placeholder="https://linkedin.com/in/…"
                      className={inputClass}
                      disabled={loading}
                    />
                    {expertErrors.linkedin && <p className="mt-1 text-xs text-ui-danger">{expertErrors.linkedin}</p>}
                  </div>
                </Field>
                <Field label="Hourly rate (USD)" required>
                  <div>
                    <input
                      type="number"
                      min={0}
                      value={expert.hourlyRate}
                      onChange={(e) => { setExpert({ ...expert, hourlyRate: e.target.value }); setExpertErrors(p => ({...p, hourlyRate: ''})) }}
                      placeholder="e.g. 120"
                      className={inputClass}
                      disabled={loading}
                    />
                    {expertErrors.hourlyRate && <p className="mt-1 text-xs text-ui-danger">{expertErrors.hourlyRate}</p>}
                  </div>
                </Field>
              </div>

              <div>
                <CheckboxGroup
                  label="Areas of expertise (check all that apply)"
                  required
                  options={EXPERTISE_AREAS}
                  values={expert.expertise}
                  onChange={(v) => { setExpert({ ...expert, expertise: toggleArr(expert.expertise, v) }); setExpertErrors(p => ({...p, expertise: ''})) }}
                  disabled={loading}
                />
                {expertErrors.expertise && <p className="mt-1 text-xs text-ui-danger">{expertErrors.expertise}</p>}
              </div>

              <div>
                <CheckboxGroup
                  label="Your preferred method of sharing your expertise (check all that apply)"
                  required
                  options={SHARING_METHODS}
                  values={expert.methods}
                  onChange={(v) => { setExpert({ ...expert, methods: toggleArr(expert.methods, v) }); setExpertErrors(p => ({...p, methods: ''})) }}
                  disabled={loading}
                />
                {expertErrors.methods && <p className="mt-1 text-xs text-ui-danger">{expertErrors.methods}</p>}
              </div>

              <Field
                label="Share your expertise to help others, driven by your passion."
                required
              >
                <div>
                  <textarea
                    rows={4}
                    value={expert.passion}
                    onChange={(e) => { setExpert({ ...expert, passion: e.target.value }); setExpertErrors(p => ({...p, passion: ''})) }}
                    placeholder="What expertise will you share, and what drives you?"
                    className={cn(inputClass, 'h-auto resize-none py-2')}
                    disabled={loading}
                  />
                  {expertErrors.passion && <p className="mt-1 text-xs text-ui-danger">{expertErrors.passion}</p>}
                </div>
              </Field>

              <p className="rounded-[10px] bg-ui-surface-2 p-3 text-xs leading-relaxed text-ui-muted">
                By clicking submit, you allow us to post your photo, your expertise and LinkedIn
                profile on our site. When an opportunity arises, we will get in touch with you to
                jointly assess the prospect and see if it is a good fit. We will not commit your
                services to any particular project unless we have your written confirmation.
              </p>

              {/* What happens next — info panel shown before submit */}
              <div className="flex gap-3 rounded-[10px] border border-ui-line p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-ui-muted" aria-hidden />
                <div>
                  <p className="mb-2 text-sm font-semibold text-ui-text">What happens after you apply?</p>
                  <ol className="space-y-1.5 text-[13px] text-ui-muted">
                    <li className="flex items-start gap-2">
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-[10px] font-semibold text-ui-brand-text">1</span>
                      Our team will review your application.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-[10px] font-semibold text-ui-brand-text">2</span>
                      Once approved, you'll receive an email with a link to set your password.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-[10px] font-semibold text-ui-brand-text">3</span>
                      Log in and access your mentor dashboard.
                    </li>
                  </ol>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-ui-muted">
                By submitting, you agree to Potential&rsquo;s{' '}
                <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">Terms of Use</a>{' '}
                and{' '}
                <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">Privacy Policy</a>.
                We use your details only to review and follow up on this application.
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className={btn({ variant: 'secondary' })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={btn()}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  ) : (
                    'Submit'
                  )}
                </button>
              </DialogFooter>
            </form>
          ) : tab === 1 ? (
            /* ---------- Org tab 1 ---------- */
            <form
              onSubmit={(e) => { e.preventDefault(); nextTab() }}
              className="space-y-5"
            >
              <SectionHeading title="Personal details" hint="All fields marked * are required." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full name (first and last)" required>
                  <div>
                    <input
                      value={org.fullName}
                      onChange={(e) => { setOrg({ ...org, fullName: e.target.value }); setOrgErrors(p => ({...p, fullName: ''})) }}
                      className={inputClass}
                      disabled={loading}
                    />
                    {orgErrors.fullName && <p className="mt-1 text-xs text-ui-danger">{orgErrors.fullName}</p>}
                  </div>
                </Field>
                <Field label="Title" required>
                  <div>
                    <input
                      value={org.title}
                      onChange={(e) => { setOrg({ ...org, title: e.target.value }); setOrgErrors(p => ({...p, title: ''})) }}
                      className={inputClass}
                      disabled={loading}
                    />
                    {orgErrors.title && <p className="mt-1 text-xs text-ui-danger">{orgErrors.title}</p>}
                  </div>
                </Field>
                <Field
                  label={kind === 'government' || kind === 'incubator' ? 'Email address' : 'Corporate email address'}
                  required
                >
                  <div>
                    <input
                      type="email"
                      value={org.email}
                      onChange={(e) => { setOrg({ ...org, email: e.target.value }); setOrgErrors(p => ({...p, email: ''})) }}
                      className={inputClass}
                      disabled={loading}
                    />
                    {orgErrors.email && <p className="mt-1 text-xs text-ui-danger">{orgErrors.email}</p>}
                  </div>
                </Field>
                <Field label="Operating country" required>
                  <div>
                    <div className="relative">
                      <select
                        value={org.country}
                        onChange={(e) => { setOrg({ ...org, country: e.target.value }); setOrgErrors(p => ({...p, country: ''})) }}
                        className={cn(inputClass, 'cursor-pointer appearance-none pr-8')}
                        disabled={loading}
                      >
                        <option value="">Select country</option>
                        {COUNTRIES.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none h-4 w-4 text-ui-muted" />
                    </div>
                    {orgErrors.country && <p className="mt-1 text-xs text-ui-danger">{orgErrors.country}</p>}
                  </div>
                </Field>
                <Field label="Organization website" required>
                  <div>
                    <input
                      value={org.website}
                      onChange={(e) => { setOrg({ ...org, website: e.target.value }); setOrgErrors(p => ({...p, website: ''})) }}
                      placeholder="https://…"
                      className={inputClass}
                      disabled={loading}
                    />
                    {orgErrors.website && <p className="mt-1 text-xs text-ui-danger">{orgErrors.website}</p>}
                  </div>
                </Field>
                <Field label="Phone number" required>
                  <div>
                    <PhoneField
                      value={org.phone}
                      onChange={(v) => { setOrg({ ...org, phone: v }); setOrgErrors(p => ({...p, phone: ''})) }}
                      disabled={loading}
                      hasError={!!orgErrors.phone}
                    />
                    {orgErrors.phone && <p className="mt-1 text-xs text-ui-danger">{orgErrors.phone}</p>}
                  </div>
                </Field>
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={onClose}
                  className={btn({ variant: 'secondary' })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={btn()}
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              </DialogFooter>
            </form>
          ) : (
            /* ---------- Org tab 2 ---------- */
            <form onSubmit={submitOrg} className="space-y-5">
              <SectionHeading title="Extra information" hint="All fields marked * are required." />

              <RadioGroup
                label="Are you representing a:"
                required
                options={isGovStyle(kind) ? GOV_REPRESENTING : VC_REPRESENTING}
                value={org.representing}
                onChange={(v) => setOrg({ ...org, representing: v })}
                disabled={loading}
              />

              <CheckboxGroup
                label="How would you be involved? (Check all that apply)"
                required
                options={isGovStyle(kind) ? GOV_INVOLVEMENT : VC_INVOLVEMENT}
                values={org.involvement}
                onChange={(v) => setOrg({ ...org, involvement: toggleArr(org.involvement, v) })}
                disabled={loading}
              />

              <p className="text-xs leading-relaxed text-ui-muted">
                By submitting, you agree to Potential&rsquo;s{' '}
                <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">Terms of Use</a>{' '}
                and{' '}
                <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">Privacy Policy</a>.
                We use your details only to review and follow up on this application.
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setTab(1)}
                  disabled={loading}
                  className={btn({ variant: 'secondary' })}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={btn()}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  ) : (
                    'Submit'
                  )}
                </button>
              </DialogFooter>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Thank-you states
// ---------------------------------------------------------------------------

function ExpertThankYou({ name, email, onClose }: { name: string; email: string; onClose: () => void }) {
  const firstName = name.split(' ')[0]
  return (
    <div className="flex flex-col items-center text-center py-4">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ui-ok-soft">
        <CheckCircle2 className="h-7 w-7 text-ui-ok" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-ui-text">Application received</h3>
      <p className="max-w-sm text-sm text-ui-muted">
        Thank you, <span className="font-semibold text-ui-text">{firstName}</span>. Your application has been successfully submitted.
      </p>

      <div className="mt-6 w-full border-t border-ui-line pt-5 text-left">
        <p className="text-sm font-semibold text-ui-text mb-3">What's next?</p>
        <ol className="space-y-3">
          <li className="flex items-start gap-3 text-sm text-ui-muted">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-[11px] font-semibold text-ui-brand-text">1</span>
            Our team will review your application.
          </li>
          <li className="flex items-start gap-3 text-sm text-ui-muted">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-[11px] font-semibold text-ui-brand-text">2</span>
            If approved, you'll receive an email at{' '}
            <span className="mx-1 font-medium text-ui-text">{email}</span>{' '}
            with a link to set your password and access your mentor dashboard.
          </li>
        </ol>
      </div>

      <button
        onClick={onClose}
        className={cn(btn(), 'mt-6')}
      >
        Close
      </button>
    </div>
  )
}

function OrgThankYou({ name, onClose }: { name: string; onClose: () => void }) {
  const firstName = name.split(' ')[0]
  return (
    <div className="flex flex-col items-center text-center py-4">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ui-ok-soft">
        <CheckCircle2 className="h-7 w-7 text-ui-ok" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-ui-text">Application received</h3>
      <p className="max-w-sm text-sm text-ui-muted">
        Thank you, <span className="font-semibold text-ui-text">{firstName}</span>. Your application has been successfully submitted.
      </p>
      <button
        onClick={onClose}
        className={cn(btn(), 'mt-6')}
      >
        Close
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold',
          done
            ? 'bg-ui-ok text-white'
            : active
              ? 'bg-ui-brand text-white'
              : 'bg-ui-surface-2 text-ui-muted',
        )}
      >
        {done ? <Check className="w-3 h-3" /> : n}
      </span>
      <span
        className={cn(
          'text-[13px] font-semibold',
          active ? 'text-ui-text' : 'text-ui-muted',
        )}
      >
        {label}
      </span>
    </div>
  )
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-ui-text">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ui-muted">{hint}</p>}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ui-text">
        {label}
        {required && <span className="ml-0.5 text-ui-brand-text">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function CheckboxGroup({
  label,
  options,
  values,
  onChange,
  required,
  disabled,
}: {
  label: string
  options: readonly string[]
  values: string[]
  onChange: (v: string) => void
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-ui-text">
        {label}
        {required && <span className="ml-0.5 text-ui-brand-text">*</span>}
      </p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const checked = values.includes(opt)
          return (
            <label
              key={opt}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-[10px] border px-3 py-2 text-sm transition-colors',
                disabled && 'opacity-60 cursor-not-allowed',
                checked
                  ? 'border-ui-brand bg-ui-brand-soft text-ui-text'
                  : 'border-ui-line bg-ui-surface text-ui-text hover:border-ui-brand/40',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => !disabled && onChange(opt)}
                className="mt-0.5 accent-ui-brand"
                disabled={disabled}
              />
              <span className="leading-tight">{opt}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function RadioGroup({
  label,
  options,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-ui-text">
        {label}
        {required && <span className="ml-0.5 text-ui-brand-text">*</span>}
      </p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const checked = value === opt
          return (
            <label
              key={opt}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-[10px] border px-3 py-2 text-sm transition-colors',
                disabled && 'opacity-60 cursor-not-allowed',
                checked
                  ? 'border-ui-brand bg-ui-brand-soft text-ui-text'
                  : 'border-ui-line bg-ui-surface text-ui-text hover:border-ui-brand/40',
              )}
            >
              <input
                type="radio"
                checked={checked}
                onChange={() => !disabled && onChange(opt)}
                className="mt-0.5 accent-ui-brand"
                disabled={disabled}
              />
              <span className="leading-tight">{opt}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-end gap-2 border-t border-ui-line pt-4">
      {children}
    </div>
  )
}
