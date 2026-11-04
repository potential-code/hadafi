/**
 * Where a smaller .webp copy of a public image exists, its path; otherwise
 * the path unchanged. Hadafi has no generated copies yet (SMEEP's image
 * optimiser lands with the image work), so this returns the path as given.
 */
export function optimizedSrc<T extends string | null | undefined>(src: T): T {
  return src
}
