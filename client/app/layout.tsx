import type { Metadata } from 'next'
import { Geist, Noto_Sans, Noto_Sans_Arabic, Noto_Sans_Devanagari } from 'next/font/google'
import './globals.css'
import { SITE_URL } from '@/lib/seo'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })

// Glyph fallbacks for the Arabic, Urdu and Hindi (Learn with Hana) text Geist
// lacks (--font-ui in globals.css). Self-hosted with the site, split by
// unicode-range, so a browser downloads a file only when the page shows those
// characters: nothing on an English page. Not preloaded, because Geist is the
// font for Latin text. (next/font needs literal options in each call.)
const notoSans = Noto_Sans({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto',
})
const notoSansArabic = Noto_Sans_Arabic({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-arabic',
})
const notoSansDevanagari = Noto_Sans_Devanagari({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-devanagari',
})
const fontVariables = [geist, notoSans, notoSansArabic, notoSansDevanagari].map((f) => f.variable).join(' ')

// Icons and the shared-link image are files in this folder (favicon.ico, icon.svg,
// apple-icon.png, opengraph-image.jpg, twitter-image.jpg), as on SMEEP; Next adds
// their tags. metadataBase makes the image URLs absolute, which link previews need.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each page sets its own title, shown as "Courses | Hadafi"; the homepage keeps the full name.
  title: { default: 'Hadafi – Women Entrepreneurship Program', template: '%s | Hadafi' },
  description:
    'Hadafi empowers women entrepreneurs with free AI tools, training courses, mentorship, and partner resources. Start or grow your business today.',
  keywords: 'Hadafi, women entrepreneurship, AI, business empowerment, women entrepreneurs, free program',
  openGraph: {
    title: 'Hadafi – Women Entrepreneurship Program',
    description: 'Free courses, AI tools and mentors for women entrepreneurs. Powered by Potential.org.',
    type: 'website',
    siteName: 'Hadafi',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hadafi – Women Entrepreneurship Program',
    description: 'Free courses, AI tools and mentors for women entrepreneurs. Powered by Potential.org.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`scroll-smooth ${fontVariables}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {/* Saved dark mode for the signed-in app, applied before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(/^\\/(dashboard|mentor\\/dashboard|admin)(\\/|$)/.test(location.pathname)&&localStorage.getItem('hadafi.theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  )
}
