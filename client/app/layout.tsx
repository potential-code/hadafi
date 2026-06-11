import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SMEEP — SME Empowerment Program | Powered by AI',
  description:
    'Discover how to integrate AI into your business processes to save costs, increase revenue, and stay ahead in the future of business—free with the SME Empowerment Program.',
  keywords: 'SME, AI, business empowerment, startup, digital transformation, AI tools',
  openGraph: {
    title: 'SMEEP — SME Empowerment Program',
    description: 'Free AI-powered program for SMEs and startups worldwide.',
    type: 'website',
  },
  icons: {
    icon: '/images/SMEEP-logo.png',
    apple: '/images/SMEEP-logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  )
}
