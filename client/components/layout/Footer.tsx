'use client'

import { useState } from 'react'
import { Facebook, Linkedin, Mail, ArrowUpRight, Send, Check } from 'lucide-react'
import { FOOTER_LINKS } from '@/lib/constants/navigation'
import { FOOTER, NEWSLETTER, REDESIGN_ASSETS } from '@/lib/constants/content'

const SHARE_URL = 'https://smeep.potential.org'
const SHARE_TEXT =
  'Increase your sales and reduce your costs by registering in the SME empowerment program from potential.com'
const LI_SUMMARY = 'Evolve your business to the new post-COVID-19 world'

const SHARE_LINKS = [
  {
    label: 'Share on X',
    href: `https://twitter.com/share?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    Icon: (props: { className?: string }) => (
      <svg viewBox="0 0 24 24" aria-hidden className={props.className} fill="currentColor">
        <path d="M18.244 2H21.5l-7.59 8.674L22.75 22H15.81l-5.43-7.097L4.16 22H.9l8.114-9.273L1.25 2h7.094l4.91 6.49L18.244 2zm-1.144 18h1.83L7.01 4H5.07l12.03 16z" />
      </svg>
    ),
  },
  {
    label: 'Share on Facebook',
    href: `https://www.facebook.com/sharer.php?u=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    Icon: ({ className }: { className?: string }) => <Facebook className={className} />,
  },
  {
    label: 'Share on LinkedIn',
    href: `https://www.linkedin.com/cws/share?url=${encodeURIComponent(SHARE_URL)}&summary=${encodeURIComponent(LI_SUMMARY)}`,
    Icon: ({ className }: { className?: string }) => <Linkedin className={className} />,
  },
  {
    label: 'Share on WhatsApp',
    href: `https://api.whatsapp.com/send?phone=&text=${encodeURIComponent(`${SHARE_TEXT} : ${SHARE_URL}`)}`,
    Icon: (props: { className?: string }) => (
      <svg viewBox="0 0 24 24" aria-hidden className={props.className} fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.064 2.876 1.213 3.074c.149.198 2.095 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.892A11.821 11.821 0 0 0 20.464 3.488" />
      </svg>
    ),
  },
] as const

export function Footer() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setSubscribed(true)
    setTimeout(() => {
      setSubscribed(false)
      setEmail('')
    }, 2400)
  }

  return (
    <footer className="relative bg-brand-dark text-white overflow-hidden">
      <div className="absolute inset-0 bg-mesh-dark opacity-90" />
      <div className="absolute inset-0 bg-noise opacity-[0.03] mix-blend-overlay pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-10">
        {/* Newsletter */}
        <div className="mb-16 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 sm:p-10 backdrop-blur-md grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div>
            <h3 className="text-2xl sm:text-3xl font-bold leading-tight">
              {NEWSLETTER.heading}{' '}
              <span className="text-gradient-magenta">— stay sharp.</span>
            </h3>
            <p className="text-white/60 text-sm mt-3 max-w-md leading-relaxed">{NEWSLETTER.body}</p>
          </div>
          <form onSubmit={handleSubscribe} className="relative">
            <label htmlFor="footer-newsletter" className="sr-only">
              Email address
            </label>
            <div className="relative flex items-center rounded-2xl bg-white/5 border border-white/15 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/30 transition-all overflow-hidden">
              <Mail className="absolute left-4 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                id="footer-newsletter"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={NEWSLETTER.placeholder}
                className="flex-1 bg-transparent pl-11 pr-3 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none"
              />
              <button
                type="submit"
                disabled={subscribed}
                className="m-1.5 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-dark disabled:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 transition-colors shadow-lg"
              >
                {subscribed ? (
                  <>
                    <Check className="w-4 h-4" /> Subscribed
                  </>
                ) : (
                  <>
                    {NEWSLETTER.ctaLabel} <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-white/40 mt-2 px-1">No spam. Unsubscribe anytime.</p>
          </form>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Brand */}
          <div className="md:col-span-4">
            <a href="/" className="inline-block mb-5">
              <img src={REDESIGN_ASSETS.logo.src} alt={REDESIGN_ASSETS.logo.alt} className="h-11 brightness-0 invert" />
            </a>
            <p className="text-white/60 text-sm leading-relaxed max-w-xs">
              The SME Empowerment Program — free AI training, mentors, and community for SMEs and
              startups worldwide.
            </p>

            {/* Share */}
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 mt-7 mb-3">
              Share the program
            </p>
            <div className="flex gap-2">
              {SHARE_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-brand-primary hover:border-brand-primary text-white/70 hover:text-white flex items-center justify-center transition-all"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="md:col-span-3">
            <h3 className="font-semibold text-sm uppercase tracking-[0.15em] mb-5 text-white/90">
              Important Links
            </h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.importantLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="group inline-flex items-center text-white/60 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                    <ArrowUpRight className="ml-1 w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h3 className="font-semibold text-sm uppercase tracking-[0.15em] mb-5 text-white/90">
              Stakeholders
            </h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.stakeholderLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="group inline-flex items-center text-white/60 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                    <ArrowUpRight className="ml-1 w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-3">
            <h3 className="font-semibold text-sm uppercase tracking-[0.15em] mb-5 text-white/90">
              {FOOTER.contactHeading}
            </h3>
            <p className="text-white/60 text-sm mb-4 leading-relaxed">{FOOTER.contactBody}</p>
            <a
              href={`mailto:${FOOTER.contactEmail}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary/15 border border-brand-primary/30 hover:bg-brand-primary hover:border-brand-primary text-brand-primary-light hover:text-white text-sm font-medium transition-all"
            >
              <Mail className="w-4 h-4" />
              {FOOTER.contactEmail}
            </a>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-white/10 flex items-center justify-center">
          <p className="text-white/40 text-xs">{FOOTER.copyright}</p>
        </div>
      </div>
    </footer>
  )
}
