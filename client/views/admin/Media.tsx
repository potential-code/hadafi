'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Download,
  File as FileIcon,
  FileText,
  FileVideo,
  Eye,
  ImageIcon,
  LayoutGrid,
  List,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { btn, Card, EmptyState, FilterChips, PageHeader, Skeleton } from '@/components/kit'
import { adminTableClass, fmtDate, IconButton, Modal, SearchInput, Segmented, TableCard } from '@/components/admin/ui'
import UploadDropzone from '@/components/admin/widgets/UploadDropzone'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { revealIfStacked } from '@/components/admin/content/useMediaQuery'
import { fetchMediaFiles, deleteMediaFile, bulkDeleteMediaFiles, type MediaFile } from '@/lib/api/media'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/api/errors'
import { API_BASE } from '@/lib/api'

const SERVER_URL = API_BASE

type FileType = 'image' | 'pdf' | 'doc' | 'video' | 'other'
type TypeFilter = 'All' | 'image' | 'pdf' | 'doc' | 'video'

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
  other: FileIcon,
}
const TYPE_LABEL: Record<FileType, string> = { image: 'Image', pdf: 'PDF', doc: 'Doc', video: 'Video', other: 'File' }
const TYPE_FILTERS: TypeFilter[] = ['All', 'image', 'pdf', 'doc', 'video']

const fileUrl = (f: MediaFile) => `${SERVER_URL}/${f.path}`

/** Download name: the uploader's name, but with the extension the file was stored (and checked) as. */
function downloadName(f: MediaFile): string {
  const ext = f.storedName.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
  const base = f.originalName.replace(/\.[^./\\]*$/, '') || 'file'
  return `${base}${ext}`
}

