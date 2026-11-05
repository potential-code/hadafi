'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Link2Off,
  Quote,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { richTextClass } from '@/components/admin/lms/shared'

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing…',
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const lastEmitted = useRef<string>(value || '')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Persisted into the stored lesson HTML, so it stays as it was.
        HTMLAttributes: { class: 'text-brand-primary underline' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          richTextClass,
          'min-h-[140px] px-3.5 py-3 focus:outline-none',
          // Placeholder (tiptap sets data-placeholder on the empty first node).
          '[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-ui-muted [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      lastEmitted.current = html
      onChange(html)
    },
  })

  useEffect(() => {
    if (!editor) return
    // Skip if the value is what we just emitted — echoing our own onUpdate back
    // into setContent resets the cursor mid-keystroke, causing stored marks
    // (bold, italic) to bleed into subsequent typed characters.
    if (value === lastEmitted.current) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
      // Clear stored marks after loading external content so the cursor at the
      // end of an existing bold/italic run doesn't auto-apply that mark to new text.
      editor.view.dispatch(editor.view.state.tr.setStoredMarks(null))
      lastEmitted.current = value || ''
    }
  }, [value, editor])

  if (!editor) {
    return <div className="min-h-[180px] rounded-[10px] border border-ui-line bg-ui-surface" />
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-ui-line bg-ui-surface transition-[border-color,box-shadow] focus-within:border-ui-brand focus-within:ring-2 focus-within:ring-ui-brand/20">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  function setLink() {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-ui-line bg-ui-surface-2 p-1"
    >
      <Btn
        title="Bold"
        icon={Bold}
        active={editor.isActive('bold')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
      />
      <Btn
        title="Italic"
        icon={Italic}
        active={editor.isActive('italic')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
      />
      <span aria-hidden className="mx-1 h-4 w-px bg-ui-line" />
      <Btn
        title="Heading 1"
        icon={Heading1}
        active={editor.isActive('heading', { level: 1 })}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}
      />
      <Btn
        title="Heading 2"
        icon={Heading2}
        active={editor.isActive('heading', { level: 2 })}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
      />
      <Btn
        title="Heading 3"
        icon={Heading3}
        active={editor.isActive('heading', { level: 3 })}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run() }}
      />
      <span aria-hidden className="mx-1 h-4 w-px bg-ui-line" />
      <Btn
        title="Bulleted list"
        icon={List}
        active={editor.isActive('bulletList')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
      />
      <Btn
        title="Numbered list"
        icon={ListOrdered}
        active={editor.isActive('orderedList')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}
      />
      <Btn
        title="Blockquote"
        icon={Quote}
        active={editor.isActive('blockquote')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run() }}
      />
      <span aria-hidden className="mx-1 h-4 w-px bg-ui-line" />
      <Btn
        title="Add or edit link"
        icon={LinkIcon}
        active={editor.isActive('link')}
        onMouseDown={(e) => { e.preventDefault(); setLink() }}
      />
      <Btn
        title="Remove link"
        icon={Link2Off}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetLink().run() }}
      />
    </div>
  )
}

function Btn({
  active,
  onMouseDown,
  icon: Icon,
  title,
}: {
  active?: boolean
  onMouseDown: (e: React.MouseEvent) => void
  icon: LucideIcon
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      // preventDefault on mousedown stops the button from stealing focus from
      // the editor. Without it, clicking a toolbar button blurs the editor,
      // which causes ProseMirror to flush stored marks — so the next typed
      // character inherits the toggled mark (e.g. bold) unintentionally.
      onMouseDown={onMouseDown}
      // Keyboard users (Enter/Space) get a click without a mousedown.
      onClick={(e) => {
        if (e.detail === 0) onMouseDown(e)
      }}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand',
        active ? 'bg-ui-brand-soft text-ui-brand-text' : 'text-ui-muted hover:bg-ui-surface hover:text-ui-text',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  )
}
