import {
  AI_MENTORS,
  COURSES,
} from '@/lib/constants'

export type CourseDifficulty = 'Beginner' | 'Intermediate' | 'Advanced'

export type DashboardCourse = {
  id: string
  title: string
  category: string
  totalUnits: number
  completedUnits: number
  cover: string
  estimatedHours: number
  durationMinutes: number
  difficulty: CourseDifficulty
}

export function difficultyFromHours(hours: number): CourseDifficulty {
  if (hours < 1.6) return 'Beginner'
  if (hours < 2.5) return 'Intermediate'
  return 'Advanced'
}

export type DashboardTask = {
  id: string
  title: string
  due: string
  done: boolean
  priority: 'low' | 'med' | 'high'
}

export type TimelineEvent = {
  id: string
  type: 'course' | 'mentor' | 'event' | 'offer' | 'certificate'
  title: string
  meta: string
  at: string
}

export type Certificate = {
  id: string
  title: string
  issuedOn: string
  hours: number
  hue: string
}

export type LiveSessionItem = {
  id: string
  title: string
  description: string
  date: string
  time: string
  rsvp: boolean
}

export type FaqItem = { q: string; a: string }

// ─── Course learning content ──────────────────────────────────────────────
export type LearningBlockBase = {
  id: string
  title: string
}

export type VideoBlock = LearningBlockBase & {
  kind: 'video'
  description: string
  videoUrl: string
  poster: string
  durationLabel: string
}

export type SurveyOption = { id: string; label: string }

export type SurveyBlock = LearningBlockBase & {
  kind: 'survey'
  prompt: string
  options: SurveyOption[]
  reflection: string
}

export type ActionPlanBlock = LearningBlockBase & {
  kind: 'action-plan'
  prompt: string
  placeholder: string
  tip: string
}

export type LearningBlock = VideoBlock | SurveyBlock | ActionPlanBlock

export type CourseUnit = {
  id: string
  title: string
  blocks: LearningBlock[]
}

export type CourseDetail = {
  id: string
  title: string
  category: string
  cover: string
  estimatedHours: number
  description: string
  units: CourseUnit[]
}

const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
]

const VIDEO_POSTERS = [
  'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1655720828018-edd2daec9349?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1633412802994-5c058f151b66?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1200&q=70',
]

const SURVEY_TEMPLATES: Array<Omit<SurveyBlock, 'id' | 'kind' | 'title'>> = [
  {
    prompt: 'How confident do you feel about applying this idea inside your own business right now?',
    options: [
      { id: 'a', label: 'Not at all — I need more guidance' },
      { id: 'b', label: 'Somewhat — I have a rough idea' },
      { id: 'c', label: 'Confident — I can pilot it this week' },
      { id: 'd', label: 'Very confident — already doing it' },
    ],
    reflection:
      "Great. There's no wrong answer here — your honest baseline is what helps your AI mentor and human coach tailor the next steps for you.",
  },
  {
    prompt: 'Which area of your business would benefit most from what you just learned?',
    options: [
      { id: 'a', label: 'Sales & customer growth' },
      { id: 'b', label: 'Operations & productivity' },
      { id: 'c', label: 'Marketing & brand' },
      { id: 'd', label: 'Finance & cash flow' },
    ],
    reflection:
      "Nice — keep this area in mind for the next units. We'll come back to it when you build your action plan at the end of the module.",
  },
  {
    prompt: 'What is the biggest blocker stopping you from acting on this today?',
    options: [
      { id: 'a', label: 'Time' },
      { id: 'b', label: 'Budget' },
      { id: 'c', label: 'Skills inside the team' },
      { id: 'd', label: 'I just need to start' },
    ],
    reflection:
      'Naming the blocker is half the work. In the next unit you will see practical ways SMEs around the world are removing exactly this kind of friction.',
  },
]

const ACTION_PLAN_TEMPLATES: Array<Omit<ActionPlanBlock, 'id' | 'kind' | 'title'>> = [
  {
    prompt: 'In one or two sentences, what is one concrete action you will take in your business in the next 7 days based on this unit?',
    placeholder: 'Example: I will pilot an AI assistant to handle the first reply to every inbound lead this week…',
    tip: 'Be specific — name the tool, the team, and the date. Specific plans get done.',
  },
  {
    prompt: 'Who in your team or network do you need to involve to make this happen, and what will you ask them?',
    placeholder: 'Example: I will brief my operations lead on Monday and ask them to map our top-3 repetitive workflows…',
    tip: 'A plan with a person attached to it is twice as likely to ship. Add names if you can.',
  },
  {
    prompt: 'How will you measure whether this action worked? Pick one number you will track.',
    placeholder: 'Example: I will track number of leads replied to within 5 minutes vs. our current baseline of 4 hours…',
    tip: 'A single, clear metric beats a dashboard. Choose one.',
  },
]

