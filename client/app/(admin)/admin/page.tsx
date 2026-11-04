import { redirect } from 'next/navigation'

/** The bare section address opens its dashboard. */
export default function Page() {
  redirect('/admin/dashboard')
}
