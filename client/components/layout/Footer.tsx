import Link from 'next/link'
import { Facebook, Linkedin, Mail, MessageCircle } from 'lucide-react'
import { btn } from '@/components/kit'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { XIcon } from '@/components/landing/LandingCommunity'
import { CONTACT_EMAIL, LEGAL_LINKS } from '@/components/landing/legal'

const SHARE_URL = 'https://hadafi.potential.org'
const SHARE_TEXT = 'Start and grow your business with Hadafi, the free program for women entrepreneurs by Potential.org'

const SHARE_LINKS = [
  {
    label: 'Share on X',
    href: `https://twitter.com/share?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    Icon: XIcon,
  },
  {
    label: 'Share on Facebook',
    href: `https://www.facebook.com/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
    Icon: Facebook,
  },
  {
    label: 'Share on LinkedIn',
    href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
    Icon: Linkedin,
  },
  {
    label: 'Share on WhatsApp',
    href: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${SHARE_TEXT}: ${SHARE_URL}`)}`,
    Icon: MessageCircle,
  },
] as const

/** Internal pages and Potential's legal pages. No public FAQ page exists (FAQs are in the signed-in Support page). */
const IMPORTANT_LINKS = [
  { label: 'Home page', href: '/' },
  { label: 'Log in', href: '/login' },
  { label: 'Sign up', href: '/sign-up' },
  { label: 'Privacy Policy', href: LEGAL_LINKS.privacy },
  { label: 'Terms of Use', href: LEGAL_LINKS.terms },
]

const STAKEHOLDER_LINKS = [
  { label: 'Experts', href: '/#experts' },
  { label: 'Supporters', href: '/#supporters' },
  { label: 'Government entities', href: '/#government' },
]

const linkCls = 'text-sm text-ui-muted transition-colors hover:text-ui-text'

/** The public site footer (homepage). */
export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-ui-line bg-ui-surface">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-[22px] pt-8 min-[900px]:px-10">
        <div className="grid grid-cols-1 gap-8 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <img
              src={REDESIGN_ASSETS.logo.src}
              alt="Hadafi"
              width={1293}
              height={282}
              className="h-8 w-auto self-start dark:brightness-0 dark:invert"
            />
            <p className="max-w-[300px] text-sm leading-[1.55] text-ui-muted">
              Hadafi is a free program for women entrepreneurs by Potential.org: courses, AI tools, mentors and
              community to start and grow your business.
            </p>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ui-text">Share the program</span>
              <div className="flex gap-2">
                {SHARE_LINKS.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className={cn(btn({ variant: 'secondary', size: 'icon' }), 'h-[38px] w-[38px]')}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <nav aria-labelledby="f-links" className="flex flex-col gap-2.5">
            <h2 id="f-links" className="mb-1 text-sm font-semibold text-ui-text">
              Important links
            </h2>
            {IMPORTANT_LINKS.map((l) =>
              l.href.startsWith('http') ? (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              ),
            )}
          </nav>

          <nav aria-labelledby="f-stake" className="flex flex-col gap-2.5">
            <h2 id="f-stake" className="mb-1 text-sm font-semibold text-ui-text">
              Stakeholders
            </h2>
            {STAKEHOLDER_LINKS.map((l) => (
              <a key={l.label} href={l.href} className={linkCls}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 flex-col gap-2.5">
            <h2 className="mb-1 text-sm font-semibold text-ui-text">Get in touch</h2>
            <p className="text-sm leading-normal text-ui-muted">For any inquiries about the program, contact us at:</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className={cn(btn({ variant: 'secondary' }), 'max-w-full self-start')}>
              <Mail className="h-[18px] w-[18px]" aria-hidden />
              <span className="truncate">{CONTACT_EMAIL}</span>
            </a>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-ui-line pt-5 min-[900px]:flex-row min-[900px]:items-center">
          <span className="text-[13px] text-ui-muted">Potential © 2005-{year}. All rights reserved.</span>
          <span className="flex gap-5">
            <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ui-muted hover:text-ui-text">
              Privacy Policy
            </a>
            <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ui-muted hover:text-ui-text">
              Terms of Use
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
