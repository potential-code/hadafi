import { cn } from '@/lib/utils'
import { courseCoverSrc } from '@/lib/images'

/** Small square course thumbnail: the cover image, or Hadafi's default cover. */
export function CourseThumb({
  src,
  size = 40,
  className,
}: {
  src?: string | null
  title: string
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }
  return <img src={courseCoverSrc(src)} alt="" style={style} className={cn('shrink-0 rounded-lg object-cover', className)} />
}
