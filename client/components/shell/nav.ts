import {
  BarChart3,
  BookOpenCheck,
  Bot,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  Award,
  CircleHelp,
  GraduationCap,
  House,
  ImageIcon,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Tag,
  Trophy,
  UserCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type ShellRole = 'learner' | 'mentor' | 'admin' | 'partner'

export type ShellNavItem = {
  label: string
  href: string
  icon: LucideIcon
  /** Only this exact path counts as active (role home pages). */
  exact?: boolean
}

export type ShellNavGroup = { title?: string; items: ShellNavItem[] }

export type ShellConfig = {
  roleLabel: string
  homeHref: string
  profileHref: string
  groups: ShellNavGroup[]
  /** Pinned under the groups, above the user card. */
  footer: ShellNavItem[]
  /** Phone bottom tab bar; the last slot is always "More" (opens the full menu). */
  tabs: ShellNavItem[]
  /** Shown in the phone top bar next to the menu button. */
  quickAction?: ShellNavItem
}

// Only pages Hadafi has today. Multi Learning and AI Examiner (learner) join
// these menus as each of those features lands.
const ASK_HANA: ShellNavItem = { label: 'Ask Hana', href: '/dashboard/assistant', icon: Sparkles }

export const SHELL_CONFIG: Record<ShellRole, ShellConfig> = {
  learner: {
    roleLabel: 'Learner',
    homeHref: '/dashboard',
    profileHref: '/dashboard/profile',
    groups: [
      { items: [{ label: 'Home', href: '/dashboard', icon: House, exact: true }, ASK_HANA] },
      {
        title: 'Learn',
        items: [
          { label: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
          { label: 'AI Examiner', href: '/dashboard/ai-examiner', icon: ShieldCheck },
          { label: 'Certificates', href: '/dashboard/certificates', icon: Award },
          { label: 'Achievements', href: '/dashboard/achievements', icon: Trophy },
        ],
      },
      {
        title: 'Mentors',
        items: [
          { label: 'AI Mentors', href: '/dashboard/ai-mentors', icon: Bot },
          { label: 'Human Mentors', href: '/dashboard/human-mentors', icon: Users },
          { label: 'My Sessions', href: '/dashboard/sessions', icon: CalendarCheck2 },
        ],
      },
      {
        title: 'Grow',
        items: [
          { label: 'Offers', href: '/dashboard/offers', icon: Tag },
          { label: 'Events', href: '/dashboard/events', icon: Calendar },
        ],
      },
    ],
    footer: [{ label: 'Support', href: '/dashboard/support', icon: CircleHelp }],
    tabs: [
      { label: 'Home', href: '/dashboard', icon: House, exact: true },
      { label: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
      ASK_HANA,
      { label: 'Mentors', href: '/dashboard/human-mentors', icon: Users },
    ],
    quickAction: ASK_HANA,
  },
  mentor: {
    roleLabel: 'Mentor',
    homeHref: '/mentor/dashboard',
    profileHref: '/mentor/dashboard/profile',
    groups: [
      {
        items: [
          { label: 'Dashboard', href: '/mentor/dashboard', icon: LayoutDashboard, exact: true },
          { label: 'My Sessions', href: '/mentor/dashboard/sessions', icon: CalendarDays },
          { label: 'Availability', href: '/mentor/dashboard/availability', icon: CalendarCheck },
          { label: 'Calendar', href: '/mentor/dashboard/calendar', icon: CalendarRange },
          { label: 'Mentees', href: '/mentor/dashboard/mentees', icon: Users },
        ],
      },
    ],
    footer: [{ label: 'Profile', href: '/mentor/dashboard/profile', icon: UserRound }],
    tabs: [
      { label: 'Home', href: '/mentor/dashboard', icon: LayoutDashboard, exact: true },
      { label: 'Sessions', href: '/mentor/dashboard/sessions', icon: CalendarDays },
      { label: 'Availability', href: '/mentor/dashboard/availability', icon: CalendarCheck },
      { label: 'Mentees', href: '/mentor/dashboard/mentees', icon: Users },
    ],
  },
  // Partner contacts: their organisation's participants only (read only).
  partner: {
    roleLabel: 'Partner',
    homeHref: '/partner',
    profileHref: '/partner/profile',
    groups: [{ items: [{ label: 'Participants', href: '/partner', icon: LayoutDashboard, exact: true }] }],
    footer: [{ label: 'Profile', href: '/partner/profile', icon: UserRound }],
    tabs: [
      { label: 'Participants', href: '/partner', icon: LayoutDashboard, exact: true },
      { label: 'Profile', href: '/partner/profile', icon: UserRound },
    ],
  },
  admin: {
    roleLabel: 'Admin',
    homeHref: '/admin/dashboard',
    profileHref: '/admin/profile',
    groups: [
      {
        items: [
          { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, exact: true },
          { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
          { label: 'AI Insights', href: '/admin/ai-insights', icon: MessageSquareText },
          { label: 'AI Dashboard', href: '/admin/ai-dashboard', icon: LayoutGrid },
          { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
          { label: 'AI safety review', href: '/admin/ai-safety', icon: ShieldCheck },
          { label: 'Invites', href: '/admin/invites', icon: Link2 },
        ],
      },
      {
        title: 'Content',
        items: [
          { label: 'Course Creation', href: '/admin/courses', icon: BookOpenCheck },
          { label: 'Live Events', href: '/admin/live-events', icon: CalendarDays },
          { label: 'Offers', href: '/admin/offers', icon: Tag },
          { label: 'Media Library', href: '/admin/media', icon: ImageIcon },
        ],
      },
      {
        title: 'People',
        items: [
          { label: 'Mentor Applications', href: '/admin/applications', icon: UserCheck },
          { label: 'Organisations', href: '/admin/organisations', icon: Building2 },
        ],
      },
      {
        title: 'Stakeholders',
        items: [
          { label: 'Supporters', href: '/admin/stakeholder-applications/vc', icon: Building2 },
          { label: 'Government', href: '/admin/stakeholder-applications/government', icon: Landmark },
        ],
      },
    ],
    footer: [],
    // Admin is desktop-first: phones get the top bar and menu only.
    tabs: [],
  },
}

export function isActive(pathname: string, item: ShellNavItem): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (item.exact) return path === item.href
  return path === item.href || path.startsWith(item.href + '/')
}

export function allItems(config: ShellConfig): ShellNavItem[] {
  return [...config.groups.flatMap((g) => g.items), ...config.footer]
}
