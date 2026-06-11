'use client'

import { useCallback, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
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
            setPending((prev) =>
              prev.map((e) => (e.id === entries[i].id ? { ...e, progress: pct } : e)),
            ),
          ).then((saved) => {
            setPending((prev) => prev.filter((e) => e.id !== entries[i].id))
            return saved
          }).catch((err) => {
            setPending((prev) =>
              prev.map((e) =>
                e.id === entries[i].id ? { ...e, error: err.message } : e,
              ),
            )
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
    <div className="space-y-3">
      <label
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors',
          dragging ? 'border-brand-primary bg-brand-primary/5' : 'border-border hover:border-brand-primary/50',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Drag & drop files here, or <span className="text-brand-primary font-medium">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">PNG, JPG, GIF, PDF, DOC, MP4 · max 50 MB</p>
        <input
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,video/mp4,video/webm"
          className="sr-only"
          onChange={onInputChange}
        />
      </label>

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((f) => (
            <li key={f.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="truncate max-w-[70%] font-medium">{f.name}</span>
                <span className="text-muted-foreground">{formatSize(f.size)}</span>
              </div>
              {f.error ? (
                <p className="text-destructive text-xs">{f.error}</p>
              ) : (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-brand-primary transition-all duration-150"
                    style={{ width: `${f.progress}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
