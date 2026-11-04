// Course builder: block and question types, and blank blocks for new content.

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

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * A blank question. Survey questions start as multiple choice; Action Plan
 * prompts are always a written answer (the learner player shows a text box
 * for each prompt and saves it to their action plan).
 */
export function newQuestion(kind: AdminQuestionKind = 'survey'): AdminQuestion {
  if (kind === 'action-plan') {
    return { id: makeId('q'), kind, format: 'short-text', prompt: 'New prompt', placeholder: '' }
  }
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
  if (type === 'text') return { id: makeId('blk'), title, type: 'text', body: '' }
  if (type === 'video') return { id: makeId('blk'), title, type: 'video', videoUrl: '', transcript: '' }
  if (type === 'image') return { id: makeId('blk'), title, type: 'image', imageUrl: '' }
  return { id: makeId('blk'), title, type: 'question', questions: [newQuestion('survey')] }
}

/** A question block holding one Action Plan prompt; more prompts can be added. */
export function newActionPlanBlock(title = 'Action plan'): AdminLearningBlock {
  return { id: makeId('blk'), title, type: 'question', questions: [newQuestion('action-plan')] }
}
