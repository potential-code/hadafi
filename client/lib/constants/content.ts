// Hero section
export const HERO = {
  headline: 'Start and Grow Your Business with Hadafi',
  badge: 'AI-Powered · Free · Global',
  pills: ['AI Mentors', 'Expert Coaching', 'Live Events', 'Free Tools'] as const,
  checklist: [
    'Free training courses and AI tools, no experience needed',
    '1-on-1 sessions with human mentors and industry experts',
    'Join 100,000+ entrepreneurs from 50+ countries',
  ] as const,
  ctaLabel: 'Sign Up Free',
  ctaHref: '/sign-up',
  loginLabel: 'Login',
  loginHref: '/login',
} as const

// About section
export const ABOUT = {
  badge: 'About The Program',
  heading: 'About Hadafi',
  body: "Hadafi, brought to you by the Potential.org Foundation, is a global initiative designed to empower women entrepreneurs to start and grow their businesses. Since 2013, Hadafi has supported over 100,000 women entrepreneurs worldwide. By joining this free program, you'll gain access to short training courses, live events and webinars with industry experts, and future-ready skills to build and scale your business. Benefit from AI mentors and tools, book private sessions with human experts, and access exclusive partner offers and discounts. Hadafi is your gateway to launching with confidence and growing with purpose.",
  ctaLabel: 'Sign Up Free',
  ctaHref: '/sign-up',
  image: '/images/redesign/hadafi-about.png',
} as const

// Journey section
export const JOURNEY = {
  badge: 'Your Hadafi Journey',
  heading: 'Your Hadafi Journey',
  subtext:
    'Embark on a transformative journey with access to cutting-edge AI resources to start or grow your business.',
  items: [
    {
      title: 'Training Courses',
      description: 'Learn business skills and AI adoption through structured, practical courses.',
      image: '/images/redesign/journey-1-training.png',
    },
    {
      title: 'AI Mentors',
      description: 'Get 24/7 guidance from AI-powered coaches across business functions.',
      image: '/images/redesign/journey-2-mentors.png',
    },
    {
      title: 'AI Tools',
      description: 'Access AI tools to build business plans, ideas, and marketing strategies.',
      image: '/images/redesign/journey-3-tools.png',
    },
    {
      title: 'Coaching Support',
      description: 'Book one-on-one sessions with human mentors and industry experts.',
      image: '/images/redesign/journey-4-private.png',
    },
    {
      title: 'Exclusive Offers',
      description: 'Access exclusive discounts and offers from program partners.',
      image: '/images/redesign/journey-5-offers.png',
    },
    {
      title: 'Live Events',
      description: 'Network and learn at live online and in-person events with experts.',
      image: '/images/redesign/journey-6-events.png',
    },
  ],
  image: '/images/redesign/hadafi-journey.png',
  ctaLabel: 'Login',
  ctaHref: '/login',
} as const

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
      image: '/images/redesign/stakeholder-1-experts.png',
    },
    {
      kind: 'vc',
      title: 'Supporters',
      description:
        'Join as a Community Supporter and share the program with your community of women entrepreneurs!',
      ctaLabel: 'Join as a Supporter',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-2-vc.png',
    },
    {
      kind: 'government',
      title: 'Government Program',
      description:
        'Join as a multilateral or government entity to customize the program for women entrepreneurs in your community!',
      ctaLabel: 'Join as a Government',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-3-government.png',
    },
    // --- Hidden until re-enabled: Corporate Program ---
    // {
    //   kind: 'corporate',
    //   title: 'Corporate Program',
    //   description:
    //     'Join as a corporate sponsor to offer your solutions to women-led businesses or support the program!',
    //   ctaLabel: 'Join as a Corporate',
    //   ctaHref: '#',
    //   image: '/images/redesign/stakeholder-4-corporate.png',
    // },
    // --- Hidden until re-enabled: University Program ---
    // {
    //   kind: 'university',
    //   title: 'University Program',
    //   description:
    //     'Join as a university or think tank to share your faculty expertise and further your research on women entrepreneurship!',
    //   ctaLabel: 'Join as a University',
    //   ctaHref: '#',
    //   image: '/images/redesign/stakeholder-5-university.png',
    // },
    // --- Hidden until re-enabled: Incubator Program ---
    // {
    //   kind: 'incubator',
    //   title: 'Incubator Program',
    //   description:
    //     'Join as a chamber, incubator, co-working space, or NGO and extend the program to women entrepreneurs in your community!',
    //   ctaLabel: 'Join as an Incubator',
    //   ctaHref: '#',
    //   image: '/images/redesign/stakeholder-6-incubator.png',
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

// CTA Banner
export const CTA_BANNER = {
  heading: 'Step Into Leadership –\nJoin the Women\'s Empowerment Movement!',
  subtext: 'Join over 100,000 women entrepreneurs worldwide. Access free training, AI mentors, and expert sessions to launch and grow your business.',
  ctaLabel: 'Join the Program for Free!',
  ctaHref: '/sign-up',
  loginLabel: 'Already a member? Log in',
  loginHref: '/login',
} as const

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

