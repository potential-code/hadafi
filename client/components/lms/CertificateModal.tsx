'use client'

import { Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { downloadCertificate, type CourseCertificate } from '@/lib/api/lms'

const SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

type Props = {
  open: boolean
  certificate: CourseCertificate | null
  courseTitle: string
  onClose: () => void
}

export function CertificateModal({ open, certificate, courseTitle, onClose }: Props) {
  const handleDownload = async () => {
    if (!certificate) return
    try {
      const response = await downloadCertificate(certificate.id)
      if (!response.ok) {
        toast.error('Certificate download not available yet')
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${certificate.certificateNumber}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download certificate')
    }
  }

  const certImageUrl = certificate?.certificateUrl
    ? `${SERVER_URL}${certificate.certificateUrl}`
    : null

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-brand-surface-2">
                <div>
                  <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Certificate</p>
                  <p className="text-sm font-black text-brand-text-primary leading-snug line-clamp-1">{courseTitle}</p>
                </div>
                <button
                  onClick={onClose}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-surface hover:bg-brand-surface-2 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-brand-text-muted" />
                </button>
              </div>

              {/* Certificate image */}
              <div className="bg-brand-surface/50 px-6 py-5">
                {certImageUrl ? (
                  <div className="rounded-xl overflow-hidden border border-brand-surface-2 shadow-md">
                    <img
                      src={certImageUrl}
                      alt={`Certificate for ${courseTitle}`}
                      className="w-full h-auto block"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-brand-surface-2 bg-white flex items-center justify-center min-h-[240px] text-sm text-brand-text-muted">
                    {certificate ? 'Certificate preview not available' : 'Loading certificate…'}
                  </div>
                )}

                {certificate?.certificateNumber && (
                  <p className="mt-3 text-center text-[11px] text-brand-text-muted font-mono">
                    {certificate.certificateNumber}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 pb-5 pt-1 flex gap-3">
                <button
                  onClick={handleDownload}
                  disabled={!certificate}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-4 py-2.5 text-sm font-bold shadow-md shadow-brand-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 inline-flex items-center justify-center rounded-xl bg-white border border-brand-surface-2 px-4 py-2.5 text-sm font-bold text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
