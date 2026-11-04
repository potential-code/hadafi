'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { downloadCertificate, type CourseCertificate } from '@/lib/api/lms'
import { Button } from '@/components/kit'

type CertRef = Pick<CourseCertificate, 'id' | 'certificateNumber'>

type Props = {
  open: boolean
  certificate: CertRef | null
  courseTitle: string
  onClose: () => void
}

/** Reads the certificate image through the owner-only download endpoint. */
async function fetchCertificateBlob(id: string): Promise<Blob> {
  const response = await downloadCertificate(id)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? 'Your certificate is not ready yet.')
  }
  return response.blob()
}

/** Saves the certificate PNG through the owner-only download endpoint. */
export async function saveCertificate(certificate: CertRef) {
  try {
    const blob = await fetchCertificateBlob(certificate.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificate-${certificate.certificateNumber}.png`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Your certificate could not be downloaded. Please try again.')
  }
}

/** The certificate image as an object URL, loaded with the learner's own sign-in. */
function useCertificateImage(id: string | null) {
  const [state, setState] = useState<{ id: string; url: string | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!id) return
    let url: string | null = null
    let cancelled = false
    fetchCertificateBlob(id)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setState({ id, url, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ id, url: null, error: e instanceof Error ? e.message : 'Preview not available' })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  return state && state.id === id ? state : null
}

export function CertificateModal({ open, certificate, courseTitle, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const image = useCertificateImage(open && certificate ? certificate.id : null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-modal-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[14px] border border-ui-line bg-ui-surface shadow-ui"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ui-line px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[13px] text-ui-muted">Certificate</p>
            <h2 id="cert-modal-title" className="truncate text-base font-semibold text-ui-text">
              {courseTitle}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" autoFocus>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="bg-ui-bg px-5 py-5 sm:px-6">
          {image?.url ? (
            <img
              src={image.url}
              alt={`Certificate for ${courseTitle}`}
              className="block h-auto w-full rounded-[10px] border border-ui-line"
            />
          ) : (
            <div className="flex aspect-[1200/849] items-center justify-center rounded-[10px] border border-ui-line bg-ui-surface px-6 text-center text-sm text-ui-muted">
              {!certificate || !image ? 'Loading certificate' : image.error}
            </div>
          )}
          {certificate?.certificateNumber && (
            <p className="mt-3 text-center font-mono text-xs text-ui-muted">{certificate.certificateNumber}</p>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5 pt-1 sm:px-6">
          <Button className="flex-1" disabled={!certificate} onClick={() => certificate && saveCertificate(certificate)}>
            <Download className="h-4 w-4" aria-hidden />
            Download
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