// Human Mentors — real people (avatars served from legacy domain until migrated)
export const HUMAN_MENTORS = {
  badge: 'Human Mentors',
  heading: 'Human Mentors',
  subtext: 'Book private one-on-one sessions with verified business experts.',
  categories: ['All', 'Strategy', 'Marketing', 'Finance', 'Legal', 'Leadership', 'Operations'],
  // TODO: Update emails to match actual mentor user accounts in the DB
  mentors: [
    {
      name: 'Monika Papadopoulou',
      email: 'monika.papadopoulou@hadafi.potential.org',
      specialty: 'Leadership, Sales, Branding',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/monika.jpg',
      linkedin: 'https://www.linkedin.com/in/monika-papadopoulou-26484191/',
      featured: true,
    },
    {
      name: 'Ziad Banna',
      email: 'ziad.banna@hadafi.potential.org',
      specialty: 'Project Management, Leadership, Accounting',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/ziadbanna.jpg',
      linkedin: 'https://www.linkedin.com/in/ziad-b-a7206b24/',
      featured: true,
    },
    {
      name: 'Celine Chami',
      email: 'celine.chami@hadafi.potential.org',
      specialty: 'Social Media, Marketing, Communication',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Celine-card.jpg',
      linkedin: 'https://www.linkedin.com/in/celinechami',
      featured: true,
    },
    {
      name: 'Alla Musnicka',
      email: 'alla.musnicka@hadafi.potential.org',
      specialty: 'Sales, Marketing, PR',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Alla-card.jpg',
      linkedin: 'https://www.linkedin.com/in/alla-marija-musnicka-21154224',
      featured: true,
    },
    {
      name: 'Ivan Kraemer',
      email: 'ivan.kraemer@hadafi.potential.org',
      specialty: 'ICT, Sales, Team Building',
      category: 'Operations',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/06/Ivan-Kraemer-smeep-card.jpg',
      linkedin: 'https://www.linkedin.com/in/ivankraemer/',
      featured: true,
    },
    {
      name: 'Mita Srinivasan',
      email: 'mita.srinivasan@hadafi.potential.org',
      specialty: 'PR, Social Media, Communications',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/06/Mita-Smeep-card.jpg',
      linkedin: 'https://www.linkedin.com/in/mitasrinivasan/',
      featured: true,
    },
    {
      name: 'Shahrazad Shehab',
      email: 'shahrazad.shehab@hadafi.potential.org',
      specialty: 'PR, Social Media',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/06/Shahrazad-Shehab-card-1.png',
      linkedin: 'https://www.linkedin.com/in/shahrazad-shehab/',
      featured: false,
    },
    {
      name: 'Sawsan Abbasy',
      email: 'sawsan.abbasy@hadafi.potential.org',
      specialty: 'Strategy, Sales',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/05/Sawsan-Abbasy-300x300-1.png',
      linkedin: 'https://www.linkedin.com/in/sawsanabbasi/',
      featured: false,
    },
    {
      name: 'Umair Azhar',
      email: 'umair.azhar@hadafi.potential.org',
      specialty: 'Insurance, Financials',
      category: 'Finance',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/Umair.jpg',
      linkedin: 'https://www.linkedin.com/in/umair-azhar-b112117b/',
      featured: false,
    },
    {
      name: 'Ghinwa Abi Zeid',
      email: 'ghinwa.abizeid@hadafi.potential.org',
      specialty: 'Legal, Partnerships, Company Setup',
      category: 'Legal',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/ghenwa.jpg',
      linkedin: 'https://www.linkedin.com/in/ghinwa-abi-zeid-7a129016/',
      featured: false,
    },
    {
      name: 'Albert Jose',
      email: 'albert.jose@hadafi.potential.org',
      specialty: 'Accounting, Auditing, Tax',
      category: 'Finance',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/Albert-card.png',
      linkedin: 'https://www.linkedin.com/in/al-khazraji-audit-b08523168/',
      featured: false,
    },
    {
      name: 'Nika Sturm',
      email: 'nika.sturm@hadafi.potential.org',
      specialty: 'Strategy',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/08/Nika-Sturm.png',
      linkedin: 'https://www.linkedin.com/in/nikasturm/',
      featured: false,
    },
    {
      name: 'Ahmed Alsuleimani',
      email: 'ahmed.alsuleimani@hadafi.potential.org',
      specialty: 'Leadership, Strategy',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/08/Ahmed-Alsuleimani.png',
      linkedin: 'https://www.linkedin.com/in/ahmed-alsuleimani-42a04066',
      featured: false,
    },
    {
      name: 'Samer Hamadeh',
      email: 'samer.hamadeh@hadafi.potential.org',
      specialty: 'Product Development, Strategy, Business Development',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Samer-card.jpg',
      linkedin: 'https://www.linkedin.com/in/samerhamadeh/',
      featured: false,
    },
    {
      name: 'Kirsten Westholter',
      email: 'kirsten.westholter@hadafi.potential.org',
      specialty: 'Design Thinking, Business Transformation, Strategy',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Kirsten-card.jpg',
      linkedin: 'https://www.linkedin.com/in/kirstenwestholter/',
      featured: false,
    },
    {
      name: 'Tony Feghali',
      email: 'tony.feghali@hadafi.potential.org',
      specialty: 'Strategy, Leadership, Sales',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Tony-card.jpg',
      linkedin: 'https://www.linkedin.com/in/tonyfeghali/',
      featured: false,
    },
    {
      name: 'Lara Haddad',
      email: 'lara.haddad@hadafi.potential.org',
      specialty: 'Strategy & Operations',
      category: 'Strategy',
      avatar: '/assets/mentors/mentor-placeholder.jpg',
      linkedin: 'https://www.linkedin.com/in/lara-haddad/',
      featured: false,
    },
  ],
  ctaLabel: 'Book Session',
  ctaHref: '#',
} as const

