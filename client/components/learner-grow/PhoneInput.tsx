'use client'

/**
 * Phone input (dial-code select + number) in the redesign style. Stores the
 * same format as the shared PhoneField: "+971 501234567".
 */
import { useMemo } from 'react'
import { getCountryDataList, getEmojiFlag } from 'countries-list'
import { ChevronDown } from 'lucide-react'
import { inputClass } from '@/components/kit'
import { cn } from '@/lib/utils'

const PHONE_COUNTRIES = getCountryDataList()
  .filter((c) => c.phone.length > 0)
  .map((c) => ({ iso2: c.iso2, name: c.name, dialCode: `+${c.phone[0]}`, emoji: getEmojiFlag(c.iso2) }))
  .sort((a, b) => a.name.localeCompare(b.name))
const DIAL_TO_ISO2 = new Map<string, string>()
for (const c of PHONE_COUNTRIES) if (!DIAL_TO_ISO2.has(c.dialCode)) DIAL_TO_ISO2.set(c.dialCode, c.iso2)

function parsePhone(value: string) {
  if (!value) return { iso2: '', dialCode: '', number: '' }
  const sp = value.indexOf(' ')
  if (sp > 0) {
    const code = value.slice(0, sp)
    if (/^\+\d{1,4}$/.test(code) && DIAL_TO_ISO2.has(code)) return { iso2: DIAL_TO_ISO2.get(code)!, dialCode: code, number: value.slice(sp + 1) }
  }
  if (/^\+\d{1,4}$/.test(value) && DIAL_TO_ISO2.has(value)) return { iso2: DIAL_TO_ISO2.get(value)!, dialCode: value, number: '' }
  return { iso2: '', dialCode: '', number: value }
}

/** "+971" for "United Arab Emirates"; '' when unknown. */
export function dialCodeForCountry(name: string | null | undefined) {
  if (!name) return ''
  return PHONE_COUNTRIES.find((c) => c.name === name)?.dialCode ?? ''
}

export const errorRing = 'border-ui-danger focus:border-ui-danger focus:ring-ui-danger/20'

export function PhoneInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
  describedBy,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  invalid?: boolean
  disabled?: boolean
  describedBy?: string
}) {
  const { iso2, dialCode, number } = useMemo(() => parsePhone(value ?? ''), [value])
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
      <div className="relative">
        <label htmlFor={`${id}-cc`} className="sr-only">
          Country dial code
        </label>
        <select
          id={`${id}-cc`}
          value={iso2}
          disabled={disabled}
          onChange={(e) => {
            const c = PHONE_COUNTRIES.find((x) => x.iso2 === e.target.value)
            if (!c) return onChange(number)
            onChange(number ? `${c.dialCode} ${number}` : c.dialCode)
          }}
          className={cn(inputClass, 'cursor-pointer appearance-none pr-8 font-semibold', invalid && errorRing)}
        >
          <option value="">Code</option>
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.emoji} {c.dialCode}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={number}
        disabled={disabled}
        placeholder="Phone number"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onBlur={onBlur}
        onChange={(e) => {
          const clean = e.target.value.replace(/[^\d\s\-()+]/g, '')
          if (!clean) return onChange(dialCode)
          onChange(dialCode ? `${dialCode} ${clean}` : clean)
        }}
        className={cn(inputClass, invalid && errorRing)}
      />
    </div>
  )
}