const VIDEO_DESCRIPTIONS = [
  "In this lesson you will hear from SMEs around the world on how they applied this idea inside real businesses — and the mistakes they wish they had avoided.",
  'A short, practical walkthrough of the core framework. Focus on the model on screen at minute 1:20 — you will use it in the next block.',
  'Watch how a small team turned a 6-hour weekly task into a 12-minute one using off-the-shelf tools you already have access to.',
  'A condensed explainer covering the why, the what, and the first three steps you can take this week. No fluff, no theory.',
]

function pickFrom<T>(arr: readonly T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length]
}

function buildBlocksForUnit(unitTitle: string, unitSeed: number): LearningBlock[] {
  // Each unit has: 1 intro video, 1 survey, 1 deeper video, 1 action plan
  return [
    {
      id: `b${unitSeed}-1`,
      kind: 'video',
      title: `Intro · ${unitTitle}`,
      description: pickFrom(VIDEO_DESCRIPTIONS, unitSeed),
      videoUrl: pickFrom(SAMPLE_VIDEOS, unitSeed),
      poster: pickFrom(VIDEO_POSTERS, unitSeed),
      durationLabel: '4 min',
    },
    {
      id: `b${unitSeed}-2`,
      kind: 'survey',
      title: 'Survey questions',
      ...pickFrom(SURVEY_TEMPLATES, unitSeed),
    },
    {
      id: `b${unitSeed}-3`,
      kind: 'video',
      title: `Deep dive · ${unitTitle}`,
      description: pickFrom(VIDEO_DESCRIPTIONS, unitSeed + 2),
      videoUrl: pickFrom(SAMPLE_VIDEOS, unitSeed + 1),
      poster: pickFrom(VIDEO_POSTERS, unitSeed + 2),
      durationLabel: '7 min',
    },
    {
      id: `b${unitSeed}-4`,
      kind: 'action-plan',
      title: 'Your action plan',
      ...pickFrom(ACTION_PLAN_TEMPLATES, unitSeed),
    },
  ]
}

export function getCourseDetails(): CourseDetail[] {
  const list: CourseDetail[] = []
  let coverIdx = 0
  COURSES.categories.forEach((cat) => {
    cat.modules.forEach((mod) => {
      const id = slugify(`${cat.name}-${mod.title}`)
      list.push({
        id,
        title: mod.title,
        category: cat.name,
        cover: COURSE_COVERS[coverIdx % COURSE_COVERS.length],
        estimatedHours: 1 + mod.units.length * 0.4,
        description: `A practical, mentor-led course inside the ${cat.name} track. Built for busy SME founders — short videos, quick reflections, and a real action plan you walk away with.`,
        units: mod.units.map((unitTitle, ui) => ({
          id: `u${coverIdx}-${ui}`,
          title: unitTitle,
          blocks: buildBlocksForUnit(unitTitle, coverIdx * 11 + ui * 3),
        })),
      })
      coverIdx++
    })
  })
  return list
}

let _cachedCourses: CourseDetail[] | null = null
function allCourses(): CourseDetail[] {
  if (!_cachedCourses) _cachedCourses = getCourseDetails()
  return _cachedCourses
}

export function getCourseById(id: string): CourseDetail | undefined {
  return allCourses().find((c) => c.id === id)
}

const COURSE_COVERS = [
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=900&q=70',
]

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getCourses(): DashboardCourse[] {
  const list: DashboardCourse[] = []
  let coverIdx = 0
  COURSES.categories.forEach((cat) => {
    cat.modules.forEach((mod) => {
      const hours = 1 + (mod.units.length * 0.4)
      list.push({
        id: slugify(`${cat.name}-${mod.title}`),
        title: mod.title,
        category: cat.name,
        totalUnits: mod.units.length,
        completedUnits: Math.max(0, Math.min(mod.units.length, Math.round(mod.units.length * (0.15 + ((coverIdx * 17) % 80) / 100)))),
        cover: COURSE_COVERS[coverIdx % COURSE_COVERS.length],
        estimatedHours: hours,
        durationMinutes: Math.round(hours * 60),
        difficulty: difficultyFromHours(hours),
      })
      coverIdx++
    })
  })
  return list
}

export function getMyAiMentors() {
  return AI_MENTORS.mentors.slice(0, 4).map((m) => ({
    name: m.name,
    slug: m.slug,
    specialty: m.specialty,
    description: m.description,
    avatar: m.avatar,
    chats: 4 + Math.round(Math.random() * 18),
  }))
}

export function getAllAiMentors() {
  return AI_MENTORS.mentors
}

export function getAiMentorBySlug(slug: string) {
  return AI_MENTORS.mentors.find((m) => m.slug === slug)
}

