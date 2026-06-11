'use client'

import { useState, useRef, useEffect } from 'react'
import { getCountryDataList } from 'countries-list'
import { Check, Loader2, Sparkles } from 'lucide-react'

interface CountryPickerCardProps {
  respond: (value: { countryName: string; countryCode: string }) => void
  status: 'inProgress' | 'executing' | 'complete'
}

type CountryEntry = {
  name: string
  code: string
}

const ALL_COUNTRIES: CountryEntry[] = getCountryDataList()
  .map((c) => ({ name: c.name, code: c.iso2 }))
  .sort((a, b) => a.name.localeCompare(b.name))

export function CountryPickerCard({ respond, status }: CountryPickerCardProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CountryEntry | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const respondedRef = useRef(false)
  const lastSelectedRef = useRef<CountryEntry | null>(null)

  // Only disable after the user has responded (respondedRef) or the action completed.
  // CopilotKit can start renderAndWaitForResponse in 'executing' state before the
  // user interacts, so we cannot rely on status === 'executing' alone.
  const isDisabled = status === 'complete' || respondedRef.current
  const showSpinner = respondedRef.current && status === 'executing'

  const filtered = query.trim()
    ? ALL_COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : ALL_COUNTRIES

  useEffect(() => {
    if (status === 'inProgress') {
      inputRef.current?.focus()
    }
  }, [status])

  useEffect(() => {
    if (status === 'inProgress') {
      setSelected(null)
      setQuery('')
      respondedRef.current = false
    }
  }, [status])

  function handleSelect(country: CountryEntry) {
    if (isDisabled || respondedRef.current) return
    respondedRef.current = true
    lastSelectedRef.current = country
    setSelected(country)
    respond({ countryName: country.name, countryCode: country.code })
  }

  return (
    <div
      className="my-2 rounded-xl overflow-hidden border"
      style={{ background: 'rgba(20, 10, 16, 0.90)', borderColor: 'rgba(255,255,255,0.10)', maxWidth: '340px' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: 'linear-gradient(120deg,#9f2063,#7a1a4c)' }}
      >
        <Sparkles className="w-4 h-4 text-white/80 flex-shrink-0" />
        <span className="text-sm font-semibold text-white tracking-wide">
          Select Your Country
        </span>
      </div>

      {/* Complete state */}
      {status === 'complete' ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10">
            <Check className="w-3.5 h-3.5 text-[#9f2063]" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-medium text-white/90">
            {lastSelectedRef.current?.name ?? 'Country selected'}
          </span>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {/* Search input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isDisabled}
              placeholder="Search countries…"
              className="w-full rounded-lg px-3 py-2 text-sm text-white/90 outline-none transition-colors placeholder:text-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            />
            {showSpinner && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9f2063]" />
              </div>
            )}
          </div>

          {/* Country list */}
          <div className="max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(159,32,99,0.3) transparent' }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-white/40">No countries found.</p>
            ) : (
              filtered.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelect(country)}
                  className="w-full text-left rounded-lg px-3 py-2 text-sm text-white/90 transition-colors disabled:cursor-not-allowed hover:bg-white/5"
                >
                  {country.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
