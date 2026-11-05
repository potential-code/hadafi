import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })

// Icons and the shared-link image are files in this folder (favicon.ico, icon.svg,
// apple-icon.png, opengraph-image.jpg, twitter-image.jpg), as on SMEEP; Next adds
// their tags. metadataBase makes the image URLs absolute, which link previews need.
export const metadata: Metadata = {
  metadataBase: new URL('https://hadafi.potential.org'),
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
    <html lang="en" className={`scroll-smooth ${geist.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {/* Saved dark mode for the signed-in app, applied before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(/^\\/(dashboard|mentor\\/dashboard|admin)(\\/|$)/.test(location.pathname)&&localStorage.getItem('hadafi.theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  )
}
