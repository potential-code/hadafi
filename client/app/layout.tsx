import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })

export const metadata: Metadata = {
  title: 'Hadafi – Women Entrepreneurship Program',
  description:
    'Hadafi empowers women entrepreneurs with free AI tools, training courses, mentorship, and partner resources. Start or grow your business today.',
  keywords: 'Hadafi, women entrepreneurship, AI, business empowerment, women entrepreneurs, free program',
  openGraph: {
    title: 'Hadafi – Women Entrepreneurship Program',
    description: 'Free AI-powered program empowering women entrepreneurs worldwide.',
    type: 'website',
  },
  icons: {
    icon: '/images/hadafi-logo.png',
    apple: '/images/hadafi-logo.png',
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