// Human mentor data now comes from the API via getMentors() in @/lib/api/sme.
// These functions are kept as stubs so existing callers (e.g. Overview) don't break
// until they are migrated to the API.
export function getProgrammeMentors(): Array<{ name: string; specialty: string; avatar: string }> {
  return []
}

export function getAllHumanMentors(): Array<{ name: string; specialty: string; avatar: string }> {
  return []
}

export function getEvents() {
  // Events are now loaded from the API via fetchPublishedEvents() in @/lib/api/liveEvents
  return [] as Array<{ title: string; date: string; time: string; type: string; description: string; recordingLink: string; image: string | null }>
}

export const TASKS: DashboardTask[] = [
  { id: 't1', title: 'Finish "AI for Growth" module 2', due: 'Today', done: false, priority: 'high' },
  { id: 't2', title: 'Book a session with Celine Chami', due: 'Tomorrow', done: false, priority: 'med' },
  { id: 't3', title: 'Watch "Business Trends to Watch" replay', due: 'This week', done: true, priority: 'low' },
  { id: 't4', title: 'Redeem the Zoho accounting offer', due: 'Sep 20', done: false, priority: 'med' },
  { id: 't5', title: 'Submit "Pricing strategy" assignment', due: 'Oct 02', done: false, priority: 'high' },
]

export const TIMELINE: TimelineEvent[] = [
  { id: 'e1', type: 'certificate', title: 'Earned: AI Readiness Foundations', meta: 'Certificate · 4 hrs', at: '2 hours ago' },
  { id: 'e2', type: 'mentor', title: 'Chatted with Marketing Coach', meta: 'AI Mentor · 12 messages', at: 'Yesterday' },
  { id: 'e3', type: 'course', title: 'Completed module: Online Presence', meta: 'Digitize Your Business', at: '2 days ago' },
  { id: 'e4', type: 'event', title: 'RSVP: Business Trends to Watch', meta: 'Webinar · Jun 22', at: '3 days ago' },
  { id: 'e5', type: 'offer', title: 'Unlocked: Cisco free trial', meta: 'Partner offer', at: 'Last week' },
  { id: 'e6', type: 'mentor', title: 'Booked: Monika Papadopoulou', meta: 'Human mentor · 45 min', at: 'Last week' },
]

export const CERTIFICATES: Certificate[] = [
  { id: 'c1', title: 'AI Readiness Foundations', issuedOn: 'Apr 28, 2026', hours: 4, hue: 'from-brand-primary to-brand-violet' },
  { id: 'c2', title: 'Digital Marketing Essentials', issuedOn: 'Mar 14, 2026', hours: 6, hue: 'from-brand-violet to-brand-primary-dark' },
  { id: 'c3', title: 'Cash Flow Fundamentals', issuedOn: 'Feb 02, 2026', hours: 3, hue: 'from-brand-accent to-brand-primary' },
]

export const LIVE_SESSIONS: LiveSessionItem[] = [
  { id: 'ls1', title: 'Business Trends to Watch', description: 'Event details to be placed here for each event.', date: '2026-06-22', time: '5:00 PM / GST · UAE time', rsvp: true },
  { id: 'ls2', title: 'What Investors Look For When Investing', description: 'Event details to be placed here for each event.', date: '2026-06-15', time: '5:00 PM / GST · UAE time', rsvp: false },
  { id: 'ls3', title: 'Enhance Your Learning and Development', description: 'Event details to be placed here for each event.', date: '2026-06-08', time: '5:00 PM / GST · UAE time', rsvp: true },
  { id: 'ls4', title: 'Use Data to Grow Your Business', description: 'Event details to be placed here for each event.', date: '2026-06-01', time: '5:00 PM / GST · UAE time', rsvp: false },
]

export const FAQS: FaqItem[] = [
  { q: 'Is SMEEP really free?', a: 'Yes — SMEEP is 100% free for SMEs and startups. There are no hidden fees and no credit card required.' },
  { q: 'How do I book a session with a human mentor?', a: 'Open Programme Mentors, choose a mentor that fits your needs, and click Book Session. We will email you a calendar invite.' },
  { q: 'What can the AI Business Assistant do?', a: 'It can draft a business plan, marketing plan, product proposal, generate ideas, and answer SMEEP-related questions tailored to your business.' },
  { q: 'How are certificates issued?', a: 'You earn a certificate automatically when you complete all units in a module. They appear under Certifications and can be downloaded as PDF.' },
  { q: 'Can I redeem multiple partner offers?', a: 'Yes — most offers can be stacked. Some have eligibility restrictions which are listed on the offer details page.' },
  { q: 'How do I delete my account?', a: 'Email us at smeep@potential.com from your registered address and we will remove your account within 7 working days.' },
]

export const STATS = {
  offersAvailable: 18,
  pointsGained: 1240,
  coursesInProgress: 3,
  certificatesEarned: 3,
}
