// Hero section
export const HERO = {
  headline: 'Empower Your Business with AI: Transform, Automate, and Grow',
  subtext:
    'Discover how to integrate AI into your business processes to save costs, increase revenue, and stay ahead in the future of business—free with the SME Empowerment Program.',
  ctaLabel: 'Get Started',
  ctaHref: '/sign-up',
  loginLabel: 'Login',
  loginHref: '/login',
} as const

// About section
export const ABOUT = {
  badge: 'About The Program',
  heading: 'About The Program',
  body: "The SME Empowerment Program, brought to you by the Potential.org Foundation, is a global initiative designed to help SMEs and startups harness the power of AI to transform their businesses. By joining this free program, you'll gain access to short training courses, events & live webinar sessions with industry experts, and future-ready skills to integrate AI into your processes and transform business models. Benefit from AI mentors and tools to automate workflows, book private sessions with human experts, and access exclusive partner offers and discounts. This program is your gateway to driving efficiency, cutting costs, and unlocking new revenue streams—empowering you to thrive in today's AI-driven economy.",
  ctaLabel: 'Get Started',
  ctaHref: '/sign-up',
  image: '/images/about-banner.png',
} as const

// Journey section
export const JOURNEY = {
  badge: 'Your AI-powered Journey',
  heading: 'Your AI-powered Journey',
  subtext:
    'Embark on a transformative journey with access to cutting-edge AI resources to elevate your business.',
  items: [
    {
      title: 'AI Training Courses',
      description: 'Learn to integrate AI and future-ready skills.',
      image: '/images/redesign/journey-1-training.png',
    },
    {
      title: 'AI Mentors',
      description: 'Guidance for automating workflows.',
      image: '/images/redesign/journey-2-mentors.png',
    },
    {
      title: 'AI Tools',
      description: 'Automate and optimize operations.',
      image: '/images/redesign/journey-3-tools.png',
    },
    {
      title: 'Private Mentorship',
      description: 'Book one-on-one sessions with human mentors.',
      image: '/images/redesign/journey-4-private.png',
    },
    {
      title: 'SME Offers',
      description: 'Access exclusive discounts and offers from program partners.',
      image: '/images/redesign/journey-5-offers.png',
    },
    {
      title: 'Events',
      description: 'Live online and in-person events – Insights from AI and business experts.',
      image: '/images/redesign/journey-6-events.png',
    },
  ],
  image: '/images/about-banner.png',
  ctaLabel: 'Login',
  ctaHref: '/login',
} as const

