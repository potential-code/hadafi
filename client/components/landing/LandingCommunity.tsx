import Link from 'next/link'
import { Facebook, Instagram, Linkedin } from 'lucide-react'
import { btn } from '@/components/kit'
import { SOCIAL_LINKS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { CONTACT_EMAIL } from './legal'

export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  )
}

const ICONS: Record<string, (p: { className?: string }) => React.ReactNode> = {
  facebook: Facebook,
  twitter: XIcon,
  instagram: Instagram,
  linkedin: Linkedin,
}

/** Hadafi's own channels (entries without a real address are left out). */
const FOLLOW = SOCIAL_LINKS.filter((s) => s.href.startsWith('http') && ICONS[s.icon]).map((s) => ({
  ...s,
  label: s.label === 'Twitter / X' ? 'X' : s.label,
}))

/** Community, the program's channels and the closing sign-up call. */
export function LandingCommunity() {
  return (
    <section id="community" aria-labelledby="h-community" className="scroll-mt-[68px] py-9">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-stretch gap-6 px-4 min-[900px]:grid-cols-2 min-[900px]:px-10">
        <div className="flex min-w-0 flex-col justify-center gap-3.5">
          <h2 id="h-community" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
            Meet our community
          </h2>
          <p className="text-base leading-[1.55] text-ui-muted">
            Women entrepreneurs from around the world learn together here. We are eager to share your story and
            expertise with the community.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="self-start text-sm font-semibold text-ui-brand-text [overflow-wrap:anywhere] hover:underline"
          >
            Share your story with {CONTACT_EMAIL}
          </a>
          {FOLLOW.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-t border-ui-line pt-4">
              <p className="text-sm text-ui-muted">
                <strong className="font-semibold text-ui-text">Stay in the loop.</strong> Follow Hadafi for new
                courses, live event invites and member offers.
              </p>
              <ul className="flex flex-wrap gap-2">
                {FOLLOW.map((s) => {
                  const Icon = ICONS[s.icon]
                  return (
                    <li key={s.href}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9')}
                      >
                        <Icon className="h-4 w-4" />
                        {s.label}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4 rounded-[14px] border border-ui-brand bg-ui-brand p-7 text-white">
          <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]">
            Start and grow your business. Join the program for free.
          </h2>
          <p className="text-[15px] leading-[1.55] text-[#fbe3ef]">
            Learn, get mentored and connect with other women entrepreneurs building their businesses with the power of
            AI.
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            <Link href="/sign-up" className={cn(btn(), 'border-white bg-white text-[#c8106a] hover:bg-[#fbe3ef]')}>
              Sign up now
            </Link>
            <Link href="/login" className={cn(btn(), 'border-white/50 bg-transparent text-white hover:bg-white/10')}>
              Log in
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
