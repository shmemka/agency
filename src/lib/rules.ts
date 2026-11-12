import { STATUS_ORDER, legalInfo, type Status } from './constants'
import { addDays, daysBetween, todayISO } from './format'
import type { Blogger, Campaign, Doc, Integration, Settings, Task } from './types'

export type DocLite = Pick<Doc, 'id' | 'integration_id' | 'blogger_id' | 'campaign_id' | 'kind'>

/** Интеграция в работе: не закрыта, не отказ и (если есть кампания) одобрена клиентом */
export const isActive = (i: Integration) =>
  i.status !== 'done' && i.status !== 'declined' && (!i.campaign_id || i.client_decision === 'approved')

export const isLive = (i: Integration) => i.status === 'published' || i.status === 'done'

export function checklist(i: Integration, docs: DocLite[]) {
  const mine = docs.filter((d) => d.integration_id === i.id)
  const has = (...k: string[]) => mine.some((d) => k.includes(d.kind))
  return [
    { label: 'Договор с блогером', done: has('contract') },
    { label: 'Сценарий согласован', done: i.script_approved },
    { label: 'erid получен', done: Boolean(i.erid) },
    { label: 'Чек или акт', done: has('receipt', 'act') },
    { label: 'Скрин статистики после выхода', done: has('stats') },
    { label: 'Статистика передана в ОРД', done: Boolean(i.ord_reported_at) || i.marked_by !== 'us' },
  ]
}

/** Предупреждения перед сменой статуса. Не запрет — можно перевести всё равно */
export function transitionWarnings(i: Integration, b: Blogger | undefined, docs: DocLite[], to: Status): string[] {
  const w: string[] = []
  const at = STATUS_ORDER[to]
  if (to === 'declined') return w
  if (b && at >= STATUS_ORDER.waiting_contract) {
    if (!legalInfo(b.legal_status).ok) w.push('У блогера не указан статус самозанятого или ИП')
    if ((b.followers ?? 0) >= 10_000 && b.rkn_registered !== true) w.push('У блогера 10 000+ подписчиков, а регистрация в перечне РКН не отмечена')
  }
  if (at >= STATUS_ORDER.published && !i.erid) w.push('Нет erid — выход без маркировки публиковать нельзя')
  if (to === 'done') {
    const c = checklist(i, docs)
    if (!c[3].done) w.push('Нет чека или акта')
    if (!c[4].done) w.push('Нет скрина статистики')
    if (!i.fact_reach) w.push('Не указан охват по факту')
  }
  return w
}

/** Срок сдачи статистики в ОРД: N дней после месяца первого показа */
export function ordDeadline(i: Integration, s: Settings | null): string | null {
  const first = i.first_shown_at ?? (isLive(i) ? i.publish_date : null)
  if (!first || i.marked_by !== 'us') return null
  const d = new Date(`${first}T12:00:00`)
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)
  return addDays(monthEnd.toISOString().slice(0, 10), s?.ord_deadline_days ?? 30)
}

export interface Attention {
  key: string
  text: string
  link: string
  tone: 'warn' | 'bad'
}

/** То, что требует внимания прямо сейчас. Считается из данных на лету, без рассылки по расписанию */
export function attention(opts: {
  me: string
  isAdmin: boolean
  integrations: Integration[]
  bloggers: Blogger[]
  campaigns: Campaign[]
  tasks: Task[]
  settings: Settings | null
}): Attention[] {
  const { me, isAdmin, integrations, bloggers, campaigns, tasks, settings } = opts
  const today = todayISO()
  const nick = (id: string) => bloggers.find((b) => b.id === id)?.nick ?? 'блогер'
  const out: Attention[] = []
  const mine = (i: Integration) => isAdmin || i.owner_id === me || campaigns.find((c) => c.id === i.campaign_id)?.owner_id === me

  for (const t of tasks) {
    if (t.done_at || t.assignee_id !== me || !t.due_date || t.due_date > today) continue
    out.push({ key: `t${t.id}`, text: `${t.due_date < today ? 'Просрочена задача' : 'Задача на сегодня'}: ${t.title}`, link: '/tasks', tone: t.due_date < today ? 'bad' : 'warn' })
  }
  for (const i of integrations) {
    if (!mine(i)) continue
    if (isActive(i) && (i.status === 'contacted' || i.status === 'waiting_reply') && daysBetween(i.updated_at, today) >= 3) {
      out.push({ key: `s${i.id}`, text: `${nick(i.blogger_id)} молчит ${daysBetween(i.updated_at, today)} дн. — пора напомнить`, link: `?i=${i.id}`, tone: 'warn' })
    }
    if (isActive(i) && i.publish_date && !isLive(i) && daysBetween(today, i.publish_date) >= 0 && daysBetween(today, i.publish_date) <= 1) {
      if (!i.erid) out.push({ key: `e${i.id}`, text: `Выход ${nick(i.blogger_id)} ${i.publish_date === today ? 'сегодня' : 'завтра'}, а erid нет`, link: `?i=${i.id}`, tone: 'bad' })
      else if (!i.script_approved) out.push({ key: `c${i.id}`, text: `Выход ${nick(i.blogger_id)} ${i.publish_date === today ? 'сегодня' : 'завтра'}, сценарий не согласован`, link: `?i=${i.id}`, tone: 'warn' })
    }
    if (isLive(i) && !i.ord_reported_at) {
      const dl = ordDeadline(i, settings)
      if (dl) {
        const left = daysBetween(today, dl)
        if (left <= 7) out.push({ key: `o${i.id}`, text: left < 0 ? `Срок сдачи в ОРД по ${nick(i.blogger_id)} прошёл` : `Сдать статистику в ОРД по ${nick(i.blogger_id)}: ${left === 0 ? 'сегодня' : `осталось ${left} дн.`}`, link: `?i=${i.id}`, tone: left <= 2 ? 'bad' : 'warn' })
      }
    }
  }
  if (isAdmin) {
    for (const c of campaigns) {
      if (c.status === 'active' && !c.prepaid) out.push({ key: `p${c.id}`, text: `Кампания «${c.name}» идёт без предоплаты`, link: `/campaigns/${c.id}`, tone: 'bad' })
    }
  }
  return out
}
