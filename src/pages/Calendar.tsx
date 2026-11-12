import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { phaseInfo, statusInfo } from '../lib/constants'
import { isLive, ordDeadline } from '../lib/rules'
import { todayISO } from '../lib/format'
import { Button, Card, IconButton, PageHeader, Select, cx } from '../components/ui'
import { useIntegrationPanel } from '../components/bits'

interface Ev {
  key: string
  day: string
  text: string
  dot: string
  onClick?: () => void
  muted?: boolean
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function Calendar() {
  const { integrations, tasks, campaigns, settings, blogger } = useData()
  const { profile, isAdmin, team } = useAuth()
  const { open } = useIntegrationPanel()
  const [sp, setSp] = useSearchParams()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const cid = sp.get('campaign') ?? ''
  const owner = sp.get('owner') ?? ''
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp)
    if (v) p.set(k, v)
    else p.delete(k)
    setSp(p, { replace: true })
  }
  const today = todayISO()

  const events = useMemo(() => {
    const out: Ev[] = []
    for (const i of integrations) {
      if (i.status === 'declined' || (i.campaign_id && i.client_decision !== 'approved')) continue
      if (cid && i.campaign_id !== cid) continue
      if (owner && i.owner_id !== owner) continue
      const nick = blogger(i.blogger_id)?.nick ?? 'блогер'
      if (i.publish_date) out.push({ key: `i${i.id}`, day: i.publish_date, text: nick, dot: phaseInfo(statusInfo(i.status).phase).dot, onClick: () => open(i.id), muted: i.status === 'done' })
      const dl = isLive(i) && !i.ord_reported_at ? ordDeadline(i, settings) : null
      if (dl) out.push({ key: `o${i.id}`, day: dl, text: `ОРД: ${nick}`, dot: 'bg-bad', onClick: () => open(i.id) })
    }
    if (!cid) {
      for (const t of tasks) {
        if (!t.due_date || t.done_at) continue
        if (owner ? t.assignee_id !== owner : t.assignee_id !== profile?.id && !isAdmin) continue
        out.push({ key: `t${t.id}`, day: t.due_date, text: t.title, dot: 'bg-ink', onClick: t.integration_id ? () => open(t.integration_id) : undefined })
      }
    }
    return out
  }, [integrations, tasks, settings, cid, owner, blogger, open, profile?.id, isAdmin])

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e])
    return m
  }, [events])

  const first = new Date(cursor)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const weeks = days.slice(35).some((d) => d.getMonth() === cursor.getMonth()) ? 6 : 5
  const monthKey = iso(cursor).slice(0, 7)
  const listDays = [...byDay.keys()].filter((d) => d.startsWith(monthKey)).sort()
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))

  const item = (e: Ev, big?: boolean) => (
    <button key={e.key} onClick={e.onClick} disabled={!e.onClick} className={cx('flex w-full items-center gap-1.5 rounded-full text-left hover:bg-soft', big ? 'min-h-11 px-2 text-sm' : 'h-6 px-1.5 text-xs', e.muted && 'text-faint')} title={e.text}>
      <span className={cx('size-2 shrink-0 rounded-full', e.dot)} />
      <span className="truncate">{e.text}</span>
    </button>
  )

  return (
    <>
      <PageHeader
        title={cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase()).replace(' г.', '')}
        sub="Выходы, сроки задач и сдача статистики в ОРД"
        actions={
          <>
            <IconButton label="Предыдущий месяц" onClick={() => move(-1)} className="bg-surface">
              <ChevronLeft className="size-[18px]" strokeWidth={1.5} />
            </IconButton>
            <Button onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Сегодня</Button>
            <IconButton label="Следующий месяц" onClick={() => move(1)} className="bg-surface">
              <ChevronRight className="size-[18px]" strokeWidth={1.5} />
            </IconButton>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={cid} onChange={(e) => set('campaign', e.target.value)} aria-label="Кампания" tone="surface" className="w-56">
          <option value="">Все кампании</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {isAdmin && (
          <Select value={owner} onChange={(e) => set('owner', e.target.value)} aria-label="Ответственный" tone="surface" className="w-48">
            <option value="">Все ответственные</option>
            {team
              .filter((t) => t.is_active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email}
                </option>
              ))}
          </Select>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-card bg-surface md:block">
        <div className="grid grid-cols-7 text-xs text-faint">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
            <div key={d} className="px-3 py-3">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.slice(0, weeks * 7).map((d) => {
            const k = iso(d)
            const evs = byDay.get(k) ?? []
            const out = d.getMonth() !== cursor.getMonth()
            return (
              <div key={k} className={cx('min-h-28 border-t border-l border-line p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0', out && 'bg-soft/60')}>
                <div className={cx('mb-1 flex size-6 items-center justify-center rounded-full text-xs', k === today ? 'bg-ink text-white' : out ? 'text-faint' : 'text-muted')}>{d.getDate()}</div>
                {evs.slice(0, 3).map((e) => item(e))}
                {evs.length > 3 && <div className="px-1.5 text-xs text-faint">ещё {evs.length - 3}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {listDays.length === 0 && <Card className="text-muted">В этом месяце событий нет</Card>}
        {listDays.map((d) => (
          <Card key={d} className="p-4">
            <div className={cx('mb-1 text-[13px]', d === today ? 'text-ink' : 'text-muted')}>
              {new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
              {d === today && ', сегодня'}
            </div>
            {byDay.get(d)!.map((e) => item(e, true))}
          </Card>
        ))}
      </div>
    </>
  )
}
