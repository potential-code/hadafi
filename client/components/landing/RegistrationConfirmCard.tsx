'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Loader2, Pencil, Sparkles } from 'lucide-react'

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Name',
  email: 'Email',
  password: 'Password',
  country: 'Country',
  couponCode: 'Invite Code',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationData {
  fullName?: string
  email?: string
  password?: string
  country?: string      // country code e.g. "NG"
  countryName?: string  // display name e.g. "Nigeria"
  couponCode?: string
}

interface RegistrationConfirmCardProps {
  data: RegistrationData
  respond: (value: ConfirmResponse) => void
  status: 'inProgress' | 'executing' | 'complete'
  completedAction?: { type: 'confirmed' } | { type: 'edit'; field: string } | null
}

type EditableField = 'fullName' | 'email' | 'password' | 'country' | 'couponCode'

type ConfirmResponse =
  | { action: 'confirmed' }
  | { action: 'edit'; field: EditableField }

// ---------------------------------------------------------------------------
// Flag emoji helper — converts a 2-letter ISO 3166-1 alpha-2 code to a flag
// emoji using Unicode Regional Indicator symbols (U+1F1E6–U+1F1FF).
// "NG" → 🇳🇬
// ---------------------------------------------------------------------------
function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/./gu, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="mx-4" style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
}

interface RowProps {
  label: string
  value: string
  field: EditableField
  disabled: boolean
  onEdit: (field: EditableField) => void
}

function DataRow({ label, value, field, disabled, onEdit }: RowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wider w-24 flex-shrink-0 text-[#e41674]/80">
        {label}
      </span>
      <span className="flex-1 text-sm font-medium truncate text-white/90">
        {value}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onEdit(field)}
        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#e41674]/60 hover:text-[#e41674] hover:bg-white/5"
        style={{ background: 'rgba(228,22,116,0.20)' }}
        aria-label={`Edit ${label}`}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RegistrationConfirmCard({
  data,
  respond,
  status,
  completedAction,
}: RegistrationConfirmCardProps) {
  const respondedRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  const isDisabled = status === 'complete' || respondedRef.current
  const showSpinner = respondedRef.current && status === 'executing'

  useEffect(() => {
    if (status === 'inProgress') {
      respondedRef.current = false
    }
  }, [status])

  function handleEdit(field: EditableField) {
    if (isDisabled || respondedRef.current) return
    respondedRef.current = true
    respond({ action: 'edit', field })
  }

  function handleConfirm() {
    if (isDisabled || respondedRef.current) return
    respondedRef.current = true
    respond({ action: 'confirmed' })
  }

  // Build the country display string
  const countryDisplay =
    data.countryName && data.country
      ? `${countryFlag(data.country)} ${data.countryName}`
      : data.countryName ?? data.country ?? ''

  return (
    <div
      className="my-2 rounded-xl overflow-hidden border"
      style={{ background: 'rgba(20, 10, 16, 0.90)', borderColor: 'rgba(255,255,255,0.10)', maxWidth: '380px' }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: 'linear-gradient(120deg,#e41674,#b50d5c)' }}
      >
        <Sparkles className="w-4 h-4 text-white/80 flex-shrink-0" />
        <span className="text-sm font-semibold text-white tracking-wide">
          ✦ Review Your Details
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Complete state                                                        */}
      {/* ------------------------------------------------------------------ */}
      {status === 'complete' ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10">
            {completedAction?.type === 'edit'
              ? <Pencil className="w-4 h-4 text-[#e41674]" strokeWidth={2.5} />
              : <Check className="w-4 h-4 text-[#e41674]" strokeWidth={2.5} />
            }
          </div>
          <span className="text-sm font-medium text-white/90">
            {completedAction?.type === 'edit'
              ? `Updating your ${FIELD_LABELS[completedAction.field] ?? completedAction.field}…`
              : 'Registration submitted!'
            }
          </span>
        </div>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* Data rows                                                        */}
          {/* -------------------------------------------------------------- */}

          {data.fullName !== undefined && (
            <>
              <DataRow
                label="Full Name"
                value={data.fullName}
                field="fullName"
                disabled={isDisabled}
                onEdit={handleEdit}
              />
              <Divider />
            </>
          )}

          {data.email !== undefined && (
            <>
              <DataRow
                label="Email"
                value={data.email}
                field="email"
                disabled={isDisabled}
                onEdit={handleEdit}
              />
              <Divider />
            </>
          )}

          {data.password !== undefined && (
            <>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider w-24 flex-shrink-0 text-[#e41674]/80">
                  Password
                </span>
                <span className="flex-1 text-sm font-medium truncate text-white/90">
                  {showPassword ? data.password : '••••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors text-[#e41674]/60 hover:text-[#e41674] hover:bg-white/5"
                  style={{ background: 'rgba(228,22,116,0.20)' }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword
                    ? <EyeOff className="w-3.5 h-3.5" />
                    : <Eye className="w-3.5 h-3.5" />
                  }
                </button>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleEdit('password')}
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#e41674]/60 hover:text-[#e41674] hover:bg-white/5"
                  style={{ background: 'rgba(228,22,116,0.20)' }}
                  aria-label="Edit Password"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <Divider />
            </>
          )}

          {countryDisplay && (
            <>
              <DataRow
                label="Country"
                value={countryDisplay}
                field="country"
                disabled={isDisabled}
                onEdit={handleEdit}
              />
              {data.couponCode !== undefined && <Divider />}
            </>
          )}

          {data.couponCode !== undefined && (
            <DataRow
              label="Invite Code"
              value={data.couponCode}
              field="couponCode"
              disabled={isDisabled}
              onEdit={handleEdit}
            />
          )}

          {/* -------------------------------------------------------------- */}
          {/* Footer                                                           */}
          {/* -------------------------------------------------------------- */}
          <div className="px-4 pb-4 pt-3 space-y-3">
            <p className="text-xs text-center leading-relaxed text-white/35">
              By clicking Confirm &amp; Register you agree to our Terms &amp; Conditions
            </p>

            <button
              type="button"
              disabled={isDisabled}
              onClick={handleConfirm}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(120deg,#e41674,#b50d5c)' }}
            >
              {showSpinner ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering…</span>
                </>
              ) : (
                'Confirm & Register'
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
