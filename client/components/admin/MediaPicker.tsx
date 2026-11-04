'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, FileText, FileVideo, ImageIcon, ImageOff, X } from 'lucide-react'
import { fetchMediaFiles, type MediaFile } from '@/lib/api/media'
import { IconButton, SearchInput } from '@/components/admin/ui'
import { EmptyState, Skeleton } from '@/components/kit'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/api'

const SERVER_URL = API_BASE

function getFileType(mimeType: string): 'image' | 'pdf' | 'doc' | 'video' | 'other' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'doc'
  return 'other'
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (file: MediaFile) => void
  accept?: 'image' | 'video' | 'all'
}

/**
 * Media library picker. Opens above other dialogs (z-70) and keeps Escape to
 * itself so closing it does not also close the dialog underneath.
 */
export default function MediaPicker({ open, onClose, onSelect, accept = 'all' }: Props) {
  const [search, setSearch] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  const { data: files = [], isLoading, isError } = useQuery({
    queryKey: ['media'],
    queryFn: fetchMediaFiles,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setSearch('')
    const prevFocus = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 30)

    // Capture phase on window runs before the document listeners other
    // dialogs use, so stopping it here keeps their Escape handlers quiet.
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
      prevFocus?.focus?.()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const filtered = files.filter((f) => {
    const type = getFileType(f.mimeType)
    const matchesType = accept === 'all' || type === accept
    const matchesSearch = f.originalName.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSearch
  })

  const kind = accept === 'image' ? 'images' : accept === 'video' ? 'videos' : 'files'

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[14px] border border-ui-line bg-ui-surface text-ui-text shadow-ui sm:max-h-[80vh] sm:rounded-[14px]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-ui-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">Media library</h2>
            <p className="mt-0.5 text-[13px] text-ui-muted">Choose one of the uploaded {kind}.</p>
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} className="-mr-1.5 -mt-1" />
        </header>

        <div className="border-b border-ui-line px-5 py-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search files" className="w-full" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-[10px]" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState icon={ImageOff} title="The media library could not be loaded" body="Close this and try again." />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ImageOff}
              title={search ? 'No files match your search' : `No ${kind} uploaded yet`}
              body={search ? 'Try a different name.' : 'Upload files in the Media Library, then pick them here.'}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {filtered.map((file) => {
                const type = getFileType(file.mimeType)
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(file)
                        onClose()
                      }}
                      className={cn(
                        'group relative block w-full overflow-hidden rounded-[10px] border border-ui-line bg-ui-surface text-left transition-colors',
                        'hover:border-ui-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
                      )}
                    >
                      <span className="flex aspect-square items-center justify-center overflow-hidden bg-ui-surface-2 text-ui-muted">
                        {type === 'image' ? (
                          <img src={`${SERVER_URL}/${file.path}`} alt="" className="h-full w-full object-cover" />
                        ) : type === 'video' ? (
                          <FileVideo className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                        ) : type === 'pdf' ? (
                          <FileText className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                        ) : (
                          <ImageIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                        )}
                      </span>
                      <span className="block truncate px-2.5 py-2 text-xs font-medium text-ui-text">{file.originalName}</span>
                      <CheckCircle2
                        className="absolute right-1.5 top-1.5 h-5 w-5 rounded-full bg-ui-surface text-ui-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