// Stakeholder section
export const STAKEHOLDER = {
  badge: 'Become a Program Stakeholder',
  heading: 'Become a Program Stakeholder',
  intro:
    'Do you represent a startup or SME? If yes, register here. Otherwise, choose from the below options that best suit your engagement.',
  smeCtaLabel: 'Register as SME',
  smeCtaHref: '/sign-up',
  cards: [
    {
      kind: 'expert',
      title: 'Experts Program',
      description:
        'Join as an individual expert, mentor, coach, or lecturer to share your expertise with the community!',
      ctaLabel: 'Join as an Expert',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-1-experts.png',
    },
    {
      kind: 'vc',
      title: 'VC Program',
      description:
        'Join as a VC, PE, Bank, or financing firm to identify businesses you can fund or finance!',
      ctaLabel: 'Join as a VC',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-2-vc.png',
    },
    {
      kind: 'government',
      title: 'Government Program',
      description:
        'Join as a multilateral or government entity to customize the program for your community!',
      ctaLabel: 'Join as a Government',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-3-government.png',
    },
    {
      kind: 'corporate',
      title: 'Corporate Program',
      description:
        'Join as a corporate sponsor to offer your solutions to businesses or to support the program!',
      ctaLabel: 'Join as a Corporate',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-4-corporate.png',
    },
    {
      kind: 'university',
      title: 'University Program',
      description:
        'Join as a university or think tank to share your faculty expertise and further your research!',
      ctaLabel: 'Join as a University',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-5-university.png',
    },
    {
      kind: 'incubator',
      title: 'Incubator Program',
      description:
        'Join as a chamber, incubator, co-working space, or NGO and extend the program to your community!',
      ctaLabel: 'Join as an Incubator',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-6-incubator.png',
    },
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
  heading: 'Boost Your Revenue, Cut Costs\nJoin the Program for Free!',
  ctaLabel: 'Get Started',
  ctaHref: '/sign-up',
} as const

// Courses section — condensed to 3 tabs
export const COURSES = {
  badge: "The Entrepreneur's Journey",
  heading: "The Entrepreneur's Journey",
  categories: [
    {
      name: 'Transform with AI',
      modules: [
        {
          title: 'AI for Growth: The Practical SME Guide',
          units: [
            'The AI Opportunity for SMEs',
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
      name: 'Digitize Your Business',
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
          title: 'Cash Flow Management',
          units: ['Cash Flow Fundamentals', 'Managing Receivables', 'Cost Reduction Strategies'],
        },
        {
          title: 'Negotiation Skills',
          units: ['Negotiation Fundamentals', 'Winning Strategies', 'Real-world Scenarios'],
        },
        {
          title: 'Starting a Blog Online',
          units: [
            'Choosing your niche and platform',
            'Setting up your blog',
            'Writing your first posts',
            'Growing your audience',
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

// Human Mentors — real people from smeep.potential.org
export const HUMAN_MENTORS = {
  badge: 'Human Mentors',
  heading: 'Human Mentors',
  subtext: 'Book private one-on-one sessions with verified business experts.',
  categories: ['All', 'Strategy', 'Marketing', 'Finance', 'Legal', 'Leadership', 'Operations'],
  // TODO: Update emails to match actual mentor user accounts in the DB
  mentors: [
    {
      name: 'Monika Papadopoulou',
      email: 'monika.papadopoulou@smeep.potential.org',
      specialty: 'Leadership, Sales, Branding',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/monika.jpg',
      linkedin: 'https://www.linkedin.com/in/monika-papadopoulou-26484191/',
      featured: true,
    },
    {
      name: 'Ziad Banna',
      email: 'ziad.banna@smeep.potential.org',
      specialty: 'Project Management, Leadership, Accounting',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/ziadbanna.jpg',
      linkedin: 'https://www.linkedin.com/in/ziad-b-a7206b24/',
      featured: true,
    },
    {
      name: 'Celine Chami',
      email: 'celine.chami@smeep.potential.org',
      specialty: 'Social Media, Marketing, Communication',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Celine-card.jpg',
      linkedin: 'https://www.linkedin.com/in/celinechami',
      featured: true,
    },
    {
      name: 'Alla Musnicka',
      email: 'alla.musnicka@smeep.potential.org',
      specialty: 'Sales, Marketing, PR',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Alla-card.jpg',
      linkedin: 'https://www.linkedin.com/in/alla-marija-musnicka-21154224',
      featured: true,
    },
    {
      name: 'Ivan Kraemer',
      email: 'ivan.kraemer@smeep.potential.org',
      specialty: 'ICT, Sales, Team Building',
      category: 'Operations',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/06/Ivan-Kraemer-smeep-card.jpg',
      linkedin: 'https://www.linkedin.com/in/ivankraemer/',
      featured: true,
    },
    {
      name: 'Mita Srinivasan',
      email: 'mita.srinivasan@smeep.potential.org',
      specialty: 'PR, Social Media, Communications',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/06/Mita-Smeep-card.jpg',
      linkedin: 'https://www.linkedin.com/in/mitasrinivasan/',
      featured: true,
    },
    {
      name: 'Shahrazad Shehab',
      email: 'shahrazad.shehab@smeep.potential.org',
      specialty: 'PR, Social Media',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/06/Shahrazad-Shehab-card-1.png',
      linkedin: 'https://www.linkedin.com/in/shahrazad-shehab/',
      featured: false,
    },
    {
      name: 'Sawsan Abbasy',
      email: 'sawsan.abbasy@smeep.potential.org',
      specialty: 'Strategy, Sales',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/05/Sawsan-Abbasy-300x300-1.png',
      linkedin: 'https://www.linkedin.com/in/sawsanabbasi/',
      featured: false,
    },
    {
      name: 'Umair Azhar',
      email: 'umair.azhar@smeep.potential.org',
      specialty: 'Insurance, Financials',
      category: 'Finance',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/Umair.jpg',
      linkedin: 'https://www.linkedin.com/in/umair-azhar-b112117b/',
      featured: false,
    },
    {
      name: 'Ghinwa Abi Zeid',
      email: 'ghinwa.abizeid@smeep.potential.org',
      specialty: 'Legal, Partnerships, Company Setup',
      category: 'Legal',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/ghenwa.jpg',
      linkedin: 'https://www.linkedin.com/in/ghinwa-abi-zeid-7a129016/',
      featured: false,
    },
    {
      name: 'Albert Jose',
      email: 'albert.jose@smeep.potential.org',
      specialty: 'Accounting, Auditing, Tax',
      category: 'Finance',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/Albert-card.png',
      linkedin: 'https://www.linkedin.com/in/al-khazraji-audit-b08523168/',
      featured: false,
    },
    {
      name: 'Nika Sturm',
      email: 'nika.sturm@smeep.potential.org',
      specialty: 'Strategy',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/08/Nika-Sturm.png',
      linkedin: 'https://www.linkedin.com/in/nikasturm/',
      featured: false,
    },
    {
      name: 'Ahmed Alsuleimani',
      email: 'ahmed.alsuleimani@smeep.potential.org',
      specialty: 'Leadership, Strategy',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/08/Ahmed-Alsuleimani.png',
      linkedin: 'https://www.linkedin.com/in/ahmed-alsuleimani-42a04066',
      featured: false,
    },
    {
      name: 'Samer Hamadeh',
      email: 'samer.hamadeh@smeep.potential.org',
      specialty: 'Product Development, Strategy, Business Development',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Samer-card.jpg',
      linkedin: 'https://www.linkedin.com/in/samerhamadeh/',
      featured: false,
    },
    {
      name: 'Kirsten Westholter',
      email: 'kirsten.westholter@smeep.potential.org',
      specialty: 'Design Thinking, Business Transformation, Strategy',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Kirsten-card.jpg',
      linkedin: 'https://www.linkedin.com/in/kirstenwestholter/',
      featured: false,
    },
    {
      name: 'Tony Feghali',
      email: 'tony.feghali@smeep.potential.org',
      specialty: 'Strategy, Leadership, Sales',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Tony-card.jpg',
      linkedin: 'https://www.linkedin.com/in/tonyfeghali/',
      featured: false,
    },
    {
      name: 'Lara Haddad',
      email: 'lara.haddad@smeep.potential.org',
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
  badge: 'Special SME Offers',
  heading: 'Special SME Offers',
  subtext: 'Explore our offers for your business solution — exclusive discounts from program partners.',
  ctaLabel: 'Reveal Coupon',
  ctaHref: '#',
} as const

// Community section
export const COMMUNITY = {
  badge: 'Meet Our Community',
  heading: 'Meet Our Community',
  subtext:
    'The SME Empowerment program was originally launched in 2010 and reached over 300,000 SMEs around the globe. We are eager to share your story and expertise with the community.',
  stats: [
    { value: 300000, label: 'SMEs Reached', display: '300,000+', animate: true },
    { value: 2010, label: 'Year Founded', display: 'Since 2010', animate: false },
    { value: 50, label: 'Countries', display: '50+', animate: true },
  ],
  image: '/images/community-map.png',
} as const

// CTA Final
export const CTA_FINAL = {
  heading: 'Save Costs and Grow Faster with AI – Register Now!',
  subtext: 'Join thousands of SMEs already transforming their businesses with the power of AI.',
  ctaLabel: 'Register Now',
  ctaHref: '/sign-up',
  loginLabel: 'Login',
  loginHref: '/login',
} as const

// Centralized redesign asset paths + alt text
export const REDESIGN_ASSETS = {
  hero: { src: '/images/redesign/hero.png', alt: 'AI-empowered SME workspace' },
  heroBg: {
    src: '/images/redesign/hero-bg.png',
    alt: '',
  },
  aboutGlobe: { src: '/images/redesign/about-globe.png', alt: 'Global SME network' },
  journeyFlow: {
    src: '/images/redesign/journey-flow-image.png',
    alt: 'AI-powered journey flow diagram',
  },
  additionalResources: {
    src: '/images/redesign/additional-resources.png',
    alt: 'Additional resources from AWS, Cisco, Potential and Schneider Electric',
  },
  worldMap: { src: '/images/redesign/world-map.png', alt: 'Global community map' },
  chatbotOrb: { src: '/images/redesign/chatbot-orb.png', alt: 'AI assistant orb avatar' },
  logo: { src: '/images/SMEEP-logo.png', alt: 'SMEEP' },
} as const

// Rotating testimonials for auth-page brand panel
export const AUTH_TESTIMONIALS = [
  {
    quote:
      'SMEEP gave us the AI playbook we never had. We cut customer-support costs by 38% in 90 days.',
    name: 'Priya Raman',
    role: 'Founder, Vellora Textiles',
  },
  {
    quote:
      'The mentor sessions alone are worth thousands. Getting them free changed how we run the business.',
    name: 'Tomás Herrera',
    role: 'CEO, Andes Logistics',
  },
  {
    quote:
      'In 6 weeks we shipped an AI agent that books 20% of our calls. The training is genuinely practical.',
    name: 'Aisha Bello',
    role: 'COO, BrightLane Health',
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
  contactEmail: 'smeep@potential.com',
  copyright: 'Potential © 2005-2025 | All Rights Reserved.',
  contactHeading: 'Get in Touch',
  contactBody: 'For any inquiries about the program, please contact us at:',
} as const
