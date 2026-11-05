import { z } from 'zod'

/**
 * PATCH schema from a create schema: every field optional and NO defaults.
 * Under Zod 4, `.partial()` still applies `.default()` values, so a PATCH that
 * sends one field would silently reset every defaulted field it left out.
 */
export function patchOf<S extends z.ZodRawShape>(create: z.ZodObject<S>) {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, field] of Object.entries(create.shape)) {
    shape[key] = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType)
  }
  return z.object(shape).partial() as unknown as ReturnType<z.ZodObject<S>['partial']>
}
