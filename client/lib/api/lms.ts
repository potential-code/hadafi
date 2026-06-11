// ── Learner-facing types ─────────────────────────────────────────────────────

export type LearnerCourse = {
  id: string
  title: string
  description: string | null
  cover: string | null
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  pointsPerUnit: number
  enableCertificate: boolean
  status: 'published'
  createdAt: string
  updatedAt: string
  isEnrolled: boolean
  progressPercentage: number
  enrolledCount: number | undefined
}

export type BlockProgress = {
  status: 'not_started' | 'in_progress' | 'completed'
  videoWatchPct: number | null
  completedAt: string | null
}

export type UnitProgress = {
  status: 'not_started' | 'in_progress' | 'completed'
  startedAt: string | null
  completedAt: string | null
}

export type ModuleProgress = {
  progressPercentage: number
  completedUnits: number
  totalUnits: number
  completedAt: string | null
}

export type CourseProgress = {
  progressPercentage: number
  completedModules: number
  totalModules: number
  completedAt: string | null
}

export type LearnerBlock = LearningBlock & {
  blockProgress: BlockProgress | null
  isLocked: boolean
}

export type LearnerUnit = Omit<Unit, 'blocks'> & {
  blocks: LearnerBlock[]
  unitProgress: UnitProgress | null
  isLocked: boolean
}

export type LearnerModule = Omit<CourseModule, 'units'> & {
  units: LearnerUnit[]
  moduleProgress: ModuleProgress | null
  isLocked: boolean
}

export type LearnerCourseDetail = LearnerCourse & {
  modules: LearnerModule[]
  preAssessment: (Assessment & { isLocked: boolean; isCompleted: boolean }) | null
  postAssessment: (Assessment & { isLocked: boolean }) | null
  courseProgress: CourseProgress | null
}

export type AssessmentSummary = {
  assessment: {
    id: string
    title: string
    description: string | null
    assessmentType: 'pre' | 'post'
    isGraded: boolean
    passingScore: number
    showAnswers: boolean
    maxAttempts: number
    totalQuestions: number
  }
  attemptsMade: number
  attemptsRemaining: number
  hasPassed: boolean
  bestScore: number | null
  latestAttempt: { id: string; attemptNumber: number; score: number | null; passed: boolean | null; completedAt: string | null } | null
  canStartAssessment: boolean
  correctAnswers: { questionText: string; correctAnswer: number }[] | null
}

export type CourseCertificate = {
  id: string
  userId: string
  courseId: string
  certificateNumber: string
  issuedAt: string
  certificateUrl: string | null
  status: 'active' | 'inactive'
}

export type CertificateWithCourse = CourseCertificate & { courseTitle: string }

// ── Admin-facing types ───────────────────────────────────────────────────────

export type CourseSummary = {
  id: string
  title: string
  description: string | null
  cover: string | null
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  pointsPerUnit: number
  enableCertificate: boolean
  status: 'draft' | 'published'
  enrolled: number
  createdAt: string
  updatedAt: string
}

export type BlockQuestion = {
  id: string
  blockId: string
  kind: 'survey' | 'action-plan'
  format: 'multiple-choice' | 'true-false' | 'short-text'
  prompt: string
  options: string[] | null
  correctIndex: number | null
  correctBool: boolean | null
  placeholder: string | null
  order: number
}

export type LearningBlock = {
  id: string
  unitId: string
  title: string
  type: 'text' | 'video' | 'image' | 'question'
  order: number
  body: string | null
  videoUrl: string | null
  transcript: string | null
  imageUrl: string | null
  questions: BlockQuestion[]
}

export type Unit = {
  id: string
  moduleId: string
  title: string
  description: string | null
  durationMinutes: number | null
  order: number
  blocks: LearningBlock[]
}

export type CourseModule = {
  id: string
  courseId: string
  title: string
  description: string | null
  order: number
  units: Unit[]
}

export type AssessmentQuestion = {
  id: string
  assessmentId: string
  questionType: 'multiple-choice' | 'true-false'
  questionText: string
  options: string[]
  correctAnswer: number
  explanation: string | null
  order: number
}

