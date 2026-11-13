import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Check, MessageCircle, MoreHorizontal, Paperclip, Plus, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import type { Task, TaskSection } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Card, Menu, PageHeader, Segmented, Toggle, cx } from '../components/ui'
import { TaskList } from '../components/bits'
import { TaskDrawer } from '../components/TaskDrawer'
import { confirmDialog } from '../components/dialogs'
import { DateInput } from '../components/DateInput'
import { daysBetween, todayISO } from '../lib/format'

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
function InlineInput({ initial = '', placeholder, onSave, onCancel, multiline, keepOpen, className, inputRef }: { initial?: string; placeholder: string; onSave: (v: string) => Promise<void> | void; onCancel: () => void; multiline?: boolean; keepOpen?: boolean; className?: string; inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const [v, setV] = useState(initial)
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? own
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
      onBlur={(e) => {
        // фокус ушёл на кнопку внутри той же формы (исполнитель, срок) — форма остаётся открытой
        const box = e.currentTarget.closest('[data-inline-box]')
        if (box && e.relatedTarget && box.contains(e.relatedTarget as Node)) return
        if (v.trim() && v.trim() !== initial) commit()
        else onCancel()
      }}
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
      className={cx('w-full resize-none bg-transparent [field-sizing:content] placeholder:text-faint focus:outline-none', multiline ? 'leading-5' : 'leading-6', className)}
    />
  )
}

const MONTH = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
/** Сколько дней до срока считается «далеко»: дальше кольцо полное */
const RING_DAYS = 14

/** Кому задача: аватар или пунктирный кружок, по нажатию — выбор исполнителя */
function AssigneePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { team, profile, isAdmin, personName, personAvatar } = useAuth()
  // специалист ставит задачи себе и учредителям, учредитель — кому угодно
  const people = team.filter((p) => p.is_active && (isAdmin || p.id === profile?.id || p.role === 'admin' || p.id === value))
  return (
    <Menu<string>
      title={value ? `Исполнитель: ${personName(value)}` : 'Назначить исполнителя'}
      value={value ?? ''}
      chevron={false}
      onChange={(v) => onChange(v || null)}
      options={[{ id: '', label: 'Не назначен' }, ...people.map((p) => ({ id: p.id, label: p.id === profile?.id ? `${p.full_name || p.email} (вы)` : p.full_name || p.email || '' }))]}
      trigger={
        value ? (
          <Avatar name={personName(value)} src={personAvatar(value)} className="size-8 text-[11px] transition-opacity hover:opacity-80" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-ink/25 text-faint transition-colors hover:border-ink/40 hover:text-muted">
            <UserRound className="size-4" strokeWidth={1.5} />
          </span>
        )
      }
    />
  )
}

/**
 * Срок: пустой — пунктир с календарём; выбран — число и месяц.
 * Кольцо вокруг тает к дедлайну: за 14+ дней полное, в день срока исчезает, просрочено — красное
 */
function DuePicker({ value, onChange, done }: { value: string | null; onChange: (v: string | null) => void; done?: boolean }) {
  return (
    <DateInput
      value={value}
      onChange={onChange}
      aria-label="Срок"
      triggerClassName="size-8"
      trigger={(sel) => {
        if (!sel || !value)
          return (
            <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-ink/25 text-faint transition-colors hover:border-ink/40 hover:text-muted">
              <CalendarDays className="size-4" strokeWidth={1.5} />
            </span>
          )
        const left = daysBetween(todayISO(), value)
        const part = done ? 0 : left < 0 ? 1 : Math.min(1, left / RING_DAYS)
        const tone = done ? 'text-faint' : left < 0 ? 'text-bad' : left <= 2 ? 'text-warn' : 'text-ink/60'
        const r = 14.5
        const len = 2 * Math.PI * r
        return (
          <span className={cx('relative flex size-8 items-center justify-center', tone)} title={done ? 'Выполнена' : left < 0 ? `Просрочено на ${-left} дн.` : left === 0 ? 'Срок сегодня' : `До срока ${left} дн.`}>
            <svg viewBox="0 0 32 32" className="absolute inset-0 size-8 -rotate-90" aria-hidden>
              <circle cx="16" cy="16" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="1.5" />
              {part > 0 && <circle cx="16" cy="16" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={`${len * part} ${len}`} />}
            </svg>
            <span className="num relative flex flex-col items-center leading-none">
              <span className="text-[11px] font-medium">{sel.getDate()}</span>
              <span className="mt-px text-[8px]">{MONTH[sel.getMonth()]}</span>
            </span>
          </span>
        )
      }}
    />
  )
}

