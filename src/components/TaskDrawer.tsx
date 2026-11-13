import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, Check, FileText, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { dateTime } from '../lib/format'
import type { Task, TaskComment, TaskFile } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Drawer, IconButton, Select, Spinner, Textarea, cx } from './ui'
import { DateInput } from './DateInput'
import { confirmDialog, confirmDiscard } from './dialogs'

export const TASK_BUCKET = 'task-files'

const sizeLabel = (n: number | null) => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`)
const isImage = (f: TaskFile) => f.mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic)$/i.test(f.name)

function storageName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

/** Строка свойства: подпись слева, значение справа (на телефоне — подпись сверху) */
function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center sm:gap-4">
      <span className="text-[13px] text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Панель задачи справа: свойства, описание, вложения и комментарии */
export function TaskDrawer({ task, onClose }: { task: Task; onClose: () => void }) {
  const { profile, team, isAdmin, personName, personAvatar } = useAuth()
  const { sections, bloggers, reload } = useData()
  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.description ?? '')
  const [comments, setComments] = useState<TaskComment[] | null>(null)
  const [files, setFiles] = useState<TaskFile[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [drag, setDrag] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const listEnd = useRef<HTMLDivElement>(null)

  // данные задачи могли поменяться у коллеги: подхватываем, если поле сейчас не редактируется
  useEffect(() => {
    if (document.activeElement?.getAttribute('data-field') !== 'title') setTitle(task.title)
    if (document.activeElement?.getAttribute('data-field') !== 'desc') setDesc(task.description ?? '')
  }, [task.title, task.description])

  const people = team.filter((t) => t.is_active && (isAdmin || t.id === profile?.id || t.role === 'admin' || t.id === task.assignee_id))
  const canDelete = isAdmin || task.created_by === profile?.id

  const loadComments = useCallback(async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at')
    setComments((data ?? []) as TaskComment[])
  }, [task.id])
  const loadFiles = useCallback(async () => {
    const { data } = await supabase.from('task_files').select('*').eq('task_id', task.id).order('created_at')
    setFiles((data ?? []) as TaskFile[])
  }, [task.id])

  useEffect(() => {
    loadComments()
    loadFiles()
    const ch = supabase
      .channel(`task-${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` }, loadComments)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_files', filter: `task_id=eq.${task.id}` }, loadFiles)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [task.id, loadComments, loadFiles])

  async function patch(p: Partial<Task>) {
    const { error } = await supabase.from('tasks').update(p).eq('id', task.id)
    if (error) toast(`Не сохранилось: ${error.message}`)
    await reload('tasks')
  }

  async function saveTitle() {
    const t = title.trim()
    if (!t) return setTitle(task.title)
    if (t !== task.title) await patch({ title: t })
  }

  async function saveDesc() {
    const v = desc.trim() || null
    if (v !== (task.description ?? null)) await patch({ description: v })
  }

  async function remove() {
    if (!(await confirmDialog({ title: 'Удалить задачу?', body: `«${task.title}» удалится вместе с комментариями и вложениями`, ok: 'Удалить', danger: true }))) return
    const paths = (files ?? []).map((f) => f.storage_path)
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) return toast(error.message)
    if (paths.length) await supabase.storage.from(TASK_BUCKET).remove(paths)
    await reload('tasks')
    toast('Задача удалена')
    onClose()
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const { error } = await supabase.from('task_comments').insert({ task_id: task.id, body })
    setSending(false)
    if (error) return toast(error.message.includes('task_comments') ? 'Не получилось: запустите миграцию 008_task_board.sql в Supabase' : error.message)
    setText('')
    await loadComments()
    listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  async function dropComment(c: TaskComment) {
    if (!(await confirmDialog({ title: 'Удалить комментарий?', body: c.body.slice(0, 140), ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from('task_comments').delete().eq('id', c.id)
    if (error) return toast(error.message)
    loadComments()
  }

  async function upload(list: FileList | File[]) {
    const arr = [...list]
    if (!arr.length) return
    setUploading((n) => n + arr.length)
    for (const f of arr) {
      if (f.size > 50 * 1024 * 1024) {
        toast(`«${f.name}» больше 50 МБ`)
        setUploading((n) => n - 1)
        continue
      }
      const path = `${task.id}/${storageName(f.name)}`
      const up = await supabase.storage.from(TASK_BUCKET).upload(path, f, { contentType: f.type || undefined })
      if (up.error) toast(`«${f.name}» не загрузился: ${/bucket|not found/i.test(up.error.message) ? 'запустите миграцию 008_task_board.sql' : up.error.message}`)
      else {
        const { error } = await supabase.from('task_files').insert({ task_id: task.id, name: f.name, storage_path: path, size: f.size, mime: f.type || null })
        if (error) {
          toast(`«${f.name}»: ${error.message}`)
          await supabase.storage.from(TASK_BUCKET).remove([path])
        }
      }
      setUploading((n) => n - 1)
    }
    loadFiles()
  }

  async function open(f: TaskFile) {
    const { data, error } = await supabase.storage.from(TASK_BUCKET).createSignedUrl(f.storage_path, 3600, isImage(f) ? undefined : { download: f.name })
    if (error || !data) return toast(`Файл не открылся: ${error?.message ?? 'нет доступа'}`)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function dropFile(f: TaskFile) {
    if (!(await confirmDialog({ title: 'Удалить файл?', body: f.name, ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from('task_files').delete().eq('id', f.id)
    if (error) return toast(error.message)
    await supabase.storage.from(TASK_BUCKET).remove([f.storage_path])
    loadFiles()
  }

  // перед закрытием дописываем название и описание, а недописанный комментарий не теряем молча
  const guard = async () => {
    await saveTitle()
    await saveDesc()
    return !text.trim() || (await confirmDiscard())
  }
  const closeSafe = async () => {
    if (await guard()) onClose()
  }

  const done = Boolean(task.done_at)
  const sectionId = task.section_id && sections.some((s) => s.id === task.section_id) ? task.section_id : (sections[0]?.id ?? '')

  return (
    <Drawer onClose={onClose} beforeClose={guard} label={`Задача: ${task.title}`}>
      <div
        className="relative flex flex-1 flex-col gap-3 p-3 md:p-4"
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDrag(false)
          upload(e.dataTransfer.files)
        }}
      >
        {drag && (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-card bg-lime/40 text-base ring-2 ring-ink/20 ring-inset md:inset-4">
            Отпустите, чтобы прикрепить
          </div>
        )}

        {/* шапка */}
        <section className="rounded-card bg-surface p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Button
              size="sm"
              variant={done ? 'primary' : 'secondary'}
              onClick={() => patch({ done_at: done ? null : new Date().toISOString() })}
              className={cx(done && 'bg-leaf text-ink hover:bg-leaf/85')}
            >
              <Check className="size-3.5" strokeWidth={2} />
              {done ? 'Выполнена' : 'Отметить выполненной'}
            </Button>
            <span className="flex-1" />
            {canDelete && (
              <IconButton label="Удалить задачу" onClick={remove} className="size-8 hover:text-bad">
                <Trash2 className="size-4" strokeWidth={1.5} />
              </IconButton>
            )}
            <IconButton label="Закрыть" onClick={closeSafe} className="hidden size-8 md:inline-flex">
              <X className="size-4" strokeWidth={1.5} />
            </IconButton>
          </div>

          <textarea
            data-field="title"
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setTitle(task.title)
                setTimeout(() => (document.activeElement as HTMLElement)?.blur())
              }
            }}
            rows={1}
            aria-label="Название задачи"
            className={cx('-mx-2 w-[calc(100%+16px)] resize-none rounded-xl px-2 py-1 text-[22px] leading-7 tracking-tight [field-sizing:content] hover:bg-soft focus:bg-soft focus:outline-none', done && 'text-muted line-through')}
          />

          <div className="mt-5 flex flex-col gap-3">
            <Prop label="Исполнитель">
              <Select value={task.assignee_id ?? ''} onChange={(e) => patch({ assignee_id: e.target.value || null })} aria-label="Исполнитель">
                <option value="">Не назначен</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === profile?.id ? `${p.full_name || p.email} (вы)` : p.full_name || p.email}
                  </option>
                ))}
              </Select>
            </Prop>
            <Prop label="Срок">
              <DateInput value={task.due_date} onChange={(v) => patch({ due_date: v })} placeholder="Без срока" aria-label="Срок" />
            </Prop>
            {sections.length > 0 && (
              <Prop label="Колонка">
                <Select value={sectionId} onChange={(e) => patch({ section_id: e.target.value, position: Date.now() / 1000 })} aria-label="Колонка">
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Prop>
            )}
            <Prop label="Блогер">
              <div className="flex items-center gap-2">
                <Select className="min-w-0 flex-1" value={task.blogger_id ?? ''} onChange={(e) => patch({ blogger_id: e.target.value || null })} aria-label="Блогер">
                  <option value="">Не привязана</option>
                  {bloggers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nick}
                    </option>
                  ))}
                </Select>
                {task.blogger_id && (
                  <Link to={`/bloggers/${task.blogger_id}`} className="shrink-0 px-2 text-[13px] text-muted hover:text-ink hover:underline">
                    Открыть
                  </Link>
                )}
              </div>
            </Prop>
          </div>

          <div className="mt-6">
            <span className="text-[13px] text-muted">Описание</span>
            <Textarea
              data-field="desc"
              className="mt-1"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={saveDesc}
              placeholder="Что нужно сделать, ссылки, детали"
              aria-label="Описание"
            />
          </div>
        </section>

        {/* вложения */}
        <section className="rounded-card bg-surface p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base">
              Вложения {files && files.length > 0 && <span className="num text-muted">{files.length}</span>}
            </h3>
            <Button size="sm" onClick={() => picker.current?.click()} loading={uploading > 0}>
              {uploading === 0 && <Paperclip className="size-3.5" strokeWidth={1.5} />}
              Прикрепить
            </Button>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) upload(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {files === null ? (
            <Spinner />
          ) : files.length === 0 ? (
            <p className="text-muted">Перетащите файлы сюда или нажмите «Прикрепить»</p>
          ) : (
            <ul className="-mx-2">
              {files.map((f) => {
                const I = isImage(f) ? ImageIcon : FileText
                return (
                  <li key={f.id} className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-soft">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft group-hover:bg-surface">
                      <I className="size-4 text-muted" strokeWidth={1.5} />
                    </span>
                    <button onClick={() => open(f)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{f.name}</span>
                      <span className="block text-xs text-muted">
                        {[sizeLabel(f.size), personName(f.created_by).split(' ')[0], dateTime(f.created_at)].filter(Boolean).join(', ')}
                      </span>
                    </button>
                    {(isAdmin || f.created_by === profile?.id) && (
                      <IconButton label={`Удалить ${f.name}`} onClick={() => dropFile(f)} className="size-8 opacity-0 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100">
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </IconButton>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* комментарии */}
        <section className="rounded-card bg-surface p-5 md:p-6">
          <h3 className="mb-3 text-base">
            Комментарии {comments && comments.length > 0 && <span className="num text-muted">{comments.length}</span>}
          </h3>
          {comments === null ? (
            <Spinner />
          ) : comments.length === 0 ? (
            <p className="mb-4 text-muted">Пока тихо. Напишите, что сделано или что мешает</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-4">
              {comments.map((c) => (
                <li key={c.id} className="group flex gap-3">
                  <Avatar name={personName(c.author_id)} src={personAvatar(c.author_id)} className="size-8 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{personName(c.author_id)}</span>
                      <span className="text-xs text-faint">{dateTime(c.created_at)}</span>
                      {(isAdmin || c.author_id === profile?.id) && (
                        <button onClick={() => dropComment(c)} className="ml-auto text-xs text-faint opacity-0 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100">
                          Удалить
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 leading-5 break-words whitespace-pre-line">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div ref={listEnd} className="flex items-end gap-2">
            <Avatar name={profile?.full_name || profile?.email || ''} src={profile?.avatar_url} className="mb-1 size-8 text-[11px] max-sm:hidden" />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Написать комментарий"
              aria-label="Комментарий"
              className="min-h-11! flex-1 py-2.5"
            />
            <IconButton label="Отправить комментарий" onClick={send} disabled={!text.trim() || sending} className="mb-0.5 bg-ink text-white hover:bg-ink/85 hover:text-white disabled:opacity-30">
              <ArrowUp className="size-[18px]" strokeWidth={1.75} />
            </IconButton>
          </div>
          <p className="mt-2 text-xs text-faint">Enter — отправить, Shift+Enter — новая строка</p>
        </section>

        <p className="px-2 pb-2 text-xs text-faint">
          {task.created_by ? `Автор: ${personName(task.created_by)}, ${dateTime(task.created_at)}` : `Создана ${dateTime(task.created_at)}`}
        </p>
      </div>
    </Drawer>
  )
}
