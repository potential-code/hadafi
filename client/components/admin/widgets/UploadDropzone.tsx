'use client'

import { useCallback, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from '@/components/kit'
import { IconButton } from '@/components/admin/ui'
import { uploadMediaFile, type MediaFile } from '@/lib/api/media'

interface Props {
  onAccepted: (files: MediaFile[]) => void
}

interface FileUploadState {
  id: string
  name: string
  size: number
  progress: number
  error?: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export default function UploadDropzone({ onAccepted }: Props) {
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<FileUploadState[]>([])

  const processFiles = useCallback(
    async (files: File[]) => {
      const entries: FileUploadState[] = files.map((f) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: f.name,
        size: f.size,
        progress: 0,
      }))
      setPending((prev) => [...prev, ...entries])

      const results = await Promise.allSettled(
        files.map((file, i) =>
          uploadMediaFile(file, (pct) =>
            setPending((prev) => prev.map((e) => (e.id === entries[i].id ? { ...e, progress: pct } : e))),
          )
            .then((saved) => {
              setPending((prev) => prev.filter((e) => e.id !== entries[i].id))
              return saved
            })
            .catch((err) => {
              setPending((prev) => prev.map((e) => (e.id === entries[i].id ? { ...e, error: err.message } : e)))
              throw err
            }),
        ),
      )

      const saved = results
        .filter((r): r is PromiseFulfilledResult<MediaFile> => r.status === 'fulfilled')
        .map((r) => r.value)

      if (saved.length > 0) onAccepted(saved)
    },
    [onAccepted],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      processFiles(Array.from(e.dataTransfer.files))
    },
    [processFiles],
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(Array.from(e.target.files))
      e.target.value = ''
    },
    [processFiles],
  )

  return (
    <div className="flex flex-col gap-2.5">
      <label
        className={cn(
          'flex cursor-pointer flex-wrap items-center justify-center gap-4 rounded-[14px] border-[1.5px] border-dashed p-[22px] text-left transition-colors focus-within:border-ui-brand focus-within:ring-2 focus-within:ring-ui-brand/20',
          dragging ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-bg',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ui-brand-soft text-ui-brand-text">
          <Upload className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-ui-text">
            Drop files here or <span className="text-ui-brand-text underline">browse</span>
          </span>
          <span className="text-[13px] text-ui-muted">Images (PNG, JPG, GIF, WebP, SVG), PDF, Word, MP4, WebM or MOV video, max 50 MB each</span>
        </span>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,.doc,.docx,video/mp4,video/webm,video/quicktime"
          className="sr-only"
          onChange={onInputChange}
        />
      </label>

      {pending.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {pending.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-[10px] border border-ui-line bg-ui-surface px-3.5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-ui-text">{f.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ui-muted">
                    {f.error ? formatSize(f.size) : `${f.progress}%, ${formatSize(f.size)}`}
                  </span>
                </div>
                {f.error ? (
                  <p className="text-[13px] text-ui-danger" role="alert">{f.error}</p>
                ) : (
                  <ProgressBar value={f.progress} label={`Uploading ${f.name}`} />
                )}
              </div>
              {f.error && (
                <IconButton
                  label={`Dismiss ${f.name}`}
                  icon={X}
                  onClick={() => setPending((prev) => prev.filter((e) => e.id !== f.id))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
