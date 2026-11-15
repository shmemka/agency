import { STATUS_ORDER, legalInfo, type Status } from './constants'
import { addDays, date, daysBetween, money, todayISO } from './format'
import type { Blogger, Campaign, Doc, Integration, Settings, Task } from './types'

export type DocLite = Pick<Doc, 'id' | 'integration_id' | 'blogger_id' | 'campaign_id' | 'kind'>

/**
 * Блогер в сделке считается взятым в работу, если клиент от него не отказался.
 * Подборок по ссылке больше нет: с клиентом договариваются сами, поэтому старые «не отправлено» и «ждём решения» - тоже работа
 */
export const inWork = (i: Pick<Integration, 'client_decision'>) => i.client_decision !== 'rejected'

/** Интеграция в работе: взята, не закрыта и не отказ */
export const isActive = (i: Integration) => i.status !== 'done' && i.status !== 'declined' && inWork(i)

/** Чья задача: исполнителя, а если его нет — того, кто поставил. Так задача без исполнителя не теряется */
export const taskOwner = (t: Pick<Task, 'assignee_id' | 'created_by'>) => t.assignee_id ?? t.created_by

export const isLive = (i: Integration) => i.status === 'published' || i.status === 'done'

/**
 * Комиссия агентства по интеграциям: цена для клиента минус цена блогера.
 * Одна формула для обзора, финансов и кампании. Если цену клиенту вручную поставили ниже цены блогера,
 * минус честно уменьшает итог, а не теряется
 */
export const commission = (rows: Pick<Integration, 'price' | 'price_client'>[]) => rows.reduce((a, i) => a + (i.price_client ?? i.price ?? 0) - (i.price ?? 0), 0)

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

/** Через сколько дней молчания блогера «ждём» превращается в «напомнить» */
export const REMIND_AFTER = 3

/**
 * Группы списка дел на экране «Работа»:
 * now - ход за нами, wait - ждём блогера, soon - оплачено и ждём выхода, tails - вышло, но не всё собрано
 */
export type WorkGroup = 'now' | 'wait' | 'soon' | 'tails'
export interface NextStep {
  group: WorkGroup
  /** что сделать или чего ждём - одной короткой фразой */
  text: string
  tone?: 'warn' | 'bad'
  /** порядок внутри группы: меньше - выше */
  sort: number
}

/**
 * Что делать с интеграцией прямо сейчас и чей ход. Каждый шаг воронки сам говорит об этом:
 * «Согласовано» - наш ход (запросить реквизиты), «Жду подпись» - ход блогера, а после трёх дней тишины - снова наш (напомнить)
 */
export function nextStep(i: Integration, docs: DocLite[], settings: Settings | null, today = todayISO()): NextStep | null {
  if (!isActive(i)) return null
  const waited = Math.max(0, daysBetween(i.status_changed_at ?? i.updated_at, today))
  const ours = (text: string, tone?: NextStep['tone']): NextStep => ({ group: 'now', text, tone, sort: -waited })
  // what - чего ждём; пусто, если это уже сказано в названии шага («Жду подпись»)
  const theirs = (what = ''): NextStep =>
    waited >= REMIND_AFTER
      ? { group: 'now', text: `напомнить: молчит ${waited}\u00a0дн.`, tone: 'warn', sort: -waited }
      : { group: 'wait', text: [what, waited ? `${waited}\u00a0дн.` : 'с сегодня'].filter(Boolean).join(' '), sort: -waited }
  switch (i.status) {
    case 'new':
      return ours('написать блогеру')
    case 'contacted':
      return theirs('ждём ответ')
    case 'waiting_reply':
      return theirs()
    case 'negotiating':
      return ours('договориться о цене и дате')
    case 'agreed':
      return ours('запросить реквизиты')
    case 'waiting_details':
      return theirs()
    case 'waiting_contract':
      return ours('подготовить и отправить договор')
    case 'waiting_signature':
      return theirs()
    case 'waiting_payment':
      return ours(i.price ? `оплатить ${money(i.price)}` : 'оплатить')
    case 'paid': {
      if (!i.publish_date) return ours('указать дату выхода')
      const left = daysBetween(today, i.publish_date)
      if (left < 0) return { group: 'now', text: `проверить выход: был ${date(i.publish_date)}`, tone: 'warn', sort: left }
      if (left <= 1 && !i.erid) return { group: 'now', text: `получить erid: выход ${left ? 'завтра' : 'сегодня'}`, tone: 'bad', sort: left - 100 }
      return { group: 'soon', text: left === 0 ? 'выход сегодня' : left === 1 ? 'выход завтра' : `выход ${date(i.publish_date)}`, sort: left }
    }
    case 'published': {
      const c = checklist(i, docs)
      const miss = [!c[0].done && 'нет договора', !i.erid && 'нет erid', !c[3].done && 'нет чека или акта', !c[4].done && 'нет скрина статистики', !i.fact_reach && 'нет охвата', !c[5].done && 'не сдано в ОРД'].filter(Boolean) as string[]
      const dl = !i.ord_reported_at ? ordDeadline(i, settings) : null
      const late = dl ? daysBetween(today, dl) : 999
      if (!miss.length) return { group: 'tails', text: 'всё собрано - можно закрыть', sort: 1000 }
      return { group: 'tails', text: miss.join(', '), tone: late < 0 ? 'bad' : late <= 7 ? 'warn' : undefined, sort: late }
    }
  }
  return null
}

/** Предупреждения перед сменой статуса. Не запрет — можно перевести всё равно */
export function transitionWarnings(i: Integration, b: Blogger | undefined, docs: DocLite[], to: Status): string[] {
  const w: string[] = []
  const at = STATUS_ORDER[to]
  if (to === 'declined') return w
  if (b && at >= STATUS_ORDER.waiting_contract) {
    if (!legalInfo(b.legal_status).ok) w.push(b.legal_status === 'unknown' ? 'У блогера не указан статус самозанятого или ИП' : `Работаем только с самозанятыми и ИП, а у блогера: ${legalInfo(b.legal_status).label}`)
    if ((b.followers ?? 0) >= 10_000 && b.rkn_registered !== true) w.push('У блогера 10 000+ подписчиков, а регистрация в перечне РКН не отмечена')
  }
  if (at >= STATUS_ORDER.published && !i.erid) w.push('Нет erid - выход без маркировки публиковать нельзя')
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
    if (t.done_at || taskOwner(t) !== me || !t.due_date || t.due_date > today) continue
    out.push({ key: `t${t.id}`, text: `${t.due_date < today ? 'Просрочена задача' : 'Задача на сегодня'}${t.assignee_id ? '' : ' (без исполнителя)'}: ${t.title}`, link: `/tasks/${t.id}`, tone: t.due_date < today ? 'bad' : 'warn' })
  }
  for (const i of integrations) {
    if (!mine(i)) continue
    // молчание считаем от смены этапа: правка заметки или цены не сбрасывает напоминание
    const since = i.status_changed_at ?? i.updated_at
    if (isActive(i) && (i.status === 'contacted' || i.status === 'waiting_reply') && daysBetween(since, today) >= 3) {
      out.push({ key: `s${i.id}`, text: `${nick(i.blogger_id)} молчит ${daysBetween(since, today)} дн. - пора напомнить`, link: `?i=${i.id}`, tone: 'warn' })
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
      if (c.status === 'active' && !c.prepaid) out.push({ key: `p${c.id}`, text: `Сделка «${c.name}» идёт без предоплаты`, link: `/work/${c.id}`, tone: 'bad' })
    }
  }
  return out
}
