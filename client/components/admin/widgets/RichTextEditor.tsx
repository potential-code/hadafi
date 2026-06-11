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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
        HTMLAttributes: { class: 'text-brand-primary underline' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[140px] px-3 py-2.5 text-brand-text-primary',
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
    return (
      <div className="rounded-xl border border-brand-surface-2 bg-white min-h-[180px]" />
    )
  }

  return (
    <div className="rounded-xl border border-brand-surface-2 bg-white overflow-hidden focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/15 transition-all">
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

  const Btn = ({
    active,
    onMouseDown,
    children,
    title,
  }: {
    active?: boolean
    onMouseDown: (e: React.MouseEvent) => void
    children: React.ReactNode
    title: string
  }) => (
    <button
      type="button"
      title={title}
      // preventDefault on mousedown stops the button from stealing focus from
      // the editor. Without it, clicking a toolbar button blurs the editor,
      // which causes ProseMirror to flush stored marks — so the next typed
      // character inherits the toggled mark (e.g. bold) unintentionally.
      onMouseDown={onMouseDown}
      className={cn(
        'w-7 h-7 rounded-md flex items-center justify-center text-xs transition-colors',
        active
          ? 'bg-brand-primary text-white'
          : 'text-brand-text-muted hover:bg-brand-surface hover:text-brand-primary',
      )}
    >
      {children}
    </button>
  )

  return (
    <div className="flex items-center flex-wrap gap-0.5 border-b border-brand-surface-2 bg-brand-surface/40 px-2 py-1.5">
      <Btn
        title="Bold"
        active={editor.isActive('bold')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
      >
        <Bold className="w-3.5 h-3.5" />
      </Btn>
      <Btn
        title="Italic"
        active={editor.isActive('italic')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
      >
        <Italic className="w-3.5 h-3.5" />
      </Btn>
      <span className="w-px h-4 bg-brand-surface-2 mx-1" />
      <Btn
        title="Heading 1"
        active={editor.isActive('heading', { level: 1 })}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}
      >
        <Heading1 className="w-3.5 h-3.5" />
      </Btn>
      <Btn
        title="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
      >
        <Heading2 className="w-3.5 h-3.5" />
      </Btn>
      <Btn
        title="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run() }}
      >
        <Heading3 className="w-3.5 h-3.5" />
      </Btn>
      <span className="w-px h-4 bg-brand-surface-2 mx-1" />
      <Btn
        title="Bulleted list"
        active={editor.isActive('bulletList')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
      >
        <List className="w-3.5 h-3.5" />
      </Btn>
      <Btn
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </Btn>
      <Btn
        title="Blockquote"
        active={editor.isActive('blockquote')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run() }}
      >
        <Quote className="w-3.5 h-3.5" />
      </Btn>
      <span className="w-px h-4 bg-brand-surface-2 mx-1" />
      <Btn
        title="Add or edit link"
        active={editor.isActive('link')}
        onMouseDown={(e) => { e.preventDefault(); setLink() }}
      >
        <LinkIcon className="w-3.5 h-3.5" />
      </Btn>
      <Btn
        title="Remove link"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetLink().run() }}
      >
        <Link2Off className="w-3.5 h-3.5" />
      </Btn>
    </div>
  )
}
