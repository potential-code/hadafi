/**
 * Renders the two sign-up consent UIs to HTML and prints them as JSON. Run in
 * its own process by consentCheckboxes.test.tsx: the sign-up page pulls in
 * auth and Hana modules whose state must not leak into other test files.
 */
import { mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

// The sign-up page expects the Next app router; outside it, stand in for it.
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/sign-up',
  useSearchParams: () => new URLSearchParams(),
}))

const { default: SignUpPage } = await import('@/views/SignUp')
const { RegistrationConfirmCard } = await import('../RegistrationConfirmCard')

const form = renderToStaticMarkup(<SignUpPage />)
const card = renderToStaticMarkup(
  <RegistrationConfirmCard
    data={{ fullName: 'Test Learner', email: 'learner@example.test', country: 'JO', countryName: 'Jordan' }}
    status="executing"
    respond={() => {}}
  />,
)
console.log(JSON.stringify({ form, card }))
