'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  LayoutGrid,
  List,
  ImageIcon,
  FileText,
  FileVideo,
  Trash2,
  Download,
  Filter,
  Eye,
  Link as LinkIcon,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

const SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import UploadDropzone from '@/components/admin/widgets/UploadDropzone'
import {
  fetchMediaFiles,
  deleteMediaFile,
  bulkDeleteMediaFiles,
  type MediaFile,
} from '@/lib/api/media'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'

type FileType = 'image' | 'pdf' | 'doc' | 'video' | 'other'

function getFileType(mimeType: string): FileType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'doc'
  return 'other'
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

const TYPE_ICON: Record<FileType, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  doc: FileText,
  video: FileVideo,
  other: FileText,
}
const TYPE_TONE: Record<FileType, string> = {
  image: 'bg-brand-primary/10 text-brand-primary',
  pdf: 'bg-rose-500/15 text-rose-600',
  doc: 'bg-brand-violet/15 text-brand-violet',
  video: 'bg-amber-500/15 text-amber-700',
  other: 'bg-muted text-muted-foreground',
}
const TYPE_FILTERS = ['All', 'image', 'pdf', 'doc', 'video'] as const

export default function AdminMediaPage() {
  const queryClient = useQueryClient()
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: fetchMediaFiles,
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<MediaFile | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MediaFile | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const filtered = files
    .filter((f) => (type === 'All' ? true : getFileType(f.mimeType) === type))
    .filter((f) => (query ? f.originalName.toLowerCase().includes(query.toLowerCase()) : true))

  function handleAccepted(saved: MediaFile[]) {
    queryClient.setQueryData<MediaFile[]>(['media'], (prev = []) => [...saved, ...prev])
    saved.forEach((f) => toast.success(`Uploaded ${f.originalName}`))
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMediaFile(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<MediaFile[]>(['media'], (prev = []) =>
        prev.filter((f) => f.id !== id),
      )
      if (preview?.id === id) setPreview(null)
      setConfirmDelete(null)
      toast.success('File deleted')
    },
    onError: () => toast.error('Failed to delete file'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteMediaFiles(ids),
    onSuccess: (_, ids) => {
      const set = new Set(ids)
      queryClient.setQueryData<MediaFile[]>(['media'], (prev = []) =>
        prev.filter((f) => !set.has(f.id)),
      )
      setSelected(new Set())
      toast.success(`Deleted ${ids.length} file${ids.length > 1 ? 's' : ''}`)
    },
    onError: () => toast.error('Failed to delete files'),
  })

  function copyUrl(f: MediaFile) {
    const url = `${SERVER_URL}/${f.path}`
    const fallback = () => {
      if (typeof document === 'undefined') {
        toast.error('Could not copy')
        return
      }
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (ok) toast.success('URL copied')
        else toast.error('Could not copy — please copy manually')
      } catch {
        toast.error('Could not copy — please copy manually')
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast.success('URL copied'), fallback)
    } else {
      fallback()
    }
  }

  if (isLoading)
    return (
      <AdminLayout>
        <div className="p-12 text-center text-brand-text-muted">Loading media library…</div>
      </AdminLayout>
    )

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Storage"
        title="Media"
        highlight="library"
        subtitle="Upload, organise, and reuse images, documents, and recordings across the platform."
      />

      {/* Top: dropzone */}
      <div className="mb-5">
        <UploadDropzone onAccepted={handleAccepted} />
      </div>

      {/* Filter by type — horizontal */}
      <div className="mb-5 rounded-2xl border border-brand-surface-2 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted px-1">
            Filter by type
          </span>
          {TYPE_FILTERS.map((t) => {
            const active = t === type
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors',
                  active
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'bg-brand-surface text-brand-text-muted hover:text-brand-primary hover:bg-brand-primary/10',
                )}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-brand-text-muted">
          <Filter className="w-4 h-4" />
          {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
          {type !== 'All' && (
            <span>
              in <span className="font-bold text-brand-text-primary capitalize">{type}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              className="rounded-xl border border-brand-surface-2 bg-white pl-9 pr-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div className="inline-flex rounded-xl border border-brand-surface-2 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              className={cn('w-8 h-8 rounded-lg flex items-center justify-center', view === 'grid' ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:text-brand-primary')}
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('w-8 h-8 rounded-lg flex items-center justify-center', view === 'list' ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:text-brand-primary')}
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk-delete toolbar */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 bg-brand-surface rounded-2xl border border-brand-surface-2">
          <span className="text-sm font-semibold text-brand-text-primary">{selected.size} selected</span>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            disabled={bulkDeleteMutation.isPending}
            className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 disabled:opacity-60 transition-colors"
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 rounded-lg bg-white border border-brand-surface-2 text-xs font-bold text-brand-text-muted hover:text-brand-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-3xl border-2 border-dashed border-brand-surface-2 bg-white p-12 text-center text-sm text-brand-text-muted"
          >
            No files match your filter.
          </motion.div>
        ) : view === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
          >
            {filtered.map((f, i) => {
              const fileType = getFileType(f.mimeType)
              const Icon = TYPE_ICON[fileType]
              const thumbnail = f.mimeType.startsWith('image/') ? `${SERVER_URL}/${f.path}` : null
              return (
                <motion.article
                  key={f.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * i }}
                  whileHover={{ y: -4 }}
                  className="group relative rounded-2xl bg-white border border-brand-surface-2 overflow-hidden hover:border-brand-primary/40 hover:shadow-lg transition-all"
                >
                  <div className="relative aspect-square bg-brand-surface flex items-center justify-center overflow-hidden">
                    {thumbnail ? (
                      <img src={thumbnail} alt={f.originalName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', TYPE_TONE[fileType])}>
                        <Icon className="w-7 h-7" />
                      </div>
                    )}
                    <span className={cn('absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider', TYPE_TONE[fileType])}>
                      {fileType}
                    </span>

                    {/* Actions — always visible on touch, hover-revealed on hover-capable devices */}
                    <div className="absolute inset-x-0 bottom-0 sm:inset-0 bg-gradient-to-t from-black/55 to-transparent sm:bg-black/0 sm:group-hover:bg-black/30 sm:focus-within:bg-black/30 transition-colors flex items-end sm:items-center justify-center gap-1.5 p-2 sm:p-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button
                        onClick={() => setPreview(f)}
                        className="w-9 h-9 rounded-full bg-white text-brand-text-primary hover:bg-brand-primary hover:text-white flex items-center justify-center shadow-md transition-colors"
                        aria-label="View details"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => copyUrl(f)}
                        className="w-9 h-9 rounded-full bg-white text-brand-text-primary hover:bg-brand-primary hover:text-white flex items-center justify-center shadow-md transition-colors"
                        aria-label="Copy URL"
                        title="Copy URL"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(f)}
                        className="w-9 h-9 rounded-full bg-white text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center shadow-md transition-colors"
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-bold text-brand-text-primary truncate">{f.originalName}</p>
                    <p className="text-[10px] text-brand-text-muted mt-0.5">{formatSize(f.size)} · {new Date(f.createdAt).toLocaleDateString()}</p>
                  </div>
                </motion.article>
              )
            })}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-brand-surface-2 bg-white overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead className="bg-brand-surface text-left text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const fileType = getFileType(f.mimeType)
                  const Icon = TYPE_ICON[fileType]
                  return (
                    <motion.tr
                      key={f.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.025 * i }}
                      className="border-b border-brand-surface-2/60 hover:bg-brand-surface/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg', TYPE_TONE[fileType])}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="font-bold text-brand-text-primary">{f.originalName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-brand-text-muted capitalize">{fileType}</td>
                      <td className="px-4 py-3 text-brand-text-muted tabular-nums">{formatSize(f.size)}</td>
                      <td className="px-4 py-3 text-brand-text-muted">{new Date(f.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setPreview(f)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                            aria-label="View details"
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => copyUrl(f)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                            aria-label="Copy URL"
                            title="Copy URL"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(f)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview dialog */}
      <AnimatePresence>
        {preview && (
          <PreviewDialog
            file={preview}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDeleteDialog
            file={confirmDelete}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected files"
        message={`This will permanently delete ${selected.size} file${selected.size > 1 ? 's' : ''}. This cannot be undone.`}
        confirmLabel={`Delete ${selected.size} file${selected.size > 1 ? 's' : ''}`}
        onConfirm={() => { bulkDeleteMutation.mutate(Array.from(selected)); setConfirmBulkDelete(false) }}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </AdminLayout>
  )
}

function ConfirmDeleteDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: MediaFile
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const titleId = `confirm-delete-${file.id}-title`

  function handleConfirm() {
    if (isDeleting) return
    setIsDeleting(true)
    onConfirm()
  }

  useEffect(() => {
    confirmBtnRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <span className="shrink-0 w-11 h-11 rounded-full bg-rose-500/15 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-black text-brand-text-primary">
              Delete file?
            </h3>
            <p className="mt-1.5 text-sm text-brand-text-muted leading-relaxed">
              You're about to delete{' '}
              <span className="font-semibold text-brand-text-primary break-all">{file.originalName}</span>.
              This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-brand-surface-2 bg-brand-surface/40">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-white border border-brand-surface-2 text-sm font-bold text-brand-text-primary hover:bg-brand-surface transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function PreviewDialog({
  file,
  onClose,
}: {
  file: MediaFile
  onClose: () => void
}) {
  const fileType = getFileType(file.mimeType)
  const Icon = TYPE_ICON[fileType]
  const thumbnail = file.mimeType.startsWith('image/') ? `${SERVER_URL}/${file.path}` : null
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = `media-preview-${file.id}-title`

  useEffect(() => {
    const previouslyFocused = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
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
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-brand-surface-2">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', TYPE_TONE[fileType])}>
              <Icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 id={titleId} className="text-lg font-black text-brand-text-primary truncate">{file.originalName}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider', TYPE_TONE[fileType])}>
                  <Icon className="w-3 h-3" /> {fileType}
                </span>
                <span className="text-xs text-brand-text-muted">{formatSize(file.size)}</span>
              </div>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-surface focus:outline-none focus:ring-2 focus:ring-brand-primary/30 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Preview */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-2">Preview</p>
            <div className="aspect-square rounded-xl bg-brand-surface flex items-center justify-center overflow-hidden border border-brand-surface-2">
              {thumbnail ? (
                <img src={thumbnail} alt={file.originalName} className="w-full h-full object-cover" />
              ) : (
                <div className={cn('w-20 h-20 rounded-2xl flex items-center justify-center', TYPE_TONE[fileType])}>
                  <Icon className="w-10 h-10" />
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted mb-3">File details</p>
            <dl className="space-y-3">
              <Detail label="File name" value={file.originalName} />
              <Detail label="File type" value={file.mimeType} />
              <Detail label="File size" value={formatSize(file.size)} />
              <Detail label="Upload date" value={new Date(file.createdAt).toLocaleDateString()} />
            </dl>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-brand-surface-2 bg-brand-surface/40">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white border border-brand-surface-2 text-sm font-bold text-brand-text-primary hover:bg-brand-surface transition-colors"
          >
            Close
          </button>
          <button
            onClick={async () => {
              try {
                const res = await fetch(`${SERVER_URL}/${file.path}`)
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = file.originalName
                a.click()
                URL.revokeObjectURL(url)
              } catch {
                toast.error('Download failed')
              }
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark shadow-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-brand-surface-2/60 last:border-0">
      <dt className="text-sm text-brand-text-muted shrink-0">{label}</dt>
      <dd className="text-sm font-semibold text-brand-text-primary text-right truncate min-w-0">{value}</dd>
    </div>
  )
}
