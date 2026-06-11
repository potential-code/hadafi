'use client'

import { useMemo } from 'react'
import { getCountryDataList, getEmojiFlag } from 'countries-list'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Country data — built once at module level, never re-computed
// ---------------------------------------------------------------------------

const COUNTRIES = getCountryDataList()
  .filter((c) => c.phone.length > 0)
  .map((c) => ({
    iso2: c.iso2,
    name: c.name,
    dialCode: `+${c.phone[0]}`,
    emoji: getEmojiFlag(c.iso2),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

// First country per dial code — used to reverse-lookup iso2 when parsing a stored value
const DIAL_TO_ISO2 = new Map<string, string>()
for (const c of COUNTRIES) {
  if (!DIAL_TO_ISO2.has(c.dialCode)) DIAL_TO_ISO2.set(c.dialCode, c.iso2)
}

const DEFAULT_ISO2 = 'US'
const DEFAULT_DIAL = '+1'

// ---------------------------------------------------------------------------
// Parse a stored value like "+44 7911123456" → { iso2, dialCode, number }
// ---------------------------------------------------------------------------

function parseValue(value: string): { iso2: string; dialCode: string; number: string } {
  if (!value) return { iso2: DEFAULT_ISO2, dialCode: DEFAULT_DIAL, number: '' }

  const spaceIdx = value.indexOf(' ')
  if (spaceIdx > 0) {
    const maybeCode = value.slice(0, spaceIdx)
    const rest = value.slice(spaceIdx + 1)
    if (/^\+\d{1,4}$/.test(maybeCode) && DIAL_TO_ISO2.has(maybeCode)) {
      return { iso2: DIAL_TO_ISO2.get(maybeCode)!, dialCode: maybeCode, number: rest }
    }
  }

  // Value might be just a dial code (no number yet)
  if (/^\+\d{1,4}$/.test(value) && DIAL_TO_ISO2.has(value)) {
    return { iso2: DIAL_TO_ISO2.get(value)!, dialCode: value, number: '' }
  }

  return { iso2: DEFAULT_ISO2, dialCode: DEFAULT_DIAL, number: value }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PhoneFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  hasError?: boolean
  placeholder?: string
  className?: string
}

export function PhoneField({
  value,
  onChange,
  disabled,
  hasError,
  placeholder = 'Phone number',
  className,
}: PhoneFieldProps) {
  const { iso2, dialCode, number } = useMemo(() => parseValue(value), [value])

  function handleCountryChange(newIso2: string) {
    const country = COUNTRIES.find((c) => c.iso2 === newIso2)
    if (!country) return
    onChange(number ? `${country.dialCode} ${number}` : country.dialCode)
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip everything that isn't a digit, space, hyphen, or parenthesis
    const clean = e.target.value.replace(/[^\d\s\-()+]/g, '')
    onChange(clean ? `${dialCode} ${clean}` : dialCode)
  }

  return (
    <div
      className={cn(
        'flex items-stretch rounded-xl border bg-white text-sm transition-colors',
        'focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20',
        hasError
          ? 'border-rose-400 ring-2 ring-rose-400/20'
          : 'border-brand-surface-2',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      {/* Country code selector */}
      <div className="relative flex items-center shrink-0 border-r border-brand-surface-2">
        <select
          value={iso2}
          onChange={(e) => handleCountryChange(e.target.value)}
          disabled={disabled}
          aria-label="Country dial code"
          className="h-full appearance-none bg-transparent pl-2.5 pr-7 py-2 text-sm text-brand-text-primary cursor-pointer focus:outline-none disabled:cursor-not-allowed"
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.emoji} {c.dialCode}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-text-secondary/60" />
      </div>

      {/* Digits-only phone number input */}
      <input
        type="tel"
        inputMode="numeric"
        value={number}
        onChange={handleNumberChange}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent px-3 py-2 text-brand-text-primary placeholder:text-brand-text-secondary/40 focus:outline-none disabled:cursor-not-allowed"
      />
    </div>
  )
}
