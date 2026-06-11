import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from '@/components/sections/HeroSection'
import { AboutSection } from '@/components/sections/AboutSection'
import { JourneySection } from '@/components/sections/JourneySection'
import { StakeholderSection } from '@/components/sections/StakeholderSection'
import { CtaBannerSection } from '@/components/sections/CtaBannerSection'
import { CoursesSection } from '@/components/sections/CoursesSection'
import { AdditionalResourcesSection } from '@/components/sections/AdditionalResourcesSection'
import { LiveEventsSection } from '@/components/sections/LiveEventsSection'
import { AiMentorsSection } from '@/components/sections/AiMentorsSection'
import { ChatbotSection } from '@/components/sections/ChatbotSection'
import { HumanMentorsSection } from '@/components/sections/HumanMentorsSection'
import { SpecialOffersSection } from '@/components/sections/SpecialOffersSection'
import { CommunitySection } from '@/components/sections/CommunitySection'
import { CtaFinalSection } from '@/components/sections/CtaFinalSection'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <AboutSection />
        <JourneySection />
        <StakeholderSection />
        <CtaBannerSection />
        <CoursesSection />
        <AdditionalResourcesSection />
        <LiveEventsSection />
        <AiMentorsSection />
        <ChatbotSection />
        <HumanMentorsSection />
        <SpecialOffersSection />
        <CommunitySection />
        <CtaFinalSection />
      </main>
      <Footer />
    </>
  )
}
