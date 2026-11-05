import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingCourses } from '@/components/landing/LandingCourses'
import { LandingAiMentors, LandingHumanMentors } from '@/components/landing/LandingMentors'
import { LandingEventsOffers } from '@/components/landing/LandingEventsOffers'
import { LandingStakeholders } from '@/components/landing/LandingStakeholders'
import { LandingCommunity } from '@/components/landing/LandingCommunity'

/**
 * Public homepage. About and the program journey are folded into the hero,
 * Hana's assistant sits beside the AI mentors, events and offers share a
 * section, and the two call-to-action banners became the community panel.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-ui-bg font-sans text-ui-text">
      <a
        href="#main"
        className="sr-only z-50 rounded-[10px] bg-ui-surface px-4 py-2 text-sm font-semibold text-ui-text focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <LandingHero />
        <LandingCourses />
        <LandingAiMentors />
        <LandingHumanMentors />
        <LandingEventsOffers />
        <LandingStakeholders />
        <LandingCommunity />
      </main>
      <Footer />
    </div>
  )
}
