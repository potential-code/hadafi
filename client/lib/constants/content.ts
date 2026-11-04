// Stakeholder section
export const STAKEHOLDER = {
  badge: 'Become a Program Stakeholder',
  heading: 'Become a Program Stakeholder',
  intro:
    'Are you a woman entrepreneur? If yes, register here. Otherwise, choose from the below options that best suit your engagement.',
  smeCtaLabel: 'Register as Entrepreneur',
  smeCtaHref: '/sign-up',
  cards: [
    {
      kind: 'expert',
      title: 'Experts Program',
      description:
        'Join as an individual expert, mentor, coach, or lecturer to share your expertise with our community of women entrepreneurs!',
      ctaLabel: 'Join as an Expert',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-1-experts.webp',
    },
    {
      kind: 'vc',
      title: 'Supporters',
      description:
        'Join as a Community Supporter and share the program with your community of women entrepreneurs!',
      ctaLabel: 'Join as a Supporter',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-2-vc.webp',
    },
    {
      kind: 'government',
      title: 'Government Program',
      description:
        'Join as a multilateral or government entity to customize the program for women entrepreneurs in your community!',
      ctaLabel: 'Join as a Government',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-3-government.webp',
    },
    // --- Hidden until re-enabled: Corporate Program ---
    // {
    //   kind: 'corporate',
    //   title: 'Corporate Program',
    //   description:
    //     'Join as a corporate sponsor to offer your solutions to women-led businesses or support the program!',
    //   ctaLabel: 'Join as a Corporate',
    //   ctaHref: '#',
    //   image: '/images/redesign/stakeholder-4-corporate.webp',
    // },
    // --- Hidden until re-enabled: University Program ---
    // {
    //   kind: 'university',
    //   title: 'University Program',
    //   description:
    //     'Join as a university or think tank to share your faculty expertise and further your research on women entrepreneurship!',
    //   ctaLabel: 'Join as a University',
    //   ctaHref: '#',
    //   image: '/images/redesign/stakeholder-5-university.webp',
    // },
    // --- Hidden until re-enabled: Incubator Program ---
    // {
    //   kind: 'incubator',
    //   title: 'Incubator Program',
    //   description:
    //     'Join as a chamber, incubator, co-working space, or NGO and extend the program to women entrepreneurs in your community!',
    //   ctaLabel: 'Join as an Incubator',
    //   ctaHref: '#',
    //   image: '/images/redesign/stakeholder-6-incubator.webp',
    // },
  ],
} as const

export type StakeholderKind =
  | 'expert'
  | 'vc'
  | 'government'
  | 'corporate'
  | 'university'
  | 'incubator'

// Courses section — condensed to 3 tabs
export const COURSES = {
  badge: "The Women Entrepreneur's Journey",
  heading: "The Women Entrepreneur's Journey",
  categories: [
    {
      name: 'Transform with AI',
      modules: [
        {
          title: 'AI for Growth: The Practical Women Entrepreneurs Guide',
          units: [
            'The AI Opportunity for Women Entrepreneurs',
            'AI Readiness - Upskill Your Teams',
            'Augmented Intelligence - Chat-Based Tools',
            'Automating Business Processes with AI Agentic Tools',
            'Leveraging Local LLM and Hybrid Models',
            'Implementing AI in Your Business',
          ],
        },
      ],
    },
    {
      name: 'Hadafi Business Model',
      modules: [
        {
          title: 'Evolving Your Business',
          units: [
            'Overview about the program',
            'Business Strategy',
            'Innovative offer to increase sales',
            'The online marketing campaign',
            'Project Management',
            'ICT setup',
            'Company financials',
            'Funding and Financing',
          ],
        },
        {
          title: 'Online Presence',
          units: [
            'Above the fold',
            'Conveying your credibility',
            'Your offering',
            'Selling Online',
            'Your branding',
          ],
        },
        {
          title: 'Digital Marketing',
          units: [
            'Marketing Plan',
            'Organizing your Marketing Department',
            'Digital Marketing Plan',
            '5 Key Marketing Metrics that Actually Matter',
            'Email Marketing Strategies',
            'Social Media Results',
            'Essential Search Engine Optimization Strategies',
            'Content Marketing Superiority',
            'Revenue Generation Models',
            '3 Quick Tips To Succeed with Inbound Marketing',
            '3 Tips on How to Run an Outbound Marketing Campaign',
            '3 Reasons on Why you Need to Podcast',
          ],
        },
        {
          title: 'Digital Content',
          units: [
            'Identifying your keywords and useful information',
            'Creating Social Media Posts',
            'Creating Videos',
            'Creating blog posts',
          ],
        },
      ],
    },
    {
      name: 'Additional Courses',
      modules: [
        {
          title: 'Managing your Cash Flow',
          units: [
            '5 Tips for Getting Paid Quickly',
            '5 Steps for Managing your Cash Flow',
            '5 Ways in which Business Cards Offer Better Advantages than Checks',
            '7 Reasons Why you should Prepare a Cash Flow Projection',
            '3 Essential Sections of a Cash Flow Statement',
          ],
        },
        {
          title: 'Negotiation Skills',
          units: [
            '5 Ways Negotiation Enhances Any Discussion',
            '5 Pillars a Negotiation can\'t Work Without',
            '5 Big NOs to Avoid During Negotiation',
            '5 Body Language Hacks to Improve your Negotiation Skills',
            '4 Traps to Escape During a Negotiation',
            '4 Steps to Handle Negotiation Anxiety',
          ],
        },
        {
          title: 'Starting a Blog Online',
          units: [
            '5 Ways a Blog Can Improve Your Service',
            '3 Ways to Create a Successful Blog',
            '4 Tactics to Attracting Improved Readership',
            '3 Steps to Portray Your Unique Story',
            '3 Reasons to Maintain Blog Post Consistency',
            '3 Choices to Make When Starting Your Blog',
            '5 Steps to Getting Your Blog Started',
            '12 Steps to Self-Hosting Your Blog',
          ],
        },
      ],
    },
  ],
} as const

