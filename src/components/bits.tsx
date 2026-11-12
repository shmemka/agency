import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { AGE_GROUPS, platformInfo } from '../lib/constants'
import { date, daysBetween, todayISO } from '../lib/format'
import type { AgeSplit, Blogger, Task } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, IconButton, Input, PlatformTag, Select, cx } from './ui'
import { confirmDialog, promptDialog } from './dialogs'
import { DateInput } from './DateInput'

/** Панель интеграции открывается поверх любой страницы через ?i=<id> */
export function useIntegrationPanel() {
  const [sp, setSp] = useSearchParams()
  return {
    openId: sp.get('i'),
    open: (id: string | null) => {
      const p = new URLSearchParams(sp)
      if (id) p.set('i', id)
      else p.delete('i')
      setSp(p)
    },
  }
}

export function BloggerName({ b, link }: { b: Blogger | undefined; link?: boolean }) {
  if (!b) return <span className="text-faint">нет доступа</span>
  const p = platformInfo(b.platform)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PlatformTag short={p.short} label={p.label} />
      <span className="min-w-0">
        <span className="flex items-center gap-1">
          {link ? (
            <Link to={`/bloggers/${b.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium hover:underline">
              {b.nick}
            </Link>
          ) : (
            <span className="truncate font-medium">{b.nick}</span>
          )}
          {b.url && (
            <a href={b.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-faint hover:text-ink" aria-label="Открыть профиль">
              <ExternalLink className="size-3.5" strokeWidth={1.5} />
            </a>
          )}
        </span>
        {b.name && <span className="block truncate text-xs text-muted">{b.name}</span>}
      </span>
    </span>
  )
}

export const statsStale = (b: Blogger) => daysBetween(b.stats_updated_at ?? b.created_at, todayISO()) > 60

/** Пол и возраст аудитории одной полоской */
export function AudienceBar({ female, age, className }: { female: number | null; age: AgeSplit | null; className?: string }) {
  const parts = AGE_GROUPS.map((g) => ({ ...g, v: age?.[g.id] ?? 0 })).filter((g) => g.v > 0)
  if (female === null && !parts.length) return <span className="text-faint">—</span>
  const tones = ['bg-ink/75', 'bg-ink/45', 'bg-ink/25', 'bg-ink/10']
  const top = [...parts].sort((a, b) => b.v - a.v)[0]
  return (
    <div className={cx('min-w-28 whitespace-nowrap', className)} title={parts.map((p) => `${p.label}: ${p.v}%`).join(', ')}>
      <div className="num flex justify-between gap-2 text-xs text-muted">
        <span>{female !== null ? `жен. ${Math.round(female)}%` : ''}</span>
        <span>{top ? `${top.label}: ${top.v}%` : ''}</span>
      </div>
      {parts.length > 0 && (
        <div className="mt-1 flex h-1.5 gap-px overflow-hidden rounded-full">
          {AGE_GROUPS.map((g, i) => (age?.[g.id] ? <div key={g.id} className={tones[i]} style={{ width: `${age[g.id]}%` }} /> : null))}
        </div>
      )}
    </div>
  )
}

export function CopyLink({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-soft py-1 pr-1 pl-4">
      <span className="min-w-0 flex-1 truncate text-[13px]">{url}</span>
      <Button
        size="sm"
        variant="primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            toast('Ссылка скопирована')
          } catch {
            await promptDialog({ title: 'Скопируйте ссылку', body: 'Браузер не дал скопировать автоматически. Ссылка уже выделена', value: url, readOnly: true })
          }
        }}
      >
        <Copy className="size-3.5" strokeWidth={1.5} />
        Скопировать
      </Button>
    </div>
  )
}

export function dueLabel(t: Task) {
  if (!t.due_date) return null
  const d = daysBetween(todayISO(), t.due_date)
  const time = t.due_time ? `, ${t.due_time.slice(0, 5)}` : ''
  if (d < 0) return { text: `просрочено, ${date(t.due_date)}`, tone: 'bad' as const }
  if (d === 0) return { text: `сегодня${time}`, tone: 'warn' as const }
  if (d === 1) return { text: `завтра${time}`, tone: undefined }
  return { text: `${date(t.due_date)}${time}`, tone: undefined }
}

/** Список задач с добавлением. scope привязывает новые задачи к блогеру, интеграции или кампании */
export function TaskList({ tasks, scope, showDone, empty, noForm }: { tasks: Task[]; noForm?: boolean; scope?: Partial<Pick<Task, 'blogger_id' | 'integration_id' | 'campaign_id'>>; showDone?: boolean; empty?: string }) {
  const { profile, team, isAdmin, personName, personAvatar } = useAuth()
  const { reload, blogger } = useData()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(profile?.id ?? '')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const people = team.filter((t) => t.is_active && (isAdmin || t.id === profile?.id || t.role === 'admin'))
  const list = tasks.filter((t) => showDone || !t.done_at)

  async function add() {
    if (!title.trim() || busy) return
    setBusy(true)
    const { error } = await supabase.from('tasks').insert({ title: title.trim(), assignee_id: assignee || profile?.id, due_date: due || null, ...scope })
    setBusy(false)
    if (error) return toast(`Задача не сохранилась: ${error.message}`)
    setTitle('')
    setDue('')
    reload('tasks')
  }

  async function toggle(t: Task) {
    const { error } = await supabase.from('tasks').update({ done_at: t.done_at ? null : new Date().toISOString() }).eq('id', t.id)
    if (error) toast(error.message)
    reload('tasks')
  }

  async function remove(t: Task) {
    if (!(await confirmDialog({ title: 'Удалить задачу?', body: t.title, ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    if (error) toast(error.message)
    reload('tasks')
  }

  return (
    <div>
      <div className={cx('flex flex-wrap items-center gap-2', noForm && 'hidden')}>
        <Input className="min-w-0 basis-full sm:min-w-40 sm:flex-1 sm:basis-0" placeholder="Новая задача" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Новая задача" />
        {people.length > 1 && (
          <Select className="min-w-0 flex-1 sm:w-32 sm:flex-none" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Исполнитель">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === profile?.id ? 'Мне' : p.full_name || p.email}
              </option>
            ))}
          </Select>
        )}
        <div className="w-36">
          <DateInput compact value={due} onChange={(v) => setDue(v ?? '')} placeholder="Срок" aria-label="Срок" />
        </div>
        <IconButton label="Добавить задачу" onClick={add} disabled={!title.trim()} className="bg-ink text-white hover:bg-ink/85 hover:text-white disabled:opacity-40">
          <Plus className="size-[18px]" strokeWidth={1.5} />
        </IconButton>
      </div>
      {list.length === 0 ? (
        empty && <p className="mt-4 text-muted">{empty}</p>
      ) : (
        <ul className={cx(!noForm && 'mt-3')}>
          {list.map((t) => {
            const due = dueLabel(t)
            const b = !scope?.blogger_id && !scope?.integration_id ? blogger(t.blogger_id) : undefined
            return (
              <li key={t.id} className="group flex min-h-11 items-center gap-3 border-t border-line py-2 first:border-0">
                <button
                  onClick={() => toggle(t)}
                  aria-label={t.done_at ? 'Вернуть в работу' : 'Отметить готовой'}
                  className={cx('flex size-6 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-150', t.done_at ? 'bg-ink text-white ring-ink' : 'ring-ink/25 hover:bg-lime/50')}
                >
                  {t.done_at && <Check className="size-3.5" strokeWidth={2} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cx(t.done_at && 'text-faint line-through')}>{t.title}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                    {due && !t.done_at && <span className={cx(due.tone === 'bad' && 'text-bad', due.tone === 'warn' && 'text-warn')}>{due.text}</span>}
                    {b && (
                      <Link to={`/bloggers/${b.id}`} className="hover:underline">
                        {b.nick}
                      </Link>
                    )}
                    {t.created_by && t.created_by !== t.assignee_id && <span>от {personName(t.created_by).split(' ')[0]}</span>}
                  </div>
                </div>
                {t.assignee_id !== profile?.id && <Avatar name={personName(t.assignee_id)} src={personAvatar(t.assignee_id)} className="size-6 text-[10px]" />}
                {(isAdmin || t.created_by === profile?.id) && (
                  <button onClick={() => remove(t)} className="text-faint opacity-0 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100" aria-label="Удалить задачу">
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
