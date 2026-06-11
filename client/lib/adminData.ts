// Realistic mock data used across the admin dashboard mockup.
// All values are static — no persistence, no backend calls.

export type AdminKpi = {
  totalUsers: number
  activeCourses: number
  certificatesIssued: number
  monthlyRevenue: number
  mentorSessions: number
  completionRate: number
}

export const ADMIN_KPIS: AdminKpi = {
  totalUsers: 12480,
  activeCourses: 47,
  certificatesIssued: 3284,
  monthlyRevenue: 184200,
  mentorSessions: 612,
  completionRate: 73,
}

export type SeriesPoint = { label: string; value: number }
export type DualSeriesPoint = { label: string; users: number; sessions: number }

export const USER_GROWTH: DualSeriesPoint[] = [
  { label: 'Nov', users: 6420, sessions: 1240 },
  { label: 'Dec', users: 7180, sessions: 1380 },
  { label: 'Jan', users: 8210, sessions: 1620 },
  { label: 'Feb', users: 9040, sessions: 1840 },
  { label: 'Mar', users: 9980, sessions: 2120 },
  { label: 'Apr', users: 11020, sessions: 2410 },
  { label: 'May', users: 12480, sessions: 2680 },
]

export const COURSE_ENGAGEMENT: SeriesPoint[] = [
  { label: 'AI for Growth', value: 84 },
  { label: 'Digital Marketing', value: 76 },
  { label: 'Cash Flow', value: 68 },
  { label: 'Pricing Strategy', value: 61 },
  { label: 'Customer Service', value: 58 },
  { label: 'Branding', value: 52 },
]

export const COMPLETION_BY_CATEGORY: SeriesPoint[] = [
  { label: 'Marketing', value: 78 },
  { label: 'Finance', value: 64 },
  { label: 'Operations', value: 71 },
  { label: 'Strategy', value: 59 },
  { label: 'Technology', value: 82 },
  { label: 'Leadership', value: 67 },
]

export const REVENUE_AREA: SeriesPoint[] = [
  { label: 'Wk 1', value: 38200 },
  { label: 'Wk 2', value: 42100 },
  { label: 'Wk 3', value: 47800 },
  { label: 'Wk 4', value: 56100 },
]

export const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const HEATMAP_HOURS = ['6am', '9am', '12pm', '3pm', '6pm', '9pm']
// 7 rows (days) × 6 cols (hours) of activity intensity 0..100
export const HEATMAP_DATA: number[][] = [
  [12, 38, 64, 72, 88, 41],
  [14, 44, 71, 78, 92, 48],
  [18, 52, 79, 84, 96, 55],
  [16, 48, 74, 80, 90, 50],
  [20, 56, 82, 86, 84, 42],
  [28, 62, 70, 60, 54, 32],
  [22, 48, 58, 52, 48, 28],
]

export type ActivityItem = {
  id: string
  user: string
  avatar: string
  action: string
  target: string
  at: string
  type: 'enroll' | 'complete' | 'mentor' | 'certificate' | 'signup'
}