export default function AdminMediaPage() {
  const queryClient = useQueryClient()
  const { data: files = [], isLoading, isError } = useQuery({
    queryKey: ['media'],
    queryFn: fetchMediaFiles,
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [type, setType] = useState<TypeFilter>('All')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<MediaFile | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<MediaFile | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const filtered = files
    .filter((f) => (type === 'All' ? true : getFileType(f.mimeType) === type))
    .filter((f) => (query ? f.originalName.toLowerCase().includes(query.toLowerCase()) : true))

  const countOf = (t: TypeFilter) => (t === 'All' ? files.length : files.filter((f) => getFileType(f.mimeType) === t).length)

  function handleAccepted(saved: MediaFile[]) {
    queryClient.setQueryData<MediaFile[]>(['media'], (prev = []) => [...saved, ...prev])
    saved.forEach((f) => toast.success(`Uploaded ${f.originalName}`))
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMediaFile(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<MediaFile[]>(['media'], (prev = []) => prev.filter((f) => f.id !== id))
      if (preview?.id === id) setPreview(null)
      setSelected((s) => {
        if (!s.has(id)) return s
        const n = new Set(s)
        n.delete(id)
        return n
      })
      setConfirmDelete(null)
      toast.success('File deleted')
    },
    onError: (err) => toast.error(errorMessage(err, 'The file could not be deleted. Please try again.')),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteMediaFiles(ids),
    onSuccess: (_, ids) => {
      const set = new Set(ids)
      queryClient.setQueryData<MediaFile[]>(['media'], (prev = []) => prev.filter((f) => !set.has(f.id)))
      if (preview && set.has(preview.id)) setPreview(null)
      setSelected(new Set())
      toast.success(`Deleted ${ids.length} file${ids.length > 1 ? 's' : ''}`)
    },
    onError: (err) => toast.error(errorMessage(err, 'The files could not be deleted. Please try again.')),
  })

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function copyUrl(f: MediaFile) {
    const url = fileUrl(f)
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
        else toast.error('Could not copy, please copy it manually')
      } catch {
        toast.error('Could not copy, please copy it manually')
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast.success('URL copied'), fallback)
    } else {
      fallback()
    }
  }

  async function download(file: MediaFile) {
    try {
      const res = await fetch(fileUrl(file))
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName(file)
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('The download did not start. Please try again.')
    }
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id))

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          className="mb-0"
          title="Media Library"
          subtitle="Upload, organize and reuse images, documents and recordings across the platform."
        />

        <UploadDropzone onAccepted={handleAccepted} />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips
            label="Filter by type"
            active={type}
            onChange={(v) => setType(v)}
            className="max-md:w-full md:flex-wrap"
            options={TYPE_FILTERS.map((t) => {
              const Icon = t === 'All' ? null : TYPE_ICON[t]
              return {
                value: t,
                count: countOf(t),
                label: (
                  <>
                    {Icon && <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                    {t === 'All' ? 'All' : TYPE_LABEL[t]}
                  </>
                ),
              }
            })}
          />
          <div className="flex w-full items-center gap-2 md:w-auto">
            <SearchInput value={query} onChange={setQuery} placeholder="Search files" className="flex-1 md:w-[240px] md:flex-none" />
            <Segmented
              label="View"
              value={view}
              onChange={(v) => setView(v)}
              options={[
                { value: 'grid', icon: LayoutGrid, label: <span className="sr-only">Grid view</span> },
                { value: 'list', icon: List, label: <span className="sr-only">List view</span> },
              ]}
            />
          </div>
        </div>

        <div className={cn('grid grid-cols-[minmax(0,1fr)] items-start gap-5', preview && 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
          <div className="flex min-w-0 flex-col gap-3">
            {selected.size > 0 && (
              <div role="region" aria-label="Bulk actions" className="flex items-center gap-2.5 rounded-xl bg-ui-text py-2 pl-3.5 pr-2 text-ui-bg">
                <span className="flex-1 text-[13px] font-semibold">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={bulkDeleteMutation.isPending}
                  className={cn(btn({ size: 'sm' }), 'border-transparent bg-ui-bg text-ui-text hover:bg-ui-bg hover:opacity-90')}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Delete selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className={cn(btn({ size: 'sm' }), 'border-[rgba(127,127,127,0.5)] bg-transparent text-ui-bg hover:bg-transparent hover:opacity-80')}
                >
                  Cancel
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3" aria-busy="true" aria-label="Loading media library">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[4/3.6] rounded-[14px]" />
                ))}
              </div>
            ) : isError ? (
              <Card>
                <EmptyState icon={ImageIcon} title="Could not load the media library" body="Refresh the page to try again." />
              </Card>
            ) : filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={ImageIcon}
                  title={files.length === 0 ? 'No files yet' : 'No files match your filter'}
                  body={
                    files.length === 0
                      ? 'Upload images, documents and recordings above to reuse them in courses, events and offers.'
                      : 'Try a different type or search.'
                  }
                />
              </Card>
            ) : view === 'grid' ? (
              <div className={cn('grid grid-cols-2 gap-3.5 sm:grid-cols-3', !preview && '2xl:grid-cols-4')}>
                {filtered.map((f) => {
                  const fileType = getFileType(f.mimeType)
                  const Icon = TYPE_ICON[fileType]
                  const isSel = selected.has(f.id)
                  const isOpen = preview?.id === f.id
                  return (
                    <article
                      key={f.id}
                      className={cn(
                        'group relative overflow-hidden rounded-[14px] border bg-ui-surface',
                        isOpen || isSel ? 'border-transparent shadow-[0_0_0_2px_var(--ui-brand)]' : 'border-ui-line',
                      )}
                    >
                      <label className="absolute left-2 top-2 z-[1] inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] bg-white/90 shadow-[0_1px_3px_rgba(0,0,0,0.15)]">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(f.id)}
                          className="h-4 w-4 accent-[var(--ui-brand)]"
                        />
                        <span className="sr-only">Select {f.originalName}</span>
                      </label>
                      <span
                        className={cn(
                          'absolute right-2 top-2 z-[1] flex gap-1 transition-opacity',
                          isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
                        )}
                      >
                        <OverlayButton label="View details" icon={Eye} onClick={() => setPreview(f)} />
                        <OverlayButton label="Copy URL" icon={Copy} onClick={() => copyUrl(f)} />
                        <OverlayButton label="Delete" icon={Trash2} onClick={() => setConfirmDelete(f)} />
                      </span>
                      {/* Mouse shortcut; keyboard and screen reader users use the "View details" button above. */}
                      <div onClick={() => setPreview(f)} className="block w-full cursor-pointer">
                        {fileType === 'image' ? (
                          <img src={fileUrl(f)} alt="" className="block aspect-[4/3] w-full object-cover" />
                        ) : (
                          <span className="flex aspect-[4/3] w-full items-center justify-center bg-ui-surface-2 text-ui-muted">
                            <Icon className="h-9 w-9" strokeWidth={1.5} aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 border-t border-ui-line px-3 py-2.5">
                        <span className="truncate text-[13px] font-semibold text-ui-text" title={f.originalName}>{f.originalName}</span>
                        <span className="text-xs text-ui-muted">
                          {formatSize(f.size)}, {TYPE_LABEL[fileType]}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <TableCard>
                <table className={cn(adminTableClass, 'min-w-[640px] table-fixed')} aria-label="Files">
                  <colgroup>
                    <col className="w-[52px]" />
                    <col />
                    <col className="w-[84px]" />
                    <col className="w-[96px]" />
                    <col className="w-[120px]" />
                    <col className="w-[132px]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">
                        <input
                          type="checkbox"
                          aria-label="Select all files"
                          checked={allVisibleSelected}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s)
                              if (allVisibleSelected) filtered.forEach((f) => n.delete(f.id))
                              else filtered.forEach((f) => n.add(f.id))
                              return n
                            })
                          }
                          className="h-4 w-4 align-middle accent-[var(--ui-brand)]"
                        />
                      </th>
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col" className="!text-right">Size</th>
                      <th scope="col">Uploaded</th>
                      <th scope="col" className="!text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => {
                      const fileType = getFileType(f.mimeType)
                      const Icon = TYPE_ICON[fileType]
                      const isOpen = preview?.id === f.id
                      return (
                        <tr key={f.id} aria-selected={isOpen || undefined} className={cn(isOpen && '!bg-ui-brand-soft')}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${f.originalName}`}
                              checked={selected.has(f.id)}
                              onChange={() => toggleSelect(f.id)}
                              className="h-4 w-4 align-middle accent-[var(--ui-brand)]"
                            />
                          </td>
                          <td>
                            <span className="flex min-w-0 items-center gap-2.5">
                              {fileType === 'image' ? (
                                <img src={fileUrl(f)} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                              ) : (
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ui-surface-2 text-ui-muted">
                                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setPreview(f)}
                                className="truncate text-left font-semibold text-ui-text hover:underline"
                                title={f.originalName}
                              >
                                {f.originalName}
                              </button>
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-ui-muted">{TYPE_LABEL[fileType]}</td>
                          <td className="whitespace-nowrap text-right tabular-nums text-ui-muted">{formatSize(f.size)}</td>
                          <td className="whitespace-nowrap text-ui-muted">{fmtDate(f.createdAt)}</td>
                          <td>
                            <span className="flex justify-end gap-0.5">
                              <IconButton label="View details" icon={Eye} onClick={() => setPreview(f)} />
                              <IconButton label="Copy URL" icon={Copy} onClick={() => copyUrl(f)} />
                              <IconButton label="Delete" icon={Trash2} tone="danger" onClick={() => setConfirmDelete(f)} />
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableCard>
            )}

            {!isLoading && !isError && files.length > 0 && (
              <p className="text-[13px] text-ui-muted">
                {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
                {type !== 'All' && ` in ${TYPE_LABEL[type]}`}
              </p>
            )}
          </div>

          {preview && (
            <DetailPanel
              file={preview}
              onClose={() => setPreview(null)}
              onCopy={() => copyUrl(preview)}
              onDownload={() => download(preview)}
              onDelete={() => setConfirmDelete(preview)}
            />
          )}
        </div>
      </div>

      <DeleteFileDialog
        file={confirmDelete}
        pending={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected files"
        message={`This will permanently delete ${selected.size} file${selected.size > 1 ? 's' : ''}. This cannot be undone.`}
        confirmLabel={`Delete ${selected.size} file${selected.size > 1 ? 's' : ''}`}
        onConfirm={() => {
          bulkDeleteMutation.mutate(Array.from(selected))
          setConfirmBulkDelete(false)
        }}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </AdminLayout>
  )
}

function OverlayButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-white/90 text-[#17171C] shadow-[0_1px_3px_rgba(0,0,0,0.15)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  )
}

function DetailPanel({
  file,
  onClose,
  onCopy,
  onDownload,
  onDelete,
}: {
  file: MediaFile
  onClose: () => void
  onCopy: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const fileType = getFileType(file.mimeType)
  const Icon = TYPE_ICON[fileType]
  const headingId = `media-detail-${file.id}`

  useEffect(() => {
    revealIfStacked(ref.current)
  }, [file.id])

  return (
    <aside
      ref={ref}
      aria-labelledby={headingId}
      className="scroll-mt-20 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface xl:sticky xl:top-6"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-center gap-2.5 border-b border-ui-line px-4 py-3">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ui-text" title={file.originalName}>
          {file.originalName}
        </h2>
        <IconButton label="Close details" icon={X} onClick={onClose} className="-mr-1.5" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        {fileType === 'image' ? (
          <img src={fileUrl(file)} alt={`Preview of ${file.originalName}`} className="block aspect-[16/10] w-full rounded-[10px] object-cover" />
        ) : fileType === 'video' ? (
          <video src={fileUrl(file)} controls preload="metadata" className="block aspect-[16/10] w-full rounded-[10px] bg-black" />
        ) : (
          <span className="flex aspect-[16/10] w-full items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-muted">
            <Icon className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ui-muted">File name</dt>
          <dd className="m-0 break-all text-right text-ui-text">{file.originalName}</dd>
          <dt className="text-ui-muted">File type</dt>
          <dd className="m-0 break-all text-right text-ui-text">{file.mimeType}</dd>
          <dt className="text-ui-muted">File size</dt>
          <dd className="m-0 text-right tabular-nums text-ui-text">{formatSize(file.size)}</dd>
          <dt className="text-ui-muted">Upload date</dt>
          <dd className="m-0 text-right text-ui-text">{fmtDate(file.createdAt)}</dd>
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCopy} className={btn({ size: 'sm' })}>
            <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Copy URL
          </button>
          <button type="button" onClick={onDownload} className={btn({ variant: 'secondary', size: 'sm' })}>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Download
          </button>
        </div>
        <button type="button" onClick={onDelete} className={cn(btn({ variant: 'secondary', size: 'sm' }), 'hover:text-ui-danger')}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Delete file
        </button>
      </div>
    </aside>
  )
}

function DeleteFileDialog({
  file,
  pending,
  onCancel,
  onConfirm,
}: {
  file: MediaFile | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={!!file}
      title="Delete file?"
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onCancel} className={btn({ variant: 'secondary', size: 'sm' })}>
            Cancel
          </button>
          <button type="button" data-autofocus onClick={onConfirm} disabled={pending} className={btn({ variant: 'danger', size: 'sm' })}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {pending ? 'Deleting' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ui-muted">
        You are about to delete <span className="break-all font-semibold text-ui-text">{file?.originalName}</span>. This cannot be undone.
      </p>
    </Modal>
  )
}
