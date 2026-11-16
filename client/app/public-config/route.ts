import { validGtmId } from '@/lib/consent/gtmId'

/**
 * Public, non-secret site settings the browser needs at run time. Read from
 * this Next server's environment on every request, so changing
 * GTM_CONTAINER_ID takes a container restart, not a rebuild (NEXT_PUBLIC_*
 * values are frozen into the bundle at build time).
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return Response.json(
    { gtmId: validGtmId(process.env.GTM_CONTAINER_ID) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