// Special Offers — section-level copy only; offer data comes from the API
export const SPECIAL_OFFERS = {
  badge: 'Special Offers',
  heading: 'Special Offers',
  subtext: 'Explore exclusive discounts and deals from our program partners — curated for women entrepreneurs.',
  ctaLabel: 'Reveal Coupon',
  ctaHref: '#',
} as const

// Community section
export const COMMUNITY = {
  badge: 'Meet Our Community',
  heading: 'Meet Our Community',
  subtext:
    'Since 2013, Hadafi has supported over 100,000 women entrepreneurs around the globe. We are eager to share your story and empower more women to achieve their business goals.',
  stats: [
    { value: 100000, label: 'Women Entrepreneurs Reached', display: '100,000+', animate: true },
    { value: 2013, label: 'Year Founded', display: 'Since 2013', animate: false },
    { value: 50, label: 'Countries', display: '50+', animate: true },
  ],
  image: '/images/community-map.png',
} as const

// CTA Final
export const CTA_FINAL = {
  heading: 'Empower Yourself – Join Hadafi for Free!',
  subtext: 'Join thousands of women entrepreneurs already building and growing their businesses with Hadafi.',
  ctaLabel: 'Sign Up Free',
  ctaHref: '/sign-up',
  loginLabel: 'Login',
  loginHref: '/login',
} as const

// Centralized redesign asset paths + alt text
export const REDESIGN_ASSETS = {
  hero: { src: '/images/redesign/hadafi-hero.png', alt: 'Hadafi women entrepreneurs collaborating' },
  heroBg: {
    src: '/images/redesign/hero-bg.png',
    alt: '',
  },
  aboutGlobe: { src: '/images/redesign/hadafi-about.png', alt: 'Hadafi women entrepreneurs in a business meeting' },
  journeyFlow: {
    src: '/images/redesign/hadafi-journey.png',
    alt: 'Hadafi journey flow diagram',
  },
  additionalResources: {
    src: '/images/redesign/additional-resources.png',
    alt: 'Additional resources from AWS, Cisco, Potential and Schneider Electric',
  },
  worldMap: { src: '/images/redesign/world-map.png', alt: 'Global community map' },
  chatbotOrb: { src: '/images/redesign/chatbot-orb.png', alt: 'AI assistant orb avatar' },
  logo: { src: '/images/hadafi-logo.png', alt: 'Hadafi Women Entrepreneurship Program' },
} as const

// Rotating testimonials for auth-page brand panel
export const AUTH_TESTIMONIALS = [
  {
    quote:
      'Hadafi gave me the tools and confidence to launch my business. Within 3 months I had my first 10 clients.',
    name: 'Sara Al-Rashidi',
    role: 'Founder, Bloom Boutique',
  },
  {
    quote:
      'The AI tools and mentor sessions are invaluable. Getting them free through Hadafi changed everything for my business.',
    name: 'Nour Khalil',
    role: 'CEO, GreenLeaf Naturals',
  },
  {
    quote:
      "Hadafi's training helped me finally understand digital marketing. My sales grew 40% in the first quarter.",
    name: 'Amira Hassan',
    role: 'Founder, Artisan Home Co.',
  },
] as const

// Newsletter
export const NEWSLETTER = {
  heading: 'Stay in the loop',
  body: 'Monthly AI playbooks, partner offers, and live event invites — straight to your inbox.',
  placeholder: 'you@example.com',
  ctaLabel: 'Subscribe',
} as const

// Footer
export const FOOTER = {
  contactEmail: 'hadafi@potential.com',
  copyright: 'Potential © 2005-2025 | All Rights Reserved.',
  contactHeading: 'Get in Touch',
  contactBody: 'For any inquiries about the program, please contact us at:',
} as const
