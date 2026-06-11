'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1B2A] to-[#0D0008] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-4">404</h1>
        <p className="text-gray-300 mb-8">Page not found</p>
        <Link
          href="/"
          className="bg-brand-primary hover:bg-brand-primary-dark text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors inline-block"
        >
          Back home
        </Link>
      </div>
    </div>
  )
}