export type Assessment = {
  id: string
  courseId: string
  title: string
  description: string | null
  assessmentType: 'pre' | 'post'
  isGraded: boolean
  passingScore: number
  showAnswers: boolean
  maxAttempts: number
  questions: AssessmentQuestion[]
}

export type CourseWithContent = CourseSummary & {
  modules: CourseModule[]
  preAssessment: Assessment | null
  postAssessment: Assessment | null
}

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/api/lms`

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('smeep_token')
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error((err as { message?: string }).message ?? 'Request failed')
  }
  return ((await res.json()) as { data: T }).data
}

// Courses
export const fetchCourses = () => apiFetch<CourseSummary[]>('/admin/courses')
export const fetchCourse = (id: string) => apiFetch<CourseWithContent>(`/admin/courses/${id}`)
export const apiCreateCourse = (data: Partial<CourseSummary>) =>
  apiFetch<CourseSummary>('/admin/courses', { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateCourse = (id: string, data: Partial<CourseSummary>) =>
  apiFetch<CourseSummary>(`/admin/courses/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteCourse = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/courses/${id}`, { method: 'DELETE' })

// Modules
export const apiCreateModule = (courseId: string, data: { title: string; description?: string }) =>
  apiFetch<CourseModule>(`/admin/courses/${courseId}/modules`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateModule = (moduleId: string, data: { title?: string; description?: string }) =>
  apiFetch<CourseModule>(`/admin/modules/${moduleId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteModule = (moduleId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/modules/${moduleId}`, { method: 'DELETE' })
export const apiReorderModules = (courseId: string, ids: string[]) =>
  apiFetch<{ ok: boolean }>(`/admin/courses/${courseId}/modules/reorder`, { method: 'POST', body: JSON.stringify({ ids }) })

// Units
export const apiCreateUnit = (moduleId: string, data: { title: string; description?: string; durationMinutes?: number }) =>
  apiFetch<Unit>(`/admin/modules/${moduleId}/units`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateUnit = (unitId: string, data: { title?: string; description?: string; durationMinutes?: number }) =>
  apiFetch<Unit>(`/admin/units/${unitId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteUnit = (unitId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/units/${unitId}`, { method: 'DELETE' })
export const apiReorderUnits = (moduleId: string, ids: string[]) =>
  apiFetch<{ ok: boolean }>(`/admin/modules/${moduleId}/units/reorder`, { method: 'POST', body: JSON.stringify({ ids }) })

// Blocks
export const apiCreateBlock = (unitId: string, data: Omit<LearningBlock, 'id' | 'unitId' | 'order' | 'questions'>) =>
  apiFetch<LearningBlock>(`/admin/units/${unitId}/blocks`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateBlock = (blockId: string, data: Partial<Omit<LearningBlock, 'id' | 'unitId' | 'questions'>>) =>
  apiFetch<LearningBlock>(`/admin/blocks/${blockId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteBlock = (blockId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/blocks/${blockId}`, { method: 'DELETE' })
export const apiReorderBlocks = (unitId: string, ids: string[]) =>
  apiFetch<{ ok: boolean }>(`/admin/units/${unitId}/blocks/reorder`, { method: 'POST', body: JSON.stringify({ ids }) })

// Block questions
export const apiCreateBlockQuestion = (blockId: string, data: Omit<BlockQuestion, 'id' | 'blockId' | 'order'>) =>
  apiFetch<BlockQuestion>(`/admin/blocks/${blockId}/questions`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateBlockQuestion = (qId: string, data: Partial<Omit<BlockQuestion, 'id' | 'blockId'>>) =>
  apiFetch<BlockQuestion>(`/admin/block-questions/${qId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteBlockQuestion = (qId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/block-questions/${qId}`, { method: 'DELETE' })
export const apiReorderBlockQuestions = (blockId: string, ids: string[]) =>
  apiFetch<{ ok: boolean }>(`/admin/blocks/${blockId}/questions/reorder`, { method: 'POST', body: JSON.stringify({ ids }) })

// Assessments
export const apiCreateAssessment = (courseId: string, data: Omit<Assessment, 'id' | 'courseId' | 'questions'>) =>
  apiFetch<Assessment>(`/admin/courses/${courseId}/assessments`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateAssessment = (assessmentId: string, data: Partial<Omit<Assessment, 'id' | 'courseId' | 'assessmentType' | 'questions'>>) =>
  apiFetch<Assessment>(`/admin/assessments/${assessmentId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteAssessment = (assessmentId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/assessments/${assessmentId}`, { method: 'DELETE' })

// Assessment questions
export const apiCreateAssessmentQuestion = (assessmentId: string, data: Omit<AssessmentQuestion, 'id' | 'assessmentId' | 'order'>) =>
  apiFetch<AssessmentQuestion>(`/admin/assessments/${assessmentId}/questions`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateAssessmentQuestion = (qId: string, data: Partial<Omit<AssessmentQuestion, 'id' | 'assessmentId'>>) =>
  apiFetch<AssessmentQuestion>(`/admin/assessment-questions/${qId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteAssessmentQuestion = (qId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/assessment-questions/${qId}`, { method: 'DELETE' })
export const apiReorderAssessmentQuestions = (assessmentId: string, ids: string[]) =>
  apiFetch<{ ok: boolean }>(`/admin/assessments/${assessmentId}/questions/reorder`, { method: 'POST', body: JSON.stringify({ ids }) })

// ── Learner API ──────────────────────────────────────────────────────────────

// Courses
export const fetchLearnerCourses = () =>
  apiFetch<LearnerCourse[]>('/courses')
export const fetchLearnerCourse = (courseId: string) =>
  apiFetch<LearnerCourseDetail>(`/courses/${courseId}`)
export const apiEnrollInCourse = (courseId: string) =>
  apiFetch<{ userId: string; courseId: string; status: string; enrolledAt: string }>(`/courses/${courseId}/enroll`, { method: 'POST' })

// Progress
export const apiUpdateBlockProgress = (
  blockId: string,
  data: { status: 'not_started' | 'in_progress' | 'completed'; videoWatchPct?: number },
) => apiFetch<BlockProgress>(`/learning-blocks/${blockId}/progress`, { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateUnitProgress = (
  unitId: string,
  data: { status: 'not_started' | 'in_progress' | 'completed' },
) => apiFetch<UnitProgress>(`/units/${unitId}/progress`, { method: 'POST', body: JSON.stringify(data) })
export const apiSaveQuestionAnswer = (
  questionId: string,
  answerData: { selectedAnswer?: number; openEndedAnswer?: string },
) =>
  apiFetch<{ id: string; questionId: string; answerData: unknown; submittedAt: string }>(
    `/questions/${questionId}/answer`,
    { method: 'POST', body: JSON.stringify({ answerData }) },
  )

// Action plan
export const fetchActionPlan = (courseId: string) =>
  apiFetch<{ courseTitle: string; questions: Array<{ question: BlockQuestion; answer: unknown | null }> }>(
    `/courses/${courseId}/action-plan`,
  )
/** Returns a raw Response so the caller can stream the PDF blob. */
export const downloadActionPlanPdf = (courseId: string) =>
  fetch(`${BASE}/courses/${courseId}/action-plan/pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })

// Assessments
export const fetchAssessmentSummary = (assessmentId: string) =>
  apiFetch<AssessmentSummary>(`/assessments/${assessmentId}/summary`)
export const fetchAssessmentQuestions = (assessmentId: string) =>
  apiFetch<Omit<AssessmentQuestion, 'correctAnswer'>[]>(`/assessments/${assessmentId}/questions`)
export const apiSubmitAssessmentAttempt = (assessmentId: string, answers: Record<string, number>) =>
  apiFetch<AssessmentSummary>(`/assessments/${assessmentId}/attempts`, { method: 'POST', body: JSON.stringify({ answers }) })

// Certificates
export const fetchCourseCertificate = (courseId: string) =>
  apiFetch<CourseCertificate | null>(`/courses/${courseId}/certificate`)
export const apiIssueCertificate = (courseId: string) =>
  apiFetch<CourseCertificate>(`/courses/${courseId}/certificate`, { method: 'POST' })
export const fetchUserCertificates = () =>
  apiFetch<CertificateWithCourse[]>('/certificates')
/** Returns a raw Response so the caller can stream the certificate PDF blob. */
export const downloadCertificate = (certId: string) =>
  fetch(`${BASE}/certificates/${certId}/download`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
