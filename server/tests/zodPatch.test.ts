import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { patchOf } from '../utils/zodPatch'

const create = z.object({
  title: z.string().default(''),
  status: z.enum(['draft', 'published']).default('draft'),
  points: z.number().int().optional().default(10),
  unitId: z.string(),
})

describe('patchOf', () => {
  test('leaves out every field the request did not send (no defaults applied)', () => {
    expect(patchOf(create).parse({})).toEqual({})
    expect(patchOf(create).parse({ status: 'published' })).toEqual({ status: 'published' })
  })

  test('still validates the fields that are sent', () => {
    expect(() => patchOf(create).parse({ status: 'archived' })).toThrow()
  })

  test('plain .partial() would have reset defaulted fields', () => {
    expect(create.partial().parse({})).toEqual({ title: '', status: 'draft', points: 10 })
  })
})
