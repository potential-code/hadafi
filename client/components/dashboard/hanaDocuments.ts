'use client'

/**
 * Documents a learner shares with Hana (ported from SMEEP). The Hadafi server
 * reads the file in memory and returns only its text (POST
 * /api/ask-hana/documents; nothing is stored). The text goes with the
 * learner's next message, after a marker the chat uses to show a file chip
 * instead of the document itself.
 */

export type HanaSharedDocument = { name: string; text: string; truncated: boolean; pages?: number }

export interface HanaAttachOptions {
  /** The file input's accept list. */
  accept: string
  /** Reads the file (server side); rejects with a message the learner can act on. */
  read: (file: File) => Promise<HanaSharedDocument>
  /** The message actually sent: what the learner typed plus the document. */
  compose: (message: string, doc: HanaSharedDocument) => string
  /** Sent when the learner shares a document without typing anything. */
  defaultMessage: string
  /** Placeholder once a document is ready. */
  askAbout: (name: string) => string
}

export const DOC_MARKER = '\n\n[Attached document "'
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024
export const DOCUMENT_DEFAULT_MESSAGE = 'Please read this document and tell me what stands out.'
export const DOCUMENT_ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv'
export const DOCUMENT_HINT = 'PDF, Word, TXT, Markdown or CSV, up to 15 MB'

/** Reads a document on the Hadafi server. Also used by the AI mentor chat. */
export async function readDocument(file: File): Promise<HanaSharedDocument> {
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error('That file is over 15 MB. Try a smaller one.')
  if (file.size === 0) throw new Error('That file is empty.')
  const form = new FormData()
  form.append('file', file)
  let res: Response
  try {
    res = await fetch('/api/ask-hana/documents', { method: 'POST', body: form, credentials: 'same-origin' })
  } catch {
    throw new Error('That file could not be sent. Check your connection and try again.')
  }
  const body = (await res.json().catch(() => null)) as
    | { success: true; data: HanaSharedDocument }
    | { success: false; error?: { message?: string } }
    | null
  if (!res.ok || !body || body.success !== true) {
    const message = body && body.success === false ? body.error?.message : undefined
    throw new Error(message || 'That file could not be read. Try again.')
  }
  return body.data
}

/** What Hana receives: the learner's words, then the document's text. */
export function composeWithDocument(message: string, doc: HanaSharedDocument): string {
  const note = doc.truncated ? ' (only the first part of a long document)' : ''
  return `${message}${DOC_MARKER}${doc.name.replace(/["\r\n]/g, "'")}"${note}]\n${doc.text}`
}

/** The learner's words and the shared document's name, from a sent message. */
export function splitSharedDocument(text: string): { message: string; docName: string | null } {
  const at = text.indexOf(DOC_MARKER)
  if (at < 0) return { message: text, docName: null }
  const rest = text.slice(at + DOC_MARKER.length)
  const end = rest.indexOf('"')
  return { message: text.slice(0, at), docName: (end > 0 ? rest.slice(0, end) : '') || 'Document' }
}

/** Document sharing for a Hana composer (HanaComposerOptions `attach`). */
export function hanaAttachOptions(): HanaAttachOptions {
  return {
    accept: DOCUMENT_ACCEPT,
    read: readDocument,
    compose: composeWithDocument,
    defaultMessage: DOCUMENT_DEFAULT_MESSAGE,
    askAbout: (name) => `Ask about ${name}`,
  }
}