export const ACTIVITY_FEED: ActivityItem[] = [
  { id: 'a1', user: 'Aisha Khan', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Aisha%20Khan&backgroundColor=9f2063', action: 'completed', target: 'AI for Growth · Module 3', at: '4 minutes ago', type: 'complete' },
  { id: 'a2', user: 'Omar Faruq', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Omar%20Faruq&backgroundColor=4c1d6e', action: 'enrolled in', target: 'Pricing Strategy Bootcamp', at: '12 minutes ago', type: 'enroll' },
  { id: 'a3', user: 'Lina Marwan', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Lina%20Marwan&backgroundColor=e83e94', action: 'booked a session with', target: 'Celine Chami', at: '38 minutes ago', type: 'mentor' },
  { id: 'a4', user: 'Diego Santos', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Diego%20Santos&backgroundColor=c42b7a', action: 'earned certificate', target: 'Cash Flow Fundamentals', at: '1 hour ago', type: 'certificate' },
  { id: 'a5', user: 'Priya Nair', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Priya%20Nair&backgroundColor=7a1a4c', action: 'signed up', target: 'New account', at: '2 hours ago', type: 'signup' },
  { id: 'a6', user: 'Marco Rossi', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Marco%20Rossi&backgroundColor=9f2063', action: 'completed', target: 'Digital Marketing Essentials', at: '3 hours ago', type: 'complete' },
  { id: 'a7', user: 'Yuki Tanaka', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Yuki%20Tanaka&backgroundColor=4c1d6e', action: 'enrolled in', target: 'AI for Growth', at: '4 hours ago', type: 'enroll' },
]

export type AdminNotification = {
  id: string
  title: string
  body: string
  at: string
  level: 'info' | 'warn' | 'success'
  read: boolean
}

export const ADMIN_NOTIFICATIONS: AdminNotification[] = [
  { id: 'n1', title: 'Course awaiting review', body: '"Negotiation for Founders" was submitted by Celine Chami.', at: '20 min ago', level: 'warn', read: false },
  { id: 'n2', title: 'Spike in signups', body: '+312 new accounts in the last 24 hours — 38% above weekly average.', at: '1 hr ago', level: 'success', read: false },
  { id: 'n3', title: 'Mentor capacity low', body: 'Only 4 slots left this week with Monika Papadopoulou.', at: '3 hr ago', level: 'warn', read: false },
  { id: 'n4', title: 'New partner offer live', body: 'Zoho Books extended the SMEEP discount until Aug 31.', at: 'Yesterday', level: 'info', read: true },
  { id: 'n5', title: 'Weekly digest sent', body: 'Sent to 12,480 active members.', at: '2 days ago', level: 'info', read: true },
]

export type AdminTask = {
  id: string
  title: string
  due: string
  priority: 'low' | 'med' | 'high'
  owner: string
}

export const ADMIN_TASKS: AdminTask[] = [
  { id: 't1', title: 'Review "Negotiation for Founders" submission', due: 'Today', priority: 'high', owner: 'You' },
  { id: 't2', title: 'Approve June live-events calendar', due: 'Tomorrow', priority: 'high', owner: 'Hala' },
  { id: 't3', title: 'Refresh AI Mentor: Marketing Coach prompt', due: 'This week', priority: 'med', owner: 'You' },
  { id: 't4', title: 'Publish quarterly impact report', due: 'May 22', priority: 'med', owner: 'Yusuf' },
  { id: 't5', title: 'Onboard 3 new programme mentors', due: 'May 28', priority: 'low', owner: 'Hala' },
]

// ─── Courses (admin-side) ─────────────────────────────────────────────────
export type AdminQuestionFormat = 'true-false' | 'multiple-choice' | 'short-text'
export type AdminQuestionKind = 'survey' | 'action-plan'

export type AdminQuestion = {
  id: string
  kind: AdminQuestionKind
  format: AdminQuestionFormat
  prompt: string
  options?: string[]
  correctIndex?: number
  correctBool?: boolean
  placeholder?: string
}

export type AdminQuestionBlock = {
  type: 'question'
  questions: AdminQuestion[]
}

export type AdminTextBlock = { type: 'text'; body: string }
export type AdminVideoBlock = { type: 'video'; videoUrl: string; transcript?: string }

export type AdminImageBlock = { type: 'image'; imageUrl: string }
export type AdminLearningBlock = {
  id: string
  title: string
} & (AdminTextBlock | AdminVideoBlock | AdminQuestionBlock | AdminImageBlock)

export type AdminUnit = {
  id: string
  title: string
  description: string
  durationMinutes?: number
  blocks: AdminLearningBlock[]
}

export type AdminModule = {
  id: string
  title: string
  description: string
  units: AdminUnit[]
}

export type AdminCourse = {
  id: string
  title: string
  description: string
  cover: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  pointsPerUnit: number
  enableCertificate: boolean
  status: 'draft' | 'published'
  enrolled: number
  updatedAt: string
  modules: AdminModule[]
}

const COVER_POOL = [
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=70',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=900&q=70',
]

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function newQuestion(kind: AdminQuestionKind = 'survey'): AdminQuestion {
  return {
    id: makeId('q'),
    kind,
    format: 'multiple-choice',
    prompt: 'New question',
    options: ['Option A', 'Option B', 'Option C'],
    correctIndex: 0,
  }
}

export function newBlock(type: 'text' | 'video' | 'image' | 'question', title = 'Untitled block'): AdminLearningBlock {
  if (type === 'text')
    return { id: makeId('blk'), title, type: 'text', body: '' }
  if (type === 'video')
    return {
      id: makeId('blk'),
      title,
      type: 'video',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      transcript: '',
    }
  if (type === 'image')
    return { id: makeId('blk'), title, type: 'image', imageUrl: '' }
  return {
    id: makeId('blk'),
    title,
    type: 'question',
    questions: [newQuestion('survey')],
  }
}

export function newUnit(title = 'New unit'): AdminUnit {
  return {
    id: makeId('unit'),
    title,
    description: '',
    blocks: [newBlock('text', 'Lesson intro')],
  }
}

export function newModule(title = 'New module'): AdminModule {
  return {
    id: makeId('mod'),
    title,
    description: '',
    units: [newUnit('Unit 1')],
  }
}

export function newCourse(): AdminCourse {
  return {
    id: makeId('course'),
    title: 'Untitled course',
    description: '',
    cover: COVER_POOL[0],
    difficulty: 'Beginner',
    pointsPerUnit: 10,
    enableCertificate: true,
    status: 'draft',
    enrolled: 0,
    updatedAt: 'Just now',
    modules: [newModule('Module 1')],
  }
}

function buildSeed(): AdminCourse[] {
  const seeds: Array<{
    title: string
    difficulty: AdminCourse['difficulty']
    enrolled: number
    status: AdminCourse['status']
    updatedAt: string
    description: string
    modules: Array<{ title: string; units: Array<{ title: string; blocks: Array<{ title: string; type: 'text' | 'video' | 'image' | 'question' }> }> }>
  }> = [
    {
      title: 'AI for Growth',
      difficulty: 'Intermediate',
      enrolled: 2840,
      status: 'published',
      updatedAt: '2 days ago',
      description: 'Practical AI playbooks for SME founders — from automating support to forecasting demand.',
      modules: [
        {
          title: 'Foundations of Business AI',
          units: [
            { title: 'What AI can (and cannot) do', blocks: [{ title: 'Welcome', type: 'video' }, { title: 'Reading: AI vs. automation', type: 'text' }, { title: 'Quick check', type: 'question' }] },
            { title: 'Mapping your AI opportunities', blocks: [{ title: 'Workshop video', type: 'video' }, { title: 'Action plan', type: 'question' }] },
          ],
        },
        {
          title: 'Customer Operations with AI',
          units: [
            { title: 'AI-assisted support', blocks: [{ title: 'Case study: Brightleaf', type: 'video' }, { title: 'Survey', type: 'question' }] },
            { title: 'Personalising at scale', blocks: [{ title: 'Lesson copy', type: 'text' }, { title: 'Knowledge check', type: 'question' }] },
            { title: 'Measuring impact', blocks: [{ title: 'Walkthrough', type: 'video' }] },
          ],
        },
      ],
    },
    {
      title: 'Digital Marketing Essentials',
      difficulty: 'Beginner',
      enrolled: 4120,
      status: 'published',
      updatedAt: '6 days ago',
      description: 'A founder-friendly tour of the modern marketing stack: SEO, paid, content, email, and social.',
      modules: [
        {
          title: 'Channels that move the needle',
          units: [
            { title: 'Picking your first channel', blocks: [{ title: 'Intro', type: 'video' }, { title: 'Reflection', type: 'question' }] },
            { title: 'Brand voice in 30 minutes', blocks: [{ title: 'Reading', type: 'text' }] },
          ],
        },
      ],
    },
    {
      title: 'Cash Flow Fundamentals',
      difficulty: 'Beginner',
      enrolled: 1980,
      status: 'published',
      updatedAt: '1 week ago',
      description: 'Master the only financial metric that decides whether your business survives.',
      modules: [
        {
          title: 'Reading your numbers',
          units: [
            { title: 'The 3 statements explained', blocks: [{ title: 'Video', type: 'video' }, { title: 'Quiz', type: 'question' }] },
          ],
        },
      ],
    },
    {
      title: 'Negotiation for Founders',
      difficulty: 'Advanced',
      enrolled: 0,
      status: 'draft',
      updatedAt: 'Awaiting review',
      description: 'Close better deals with suppliers, investors, and your first hires.',
      modules: [
        {
          title: 'Principles',
          units: [{ title: 'BATNA explained', blocks: [{ title: 'Lesson', type: 'text' }] }],
        },
      ],
    },
    {
      title: 'Pricing Strategy Bootcamp',
      difficulty: 'Intermediate',
      enrolled: 1240,
      status: 'published',
      updatedAt: '2 weeks ago',
      description: 'Stop guessing. Build a pricing model that reflects the value you create.',
      modules: [
        {
          title: 'Value-based pricing',
          units: [
            { title: 'Cost vs. value vs. competition', blocks: [{ title: 'Video', type: 'video' }] },
            { title: 'Run a pricing experiment', blocks: [{ title: 'Action plan', type: 'question' }] },
          ],
        },
      ],
    },
    {
      title: 'Operations on Autopilot',
      difficulty: 'Intermediate',
      enrolled: 860,
      status: 'draft',
      updatedAt: 'Yesterday',
      description: 'A no-nonsense guide to documenting, automating, and delegating the work that drains you.',
      modules: [
        {
          title: 'SOPs that stick',
          units: [{ title: 'Writing your first SOP', blocks: [{ title: 'Lesson', type: 'text' }, { title: 'Quiz', type: 'question' }] }],
        },
      ],
    },
  ]

  return seeds.map((s, i) => {
    const courseId = `course-${i + 1}`
    return {
      id: courseId,
      title: s.title,
      description: s.description,
      cover: COVER_POOL[i % COVER_POOL.length],
      difficulty: s.difficulty,
      pointsPerUnit: 10 + (i % 3) * 5,
      enableCertificate: true,
      status: s.status,
      enrolled: s.enrolled,
      updatedAt: s.updatedAt,
      modules: s.modules.map((m, mi) => {
        const moduleId = `${courseId}-mod-${mi + 1}`
        return {
          id: moduleId,
          title: m.title,
          description: '',
          units: m.units.map((u, ui) => {
            const unitId = `${moduleId}-unit-${ui + 1}`
            return {
              id: unitId,
              title: u.title,
              description: '',
              blocks: u.blocks.map((b, bi) => ({
                ...newBlock(b.type, b.title),
                id: `${unitId}-blk-${bi + 1}`,
              })),
            }
          }),
        }
      }),
    }
  })
}

export const SEED_COURSES = buildSeed()

// ─── Analytics: extra series for the redesigned admin Analytics page ─────
export const USERS_OVER_TIME: SeriesPoint[] = [
  { label: 'Nov', value: 6420 },
  { label: 'Dec', value: 7180 },
  { label: 'Jan', value: 8210 },
  { label: 'Feb', value: 9040 },
  { label: 'Mar', value: 9980 },
  { label: 'Apr', value: 11020 },
  { label: 'May', value: 12480 },
]

// AI chatbot insights (4 charts)
export const AI_CONVERSATIONS_OVER_TIME: SeriesPoint[] = [
  { label: 'Wk 1', value: 1240 },
  { label: 'Wk 2', value: 1480 },
  { label: 'Wk 3', value: 1720 },
  { label: 'Wk 4', value: 1980 },
  { label: 'Wk 5', value: 2310 },
  { label: 'Wk 6', value: 2640 },
  { label: 'Wk 7', value: 2980 },
  { label: 'Wk 8', value: 3210 },
]

export const AI_TOP_INTENTS: SeriesPoint[] = [
  { label: 'Course help', value: 38 },
  { label: 'Marketing tips', value: 27 },
  { label: 'Pricing advice', value: 18 },
  { label: 'Funding guidance', value: 12 },
  { label: 'Cash flow', value: 9 },
  { label: 'Other', value: 6 },
]

export const AI_SATISFACTION_TREND: SeriesPoint[] = [
  { label: 'Wk 1', value: 84 },
  { label: 'Wk 2', value: 86 },
  { label: 'Wk 3', value: 87 },
  { label: 'Wk 4', value: 88 },
  { label: 'Wk 5', value: 89 },
  { label: 'Wk 6', value: 90 },
  { label: 'Wk 7', value: 91 },
  { label: 'Wk 8', value: 92 },
]

export const AI_ACTIVE_USERS_PER_DAY: SeriesPoint[] = [
  { label: 'Mon', value: 612 },
  { label: 'Tue', value: 698 },
  { label: 'Wed', value: 742 },
  { label: 'Thu', value: 805 },
  { label: 'Fri', value: 871 },
  { label: 'Sat', value: 524 },
  { label: 'Sun', value: 489 },
]

// Admin overview / analytics extra KPIs
export const ADMIN_USER_KPIS = {
  totalUsers: 12480,
  activeUsers: 8420,
  newUsers: 312,
  enrolledLearners: 9740,
  totalCourses: 47,
  totalCertificates: 3284,
}

// ─── Admin profile ────────────────────────────────────────────────────────
export const ADMIN_PROFILE = {
  fullName: 'Hala Mansour',
  email: 'admin@email.com',
  role: 'Platform Administrator',
  team: 'SMEEP Operations',
  avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Hala%20Mansour&backgroundColor=4c1d6e&fontSize=42&radius=50',
  joined: 'Jan 2024',
}

export const ADMIN_SESSIONS = [
  { id: 's1', device: 'MacBook Pro · Safari', location: 'Dubai, UAE', lastActive: 'Active now', current: true },
  { id: 's2', device: 'iPhone 15 · Safari', location: 'Dubai, UAE', lastActive: '3 hours ago', current: false },
  { id: 's3', device: 'Windows · Chrome', location: 'Riyadh, KSA', lastActive: '2 days ago', current: false },
]
