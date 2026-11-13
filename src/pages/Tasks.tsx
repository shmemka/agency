import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, MessageCircle, MoreHorizontal, Paperclip, Plus, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import type { Task, TaskSection } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Card, Menu, PageHeader, Segmented, Toggle, cx } from '../components/ui'
import { TaskList, dueLabel } from '../components/bits'
import { TaskDrawer } from '../components/TaskDrawer'
import { confirmDialog } from '../components/dialogs'

type Who = 'all' | 'mine' | 'given'
type Counts = Record<string, { c: number; f: number }>

const now = () => Date.now() / 1000

/** Позиция между соседями: так задачу можно вставить куда угодно, не трогая остальные */
function between(prev?: number, next?: number) {
  if (prev != null && next != null) return (prev + next) / 2
  if (prev != null) return prev + 1
  if (next != null) return next - 1
  return now()
}

/** Поле ввода прямо на доске: Enter — сохранить, Escape или пустое поле при уходе — отмена */
function InlineInput({ initial = '', placeholder, onSave, onCancel, multiline, keepOpen }: { initial?: string; placeholder: string; onSave: (v: string) => Promise<void> | void; onCancel: () => void; multiline?: boolean; keepOpen?: boolean }) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = async () => {
    const t = v.trim()
    if (!t || t === initial) return onCancel()
    await onSave(t)
    if (keepOpen) setV('')
  }
  return (
    <textarea
      ref={ref}
      value={v}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => (v.trim() && v.trim() !== initial ? commit() : onCancel())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className={cx('w-full resize-none bg-transparent [field-sizing:content] placeholder:text-faint focus:outline-none', multiline ? 'leading-5' : 'leading-6')}
    />
  )
}

