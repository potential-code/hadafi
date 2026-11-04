import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'

const TONES = ['#4c1d6e', '#1d4e89', '#1f6f5c', '#8a4513', '#2f4858', '#7a1a4c', '#3d3a1e']

function hashIndex(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % n
}

/** Small square course thumbnail: the cover image, or a coloured tile with a book icon. */
export function CourseThumb({
  src,
  title,
  size = 40,
  className,
}: {
  src?: string | null
  title: string
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }
  if (src) {
    return <img src={optimizedSrc(src)} alt="" style={style} className={cn('shrink-0 rounded-lg object-cover', className)} />
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: TONES[hashIndex(title, TONES.length)] }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-lg text-white/85', className)}
    >
      <BookOpen className="h-5 w-5" strokeWidth={1.75} />
    </span>
  )
}
