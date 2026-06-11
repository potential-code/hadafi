'use client'

import { ReactNode, useId, useState, InputHTMLAttributes, forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

type Validator = (v: string) => string | null

interface FloatingFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  label: string
  icon?: ReactNode
  trailing?: ReactNode
  value: string
  validator?: Validator
  externalError?: string | null
  hint?: string
}

export const FloatingField = forwardRef<HTMLInputElement, FloatingFieldProps>(
  function FloatingField(
    { label, icon, trailing, value, validator, externalError, hint, className, onBlur, ...rest },
    ref,
  ) {
    const id = useId()
    const [touched, setTouched] = useState(false)
    const [focused, setFocused] = useState(false)
    const internalError = touched && validator ? validator(value) : null
    const error = externalError ?? internalError
    const valid = !error && touched && value.length > 0 && !!validator && !externalError
    const floated = focused || value.length > 0

    return (
      <div className="relative">
        <div
          className={`relative rounded-xl bg-white border transition-all ${
            error
              ? 'border-rose-400 ring-2 ring-rose-400/20'
              : valid
                ? 'border-emerald-500/60'
                : focused
                  ? 'border-brand-primary ring-2 ring-brand-primary/20'
                  : 'border-brand-surface-2 hover:border-brand-text-secondary/40'
          }`}
        >
          {icon && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary/70 pointer-events-none">
              {icon}
            </span>
          )}
          <label
            htmlFor={id}
            className={`pointer-events-none absolute left-10 transition-all duration-200 ${
              floated
                ? 'top-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-text-secondary'
                : 'top-1/2 -translate-y-1/2 text-sm text-brand-text-secondary/70'
            }`}
          >
            {label}
          </label>
          <input
            id={id}
            ref={ref}
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              setFocused(false)
              setTouched(true)
              onBlur?.(e)
            }}
            className={`w-full bg-transparent ${icon ? 'pl-10' : 'pl-4'} ${
              trailing ? 'pr-10' : 'pr-4'
            } pt-5 pb-2 text-sm text-brand-text-primary placeholder-transparent focus:outline-none ${
              className ?? ''
            }`}
            {...rest}
          />
          {trailing && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>
          )}
          {(valid || error) && !trailing && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              {valid && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </span>
          )}
        </div>
        <AnimatePresence>
          {error && (
            <motion.p
              key="err"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-1.5 px-1 mt-1.5 text-[11px] text-rose-600"
            >
              <AlertCircle className="w-3 h-3" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        {!error && hint && (
          <p className="px-1 mt-1.5 text-[11px] text-brand-text-secondary">{hint}</p>
        )}
      </div>
    )
  },
)
