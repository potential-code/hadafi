import { OPTIMIZED_IMAGES } from './optimizedImages.generated'

/**
 * The compressed .webp copy of a public image when one exists (see
 * scripts/optimize-images.mjs), otherwise the path unchanged. For paths that
 * come from the database; static paths in code point at the .webp directly.
 */
export function optimizedSrc<T extends string | null | undefined>(src: T): T {
  if (!src || !OPTIMIZED_IMAGES.has(src)) return src
  return src.replace(/\.(png|jpe?g)$/i, '.webp') as T
}