function TaskCard({ t, counts, dragging, onOpen, onToggle, onPatch, onDragStart, onDragEnd }: { t: Task; counts?: { c: number; f: number }; dragging: boolean; onOpen: () => void; onToggle: () => void; onPatch: (p: Partial<Task>) => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const { blogger } = useData()
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
        'group cursor-pointer rounded-[20px] bg-surface p-4 transition-[box-shadow,opacity] duration-150 select-none hover:shadow-[0_4px_14px_rgba(21,23,28,0.08)]',
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
        {/* выбор исполнителя и срока прямо на карточке; клики не открывают задачу */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} draggable={false} onDragStart={(e) => e.preventDefault()}>
          <AssigneePicker value={t.assignee_id} onChange={(v) => onPatch({ assignee_id: v })} />
          <DuePicker value={t.due_date} done={done} onChange={(v) => onPatch({ due_date: v })} />
        </div>
        {b && <span className="ml-1 min-w-0 truncate">{b.nick}</span>}
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
  // исполнитель и срок новой задачи: по умолчанию — вы и без срока, сохраняются для следующей задачи подряд
  const [draft, setDraft] = useState<{ assignee: string | null; due: string | null }>({ assignee: null, due: null })
  const composer = useRef<HTMLTextAreaElement>(null)
  const openComposer = (sid: string) => {
    setDraft({ assignee: profile?.id ?? null, due: null })
    setAdding(sid)
  }
  const closeComposer = () => setAdding(null)
  // клик мимо формы закрывает её, если ничего не написано (выпадающие списки и календарь формы не в счёт)
  useEffect(() => {
    if (!adding) return
    const out = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-inline-box], [role=listbox], [role=dialog]')) return
      if (!composer.current?.value.trim()) setAdding(null)
    }
    window.addEventListener('mousedown', out)
    return () => window.removeEventListener('mousedown', out)
  }, [adding])
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
    const { error } = await supabase.from('tasks').insert({ title, assignee_id: draft.assignee, due_date: draft.due, section_id: sid, position: between(list.at(-1)?.position) })
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
                // заголовок и карточки на одной подложке; бросить карточку можно в любое место колонки
                <div
                  key={s.id}
                  onDragOver={(e) => dragOver(e, s.id)}
                  onDrop={(e) => {
                    e.preventDefault()
                    drop(s.id)
                  }}
                  className={cx('w-[85vw] max-w-[300px] shrink-0 snap-start rounded-card p-2 transition-colors duration-150 md:w-[300px]', over?.s === s.id ? 'bg-lime/25' : 'bg-ink/[0.035]')}
                >
                  {/* заголовок колонки */}
                  <div className="flex h-10 items-center gap-2 pl-3">
                    {renaming === s.id ? (
                      // поле стоит ровно на месте названия: тот же шрифт и отступ, белая капсула вместо рамки
                      <div className="-ml-3 min-w-0 flex-1">
                        <InlineInput
                          className="h-8 w-full! rounded-full bg-surface! px-3 text-[15px] leading-8 font-medium [field-sizing:fixed]!"
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
                        <button onClick={() => openComposer(s.id)} aria-label={`Добавить задачу в «${s.name}»`} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink">
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
                  <div className="mt-1 flex min-h-12 flex-col gap-2">
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
                            onPatch={(p) => update(t, p)}
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
                      <div data-inline-box className="rounded-[20px] bg-surface p-4">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-px size-[22px] shrink-0 rounded-full ring-1 ring-ink/15" />
                          <InlineInput inputRef={composer} keepOpen placeholder="Что нужно сделать?" onSave={(v) => addTask(s.id, v)} onCancel={closeComposer} multiline className="leading-6" />
                        </div>
                        <div className="mt-3 flex items-center gap-1.5">
                          <AssigneePicker
                            value={draft.assignee}
                            onChange={(v) => {
                              setDraft((d) => ({ ...d, assignee: v }))
                              setTimeout(() => composer.current?.focus())
                            }}
                          />
                          <DuePicker
                            value={draft.due}
                            onChange={(v) => {
                              setDraft((d) => ({ ...d, due: v }))
                              setTimeout(() => composer.current?.focus())
                            }}
                          />
                          <span className="ml-auto text-xs text-faint">Enter — добавить</span>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => openComposer(s.id)} className="flex h-10 items-center gap-2 rounded-2xl px-3 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink">
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
