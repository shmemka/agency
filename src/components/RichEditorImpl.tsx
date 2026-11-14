import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { Placeholder } from '@tiptap/extensions'
import { Bold, Italic, Link2, List, ListOrdered, RemoveFormatting, Strikethrough, Underline } from 'lucide-react'
import { HIGHLIGHTS, toHtml, type HighlightId } from '../lib/rich'
import { promptDialog } from './dialogs'
import { cx } from './ui'
import type { RichEditorProps } from './RichEditor'

// выделение цветом: в тексте хранится только название цвета, оттенок задаёт index.css
const ColorHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: (el) => el.getAttribute('data-color') || 'yellow',
        renderHTML: (a) => ({ 'data-color': a.color }),
      },
    }
  },
}).configure({ multicolor: true })

const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

export default function RichEditorImpl({ value, onChange, onBlur, onSubmit, placeholder, label, compact, autoFocus, className, field }: RichEditorProps) {
  // что редактор отдал наружу, а родитель ещё не вернул обратно в value. При быстром наборе value отстаёт
  // на пару букв — это не повод перезаписывать текст. Подставляем value, только если оно пришло извне:
  // очистили поле после отправки, коллега поменял описание
  const pending = useRef<string[]>([])
  // обработчики берём свежие на каждом рендере: редактор создаётся один раз
  const submit = useRef(onSubmit)
  submit.current = onSubmit
  const cbs = useRef({ onChange, onBlur })
  cbs.current = { onChange, onBlur }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } },
      }),
      ColorHighlight,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: toHtml(value),
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'rich min-h-[inherit] px-4 py-3 leading-5 outline-none',
        ...(label ? { 'aria-label': label } : {}),
        ...(field ? { 'data-field': field } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
      },
      // комментарий: Enter — отправить, Shift+Enter — новая строка. В списке Enter — новый пункт. На телефоне отправляет кнопка
      handleKeyDown: (_view, e) => {
        if (!submit.current || e.key !== 'Enter' || e.shiftKey || e.isComposing || coarse()) return false
        if (editorRef.current?.isActive('listItem')) return false
        e.preventDefault()
        submit.current()
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? '' : editor.getHTML()
      pending.current.push(html)
      cbs.current.onChange(html)
    },
    onBlur: () => cbs.current.onBlur?.(),
  })
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    const v = value ?? ''
    const at = pending.current.indexOf(v)
    if (at >= 0) {
      pending.current = pending.current.slice(at + 1)
      return
    }
    pending.current = []
    const now = editor.isEmpty ? '' : editor.getHTML()
    if (v === now || toHtml(v) === now) return
    editor.commands.setContent(toHtml(v), { emitUpdate: false })
    // после отправки комментария следующий начинается обычным текстом, без «залипшего» курсива
    editor.view.dispatch(editor.state.tr.setStoredMarks([]))
  }, [value, editor])

  return (
    <div
      // поле обычно лежит внутри <label>: клик по тексту браузер переадресует первой кнопке («Жирный»). Гасим это
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) e.preventDefault()
      }}
      className={cx(
        'group/rich w-full rounded-2xl bg-soft text-sm text-ink ring-1 ring-transparent transition-shadow duration-150 focus-within:bg-surface focus-within:ring-ink/25',
        className,
      )}
    >
      <Toolbar editor={editor} compact={compact} />
      <EditorContent editor={editor} className="min-h-[inherit]" />
    </div>
  )
}

const BTN = 'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink'
const ON = 'bg-ink/8 text-ink'

function Toolbar({ editor, compact }: { editor: Editor; compact?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      color: (e.isActive('highlight') ? (e.getAttributes('highlight').color as HighlightId) : null) ?? null,
    }),
  })

  async function link() {
    if (s.link) return editor.chain().focus().extendMarkRange('link').unsetLink().run()
    const url = await promptDialog({ title: 'Ссылка', label: 'Адрес', placeholder: 'https://', ok: 'Добавить', required: true })
    if (!url?.trim()) return editor.commands.focus()
    const href = /^[a-z]+:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    if (editor.state.selection.empty) editor.chain().focus().insertContent({ type: 'text', text: url.trim(), marks: [{ type: 'link', attrs: { href } }] }).run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  // кнопки не забирают фокус у текста, иначе выделение пропадёт
  const keep = (e: React.MouseEvent) => e.preventDefault()
  const item = (on: boolean, title: string, run: () => void, icon: React.ReactNode) => (
    <button type="button" title={title} aria-label={title} aria-pressed={on} onMouseDown={keep} onClick={run} className={cx(BTN, on && ON)}>
      {icon}
    </button>
  )
  const ic = 'size-[15px]'
  return (
    <div
      role="toolbar"
      aria-label="Форматирование"
      className={cx(
        'flex flex-wrap items-center gap-0.5 px-2 pt-2',
        // в поле комментария панель появляется, когда пишешь, чтобы не занимать место
        compact && 'hidden group-focus-within/rich:flex',
      )}
    >
      {item(s.bold, 'Жирный (⌘B)', () => editor.chain().focus().toggleBold().run(), <Bold className={ic} strokeWidth={2} />)}
      {item(s.italic, 'Курсив (⌘I)', () => editor.chain().focus().toggleItalic().run(), <Italic className={ic} strokeWidth={1.75} />)}
      {item(s.underline, 'Подчёркнутый (⌘U)', () => editor.chain().focus().toggleUnderline().run(), <Underline className={ic} strokeWidth={1.75} />)}
      {item(s.strike, 'Зачёркнутый', () => editor.chain().focus().toggleStrike().run(), <Strikethrough className={ic} strokeWidth={1.75} />)}
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      {item(s.bullet, 'Список', () => editor.chain().focus().toggleBulletList().run(), <List className={ic} strokeWidth={1.75} />)}
      {item(s.ordered, 'Нумерованный список', () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className={ic} strokeWidth={1.75} />)}
      {item(s.link, s.link ? 'Убрать ссылку' : 'Ссылка', link, <Link2 className={ic} strokeWidth={1.75} />)}
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      {HIGHLIGHTS.map((h) => (
        <button
          key={h.id}
          type="button"
          title={`Выделить: ${h.label.toLowerCase()}`}
          aria-label={`Выделить цветом: ${h.label.toLowerCase()}`}
          aria-pressed={s.color === h.id}
          onMouseDown={keep}
          onClick={() => (s.color === h.id ? editor.chain().focus().unsetHighlight().run() : editor.chain().focus().setHighlight({ color: h.id }).run())}
          className={cx(BTN, 'hover:bg-transparent')}
        >
          <span data-swatch={h.id} className={cx('size-4 shrink-0 rounded-full ring-1 ring-ink/10 transition-shadow', s.color === h.id && 'ring-2 ring-ink/60 ring-offset-1 ring-offset-surface')} />
        </button>
      ))}
      {item(false, 'Убрать форматирование', () => editor.chain().focus().unsetAllMarks().clearNodes().run(), <RemoveFormatting className={ic} strokeWidth={1.75} />)}
    </div>
  )
}