function TaskCard({ t, counts, dragging, onOpen, onToggle, onDragStart, onDragEnd }: { t: Task; counts?: { c: number; f: number }; dragging: boolean; onOpen: () => void; onToggle: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const { personName, personAvatar } = useAuth()
  const { blogger } = useData()
  const due = dueLabel(t)
  const b = blogger(t.blogger_id)
  const done = Boolean(t.done_at)
  return (
    <div
      data-task={t.id}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen()
      }}
      className={cx(
        'group cursor-pointer rounded-[20px] bg-surface p-4 ring-1 ring-line transition-[box-shadow,opacity] duration-150 select-none hover:ring-ink/15 hover:shadow-[0_4px_14px_rgba(21,23,28,0.06)]',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
          className={cx('mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-150', done ? 'bg-leaf text-ink ring-leaf' : 'text-transparent ring-ink/25 hover:bg-lime/50 hover:text-ink/50')}
        >
          <Check className="size-3.5" strokeWidth={2} />
        </button>
        <p className={cx('min-w-0 flex-1 leading-6 break-words', done && 'text-faint line-through')}>{t.title}</p>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        {t.assignee_id ? (
          <Avatar name={personName(t.assignee_id)} src={personAvatar(t.assignee_id)} className="size-6 text-[10px]" />
        ) : (
          <span title="Исполнитель не назначен" className="flex size-6 items-center justify-center rounded-full border border-dashed border-faint text-faint">
            <UserRound className="size-3.5" strokeWidth={1.5} />
          </span>
        )}
        {due && !done && <span className={cx('whitespace-nowrap', due.tone === 'bad' && 'text-bad', due.tone === 'warn' && 'text-warn')}>{due.text}</span>}
        {b && <span className="min-w-0 truncate">{b.nick}</span>}
        <span className="flex-1" />
        {!!counts?.f && (
          <span className="flex items-center gap-1" title="Вложения">
            <Paperclip className="size-3.5" strokeWidth={1.5} />
            <span className="num">{counts.f}</span>
          </span>
        )}
        {!!counts?.c && (
          <span className="flex items-center gap-1" title="Комментарии">
            <MessageCircle className="size-3.5" strokeWidth={1.5} />
            <span className="num">{counts.c}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function Tasks() {
  const { tasks, sections, reload } = useData()
  const { profile, isAdmin } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [who, setWho] = useState<Who>('all')
  const [hideDone, setHideDone] = useState(false)
  const [counts, setCounts] = useState<Counts>({})
  const [local, setLocal] = useState<Record<string, Partial<Task>>>({})
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ s: string; i: number } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newCol, setNewCol] = useState(false)

  // счётчики комментариев и вложений на карточках
  useEffect(() => {
    let alive = true
    Promise.all([supabase.from('task_comments').select('task_id'), supabase.from('task_files').select('task_id')]).then(([c, f]) => {
      if (!alive) return
      const out: Counts = {}
      for (const r of (c.data ?? []) as { task_id: string }[]) (out[r.task_id] ??= { c: 0, f: 0 }).c++
      for (const r of (f.data ?? []) as { task_id: string }[]) (out[r.task_id] ??= { c: 0, f: 0 }).f++
      setCounts(out)
    })
    return () => {
      alive = false
    }
  }, [tasks, id])

  const all = useMemo(() => tasks.map((t) => (local[t.id] ? { ...t, ...local[t.id] } : t)), [tasks, local])
  const first = sections[0]?.id
  const colOf = (t: Task) => (t.section_id && sections.some((s) => s.id === t.section_id) ? t.section_id : first)
  const visible = all.filter((t) => (who === 'mine' ? t.assignee_id === profile?.id : who === 'given' ? t.created_by === profile?.id && t.assignee_id !== profile?.id : true) && (!hideDone || !t.done_at))
  const byCol = (sid: string) => visible.filter((t) => colOf(t) === sid).sort((a, b) => a.position - b.position)
  const open = all.filter((t) => !t.done_at).length
  const current = id ? all.find((t) => t.id === id) : undefined

  async function update(t: Task, patch: Partial<Task>) {
    setLocal((l) => ({ ...l, [t.id]: { ...l[t.id], ...patch } }))
    const { error } = await supabase.from('tasks').update(patch).eq('id', t.id)
    if (error) toast(`Не сохранилось: ${error.message}`)
    await reload('tasks')
    setLocal((l) => {
      const n = { ...l }
      delete n[t.id]
      return n
    })
  }

  async function addTask(sid: string, title: string) {
    const list = byCol(sid)
    const { error } = await supabase.from('tasks').insert({ title, assignee_id: profile?.id ?? null, section_id: sid, position: between(list.at(-1)?.position) })
    if (error) return toast(`Задача не сохранилась: ${error.message}`)
    await reload('tasks')
  }

  async function addSection(name: string) {
    const { error } = await supabase.from('task_sections').insert({ name, position: between(sections.at(-1)?.position) })
    if (error) return toast(error.message)
    await reload('task_sections')
    setNewCol(false)
  }

  async function renameSection(s: TaskSection, name: string) {
    const { error } = await supabase.from('task_sections').update({ name }).eq('id', s.id)
    if (error) toast(error.message)
    await reload('task_sections')
  }

  async function moveSection(s: TaskSection, dir: -1 | 1) {
    const i = sections.findIndex((x) => x.id === s.id)
    const other = sections[i + dir]
    if (!other) return
    await Promise.all([
      supabase.from('task_sections').update({ position: other.position }).eq('id', s.id),
      supabase.from('task_sections').update({ position: s.position }).eq('id', other.id),
    ])
    await reload('task_sections')
  }

  async function deleteSection(s: TaskSection) {
    if (sections.length < 2) return toast('Нужна хотя бы одна колонка')
    const n = all.filter((t) => colOf(t) === s.id).length
    const to = sections.find((x) => x.id !== s.id)!
    const ok = await confirmDialog({
      title: `Удалить колонку «${s.name}»?`,
      body: n ? `${n} ${n === 1 ? 'задача перейдёт' : n < 5 ? 'задачи перейдут' : 'задач перейдут'} в колонку «${to.name}». Сами задачи не удалятся` : 'Колонка пустая',
      ok: 'Удалить колонку',
      danger: true,
    })
    if (!ok) return
    if (n) await supabase.from('tasks').update({ section_id: to.id }).eq('section_id', s.id)
    const { error } = await supabase.from('task_sections').delete().eq('id', s.id)
    if (error) toast(error.message)
    await reload('task_sections', 'tasks')
  }

  // перетаскивание: куда встанет карточка, считаем по середине соседних карточек
  function dragOver(e: React.DragEvent<HTMLDivElement>, sid: string) {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-task]')].filter((el) => el.dataset.task !== drag)
    let i = cards.length
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        i = k
        break
      }
    }
    if (over?.s !== sid || over.i !== i) setOver({ s: sid, i })
  }

  function drop(sid: string) {
    const t = all.find((x) => x.id === drag)
    const target = over
    setDrag(null)
    setOver(null)
    if (!t || !target) return
    const orig = byCol(sid)
    const list = orig.filter((x) => x.id !== t.id)
    const prev = list[target.i - 1]
    const next = list[target.i]
    // карточку отпустили там же, где она была
    const j = orig.indexOf(t)
    if (j >= 0 && orig[j - 1]?.id === prev?.id && orig[j + 1]?.id === next?.id) return
    update(t, { section_id: sid, position: between(prev?.position, next?.position) })
  }

  return (
    <>
      <PageHeader
        title="Задачи"
        sub={open ? `Открыто: ${open}` : 'Открытых задач нет'}
        actions={
          <>
            <Toggle checked={hideDone} onChange={setHideDone} label="Скрыть выполненные" />
            <Segmented
              value={who}
              onChange={setWho}
              options={[{ id: 'all', label: isAdmin ? 'Все' : 'Все мои' }, { id: 'mine', label: 'Мне' }, { id: 'given', label: 'Я поставил' }]}
            />
          </>
        }
      />

      {sections.length === 0 ? (
        <div className="max-w-3xl space-y-3">
          <Card>
            <h2 className="text-base">Доска задач почти готова</h2>
            <p className="mt-1 text-muted">Запустите миграцию 008_task_board.sql в Supabase → SQL Editor, и здесь появятся колонки. Пока задачи списком</p>
          </Card>
          <Card>
            <TaskList tasks={all.filter((t) => !t.done_at)} empty="Открытых задач нет" />
          </Card>
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
          <div className="flex snap-x snap-mandatory items-start gap-3 md:snap-none">
            {sections.map((s, si) => {
              const list = byCol(s.id)
              const shown = list.filter((t) => t.id !== drag)
              return (
                <div key={s.id} className="w-[85vw] max-w-[300px] shrink-0 snap-start md:w-[300px]">
                  {/* заголовок колонки */}
                  <div className="flex h-11 items-center gap-2 pr-1 pl-3">
                    {renaming === s.id ? (
                      <div className="flex-1 rounded-xl bg-surface px-2 py-1.5 text-[15px] ring-1 ring-ink/15">
                        <InlineInput
                          initial={s.name}
                          placeholder="Название колонки"
                          onSave={async (v) => {
                            setRenaming(null)
                            await renameSection(s, v)
                          }}
                          onCancel={() => setRenaming(null)}
                        />
                      </div>
                    ) : (
                      <>
                        <button onDoubleClick={() => setRenaming(s.id)} className="min-w-0 truncate text-[15px] font-medium" title="Дважды нажмите, чтобы переименовать">
                          {s.name}
                        </button>
                        <span className="num text-[13px] text-faint">{list.length}</span>
                        <span className="flex-1" />
                        <button onClick={() => setAdding(s.id)} aria-label={`Добавить задачу в «${s.name}»`} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink">
                          <Plus className="size-4" strokeWidth={1.5} />
                        </button>
                        <Menu
                          value={'' as string}
                          chevron={false}
                          title={`Колонка «${s.name}»`}
                          options={[
                            { id: 'rename', label: 'Переименовать' },
                            ...(si > 0 ? [{ id: 'left', label: 'Сдвинуть влево' }] : []),
                            ...(si < sections.length - 1 ? [{ id: 'right', label: 'Сдвинуть вправо' }] : []),
                            ...(sections.length > 1 ? [{ id: 'delete', label: 'Удалить колонку' }] : []),
                          ]}
                          onChange={(v) => {
                            if (v === 'rename') setRenaming(s.id)
                            if (v === 'left') moveSection(s, -1)
                            if (v === 'right') moveSection(s, 1)
                            if (v === 'delete') deleteSection(s)
                          }}
                          trigger={
                            <span className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink">
                              <MoreHorizontal className="size-4" strokeWidth={1.5} />
                            </span>
                          }
                        />
                      </>
                    )}
                  </div>

                  {/* карточки */}
                  <div
                    onDragOver={(e) => dragOver(e, s.id)}
                    onDrop={(e) => {
                      e.preventDefault()
                      drop(s.id)
                    }}
                    className={cx('flex min-h-20 flex-col gap-2 rounded-card p-2 transition-colors duration-150', over?.s === s.id ? 'bg-lime/25' : 'bg-ink/[0.035]')}
                  >
                    {list.map((t) => {
                      const idx = shown.indexOf(t)
                      return (
                        <div key={t.id} className="flex flex-col gap-2">
                          {over?.s === s.id && over.i === idx && idx >= 0 && <div className="h-1 rounded-full bg-ink/70" />}
                          <TaskCard
                            t={t}
                            counts={counts[t.id]}
                            dragging={drag === t.id}
                            onOpen={() => navigate(`/tasks/${t.id}`)}
                            onToggle={() => update(t, { done_at: t.done_at ? null : new Date().toISOString() })}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', t.id)
                              e.dataTransfer.effectAllowed = 'move'
                              setDrag(t.id)
                            }}
                            onDragEnd={() => {
                              setDrag(null)
                              setOver(null)
                            }}
                          />
                        </div>
                      )
                    })}
                    {over?.s === s.id && over.i === shown.length && <div className="h-1 rounded-full bg-ink/70" />}

                    {adding === s.id ? (
                      <div className="rounded-[20px] bg-surface p-4 ring-1 ring-ink/15">
                        <InlineInput keepOpen placeholder="Что нужно сделать?" onSave={(v) => addTask(s.id, v)} onCancel={() => setAdding(null)} multiline />
                        <p className="mt-2 text-xs text-faint">Enter — добавить и написать следующую, Esc — закрыть</p>
                      </div>
                    ) : (
                      <button onClick={() => setAdding(s.id)} className="flex h-10 items-center gap-2 rounded-2xl px-3 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink">
                        <Plus className="size-4" strokeWidth={1.5} />
                        Добавить задачу
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* новая колонка */}
            <div className="w-[85vw] max-w-[300px] shrink-0 snap-start md:w-[300px]">
              {newCol ? (
                <div className="mt-1 rounded-2xl bg-surface px-3 py-2 text-[15px] ring-1 ring-ink/15">
                  <InlineInput placeholder="Название колонки" onSave={addSection} onCancel={() => setNewCol(false)} />
                </div>
              ) : (
                <button onClick={() => setNewCol(true)} className="flex h-11 w-full items-center gap-2 rounded-2xl px-3 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink">
                  <Plus className="size-4" strokeWidth={1.5} />
                  Добавить колонку
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {current && <TaskDrawer key={current.id} task={current} onClose={() => navigate('/tasks')} />}
    </>
  )
}
