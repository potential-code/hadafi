'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Search, X, CheckCircle2, FileText, FileVideo, ImageIcon } from 'lucide-react'
import { fetchMediaFiles, type MediaFile } from '@/lib/api/media'
import { cn } from '@/lib/utils'

const SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

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

export default function MediaPicker({ open, onClose, onSelect, accept = 'all' }: Props) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: fetchMediaFiles,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setSearch('')
    setTimeout(() => inputRef.current?.focus(), 50)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const filtered = files.filter((f) => {
    const type = getFileType(f.mimeType)
    const matchesType = accept === 'all' || type === accept
    const matchesSearch = f.originalName.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSearch
  })

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-3xl max-h-[80vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-brand-surface-2">
              <h3 className="text-lg font-black text-brand-text-primary">Media Library</h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-surface transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-6 py-4 border-b border-brand-surface-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files…"
                  className="w-full rounded-xl border border-brand-surface-2 bg-brand-surface pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                />
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <p className="text-center text-brand-text-muted text-sm py-8">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-brand-text-muted text-sm py-8">No files found</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {filtered.map((file) => {
                    const type = getFileType(file.mimeType)
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => { onSelect(file); onClose() }}
                        className={cn(
                          'group relative rounded-xl border border-brand-surface-2 bg-white overflow-hidden text-left transition-all',
                          'hover:border-brand-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/30',
                        )}
                      >
                        <div className="aspect-square flex items-center justify-center bg-brand-surface overflow-hidden">
                          {type === 'image' ? (
                            <img
                              src={`${SERVER_URL}/${file.path}`}
                              alt={file.originalName}
                              className="w-full h-full object-cover"
                            />
                          ) : type === 'video' ? (
                            <FileVideo className="w-8 h-8 text-amber-500" />
                          ) : type === 'pdf' ? (
                            <FileText className="w-8 h-8 text-rose-500" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-brand-text-muted" />
                          )}
                        </div>
                        <div className="px-2 py-1.5">
                          <p className="text-xs font-semibold truncate text-brand-text-primary">{file.originalName}</p>
                        </div>
                        <CheckCircle2 className="absolute top-1.5 right-1.5 w-4 h-4 text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
