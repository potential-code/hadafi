export type NavLink =
  | { label: string; href: string }
  | {
      label: string
      children: { label: string; href: string; description?: string }[]
    }

export const NAV_LINKS: NavLink[] = [
  { label: 'About', href: '#about' },
  { label: 'Journey', href: '#journey' },
  { label: 'Stakeholder', href: '#stakeholder' },
  { label: 'Courses', href: '#courses' },
  {
    label: 'Components',
    children: [
      { label: 'Live Events', href: '#events', description: 'Webinars & replays' },
      { label: 'AI Mentors', href: '#ai-mentors', description: 'On-demand AI guidance' },
      { label: 'AI Chatbot', href: '#ai-assistant', description: 'Ask Hadafi anything' },
      { label: 'Human Mentors', href: '#mentors', description: 'Real expert mentors' },
      { label: 'Offers', href: '#offers', description: 'Perks & partner deals' },
    ],
  },
  { label: 'Community', href: '#community' },
]

export const FOOTER_LINKS = {
  importantLinks: [
    { label: 'Home Page', href: '/' },
    { label: 'Login', href: '/login' },
    { label: 'Register', href: '/sign-up' },
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms & Conditions', href: '#' },
    { label: 'FAQs', href: '#' },
  ],
  stakeholderLinks: [
    { label: 'Experts', href: '/#stakeholder' },
    { label: 'VCs', href: '/#stakeholder' },
    { label: 'Government Entities', href: '/#stakeholder' },
    { label: 'Corporate Sponsors', href: '/#stakeholder' },
    { label: 'Universities', href: '/#stakeholder' },
    { label: 'Incubators', href: '/#stakeholder' },
  ],
} as const

export const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://www.facebook.com/hadafi.me/', icon: 'facebook' },
  { label: 'Twitter / X', href: 'https://x.com/hadafime', icon: 'twitter' },
  { label: 'Instagram', href: 'https://www.instagram.com/hadafi_program', icon: 'instagram' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/potential/', icon: 'linkedin' },
  { label: 'WhatsApp', href: '#', icon: 'message-circle' },
] as const