// AI Mentors — gif avatars from api.potential.com
export const AI_MENTORS = {
  badge: 'AI Mentors',
  heading: 'AI Mentors',
  subtext: 'Get instant guidance from our AI-powered business mentors, available 24/7.',
  mentors: [
    {
      name: 'Corporate Security & Safety Coach',
      slug: 'corporate-security',
      botId: '64b78f8ea3495eade7931f1f',
      specialty: 'Risk Management',
      description: 'Expert guidance on corporate security policies and safety protocols.',
      avatar:
        'https://api.potential.com/static/mentors/1689755965063-Brown%20Neutral%20Minimalist%20Animated%20Self%20Care%20Instagram%20Post.gif',
    },
    {
      name: 'Enterprise Sales Coach',
      slug: 'sales-coach',
      botId: '64b7b59c2d7b52ec97f3a258',
      specialty: 'Sales Strategy',
      description: 'Strategies for scaling enterprise sales and closing high-value deals.',
      avatar: 'https://api.potential.com/static/mentors/1689761179954-Sales%20Coach.gif',
    },
    {
      name: 'Marketing Coach',
      slug: 'marketing-coach',
      botId: '64b7a7682d7b52ec97f3a21d',
      specialty: 'Marketing',
      description: 'Data-driven marketing strategies to grow your brand and customer base.',
      avatar: 'https://api.potential.com/static/mentors/1689757544593-Marketing%20Coach.gif',
    },
    {
      name: 'Legal Consultant',
      slug: 'legal-consultant',
      botId: '6540b46f64bed7823ecd4209',
      specialty: 'Legal',
      description: 'Navigate business legalities, contracts, and compliance requirements.',
      avatar:
        'https://api.potential.com/static/mentors/1698739311601-Potential.com%20AI%20Bots%20.jpg',
    },
    {
      name: 'Sustainability Bot',
      slug: 'sustainability-bot',
      botId: '64cb87a1293c2813e908395e',
      specialty: 'Sustainability',
      description: 'Integrate sustainable practices that reduce costs and boost reputation.',
      avatar:
        'https://api.potential.com/static/mentors/1691060123982-Brown%20Neutral%20Minimalist%20Animated%20Self%20Care%20Instagram%20Post.gif',
    },
    {
      name: 'Leadership Mentor',
      slug: 'leadership-mentor',
      botId: '64b79d632d7b52ec97f3a204',
      specialty: 'Leadership',
      description: 'Develop leadership skills to inspire teams and drive organizational growth.',
      avatar: 'https://api.potential.com/static/mentors/1689756174815-Leadership%20Coach.gif',
    },
  ],
  ctaLabel: 'Chat Now',
  ctaHref: '#',
} as const

// Chatbot Section
export const CHATBOT = {
  badge: 'AI Business Assistant',
  heading: 'Your AI Business Assistant',
  subtext:
    'Ask anything — our AI will generate a Business Plan, Business Idea, Product Proposal, or Marketing Plan tailored to your needs.',
  placeholder:
    'e.g. "Create a business plan for a sustainable clothing brand in Dubai"',
  capabilities: [
    'Business Plan Generator',
    'Business Idea Generator',
    'Product Proposal Tool',
    'Marketing Plan Creator',
  ],
} as const

// Centralized redesign asset paths + alt text
export const REDESIGN_ASSETS = {
  hero: { src: '/images/redesign/hadafi-hero.webp', alt: 'Hadafi women entrepreneurs collaborating' },
  heroBg: {
    src: '/images/redesign/hero-bg.webp',
    alt: '',
  },
  aboutGlobe: { src: '/images/redesign/hadafi-about.webp', alt: 'Hadafi women entrepreneurs in a business meeting' },
  journeyFlow: {
    src: '/images/redesign/hadafi-journey.webp',
    alt: 'Hadafi journey flow diagram',
  },
  additionalResources: {
    src: '/images/redesign/additional-resources.webp',
    alt: 'Additional resources from AWS, Cisco, Potential and Schneider Electric',
  },
  worldMap: { src: '/images/redesign/world-map.webp', alt: 'Global community map' },
  chatbotOrb: { src: '/images/redesign/chatbot-orb.webp', alt: 'AI assistant orb avatar' },
  logo: { src: '/images/hadafi-logo.png', alt: 'Hadafi Women Entrepreneurship Program' },
} as const

