import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { fetchAll, supabase } from '../lib/supabase'
import { PHASES, legalInfo, statusInfo } from '../lib/constants'
import { date, money } from '../lib/format'
import type { Blogger, Integration } from '../lib/types'
import { PageHeader, StatusBadge, cx } from '../components/ui'
import { PlatformTag } from './Bloggers'

const DAY = 86_400_000

export function Dashboard() {
  const { bloggers, campaigns, pulse, bloggerById } = useData()
  const { profile } = useAuth()
  const [ints, setInts] = useState<Integration[]>([])

  useEffect(() => {
    fetchAll<Integration>((f, t) => supabase.from('integrations').select('*').range(f, t)).then(setInts).catch(() => setInts([]))
  }, [pulse])

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'

  const phaseCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const b of bloggers) c[statusInfo(b.status).phase] = (c[statusInfo(b.status).phase] ?? 0) + 1
    return c
  }, [bloggers])
  const flow = PHASES.filter((p) => p.id !== 'stop')
  const flowTotal = flow.reduce((a, p) => a + (phaseCounts[p.id] ?? 0), 0) || 1

  const stale = bloggers
    .filter((b) => (b.status === 'waiting_reply' || b.status === 'contacted') && Date.now() - new Date(b.updated_at).getTime() > 3 * DAY)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
  const due = bloggers.filter((b) => b.next_action_at && b.next_action_at <= today && !['done', 'declined', 'blacklist'].includes(b.status)).sort((a, b) => a.next_action_at!.localeCompare(b.next_action_at!))
  const legalGap = bloggers.filter((b) => ['agreed', 'waiting_details', 'waiting_contract', 'waiting_signature', 'waiting_payment'].includes(b.status) && !legalInfo(b.legal_status).ok)
  const noErid = ints.filter((i) => ['agreed', 'waiting_payment', 'paid', 'published'].includes(i.status) && !i.erid && (!i.publish_date || i.publish_date >= monthStart))
  const thisMonth = ints.filter((i) => i.publish_date && i.publish_date >= monthStart && i.status !== 'declined')
  const upcoming = ints.filter((i) => i.publish_date && i.publish_date >= today && !['declined', 'blacklist'].includes(i.status)).sort((a, b) => a.publish_date!.localeCompare(b.publish_date!)).slice(0, 8)
  const active = campaigns.filter((c) => c.status === 'active' || c.status === 'planning')
  const commission = active.reduce((a, c) => a + ((c.budget ?? 0) * (c.commission_pct ?? 0)) / 100, 0)
  const mine = bloggers.filter((b) => b.owner_id === profile?.id && !['done', 'declined', 'blacklist'].includes(b.status)).length

  const firstName = (profile?.full_name || '').split(' ')[0]

  return (
    <>
      <PageHeader title={firstName ? `${firstName}, вот что сейчас в работе` : 'Что сейчас в работе'} sub={new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-medium">Воронка блогеров</h2>
          <Link to="/bloggers?view=board" className="text-sm text-muted hover:text-accent">
            Открыть доску
          </Link>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-base" aria-hidden>
          {flow.map((p) => (
            <div key={p.id} className={p.dot} style={{ width: `${((phaseCounts[p.id] ?? 0) / flowTotal) * 100}%` }} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
          {PHASES.map((p) => (
            <Link key={p.id} to={`/bloggers?phase=${p.id}`} className="group">
              <div className="flex items-center gap-1.5 text-[13px] text-muted group-hover:text-ink">
                <span className={cx('size-2 rounded-full', p.dot)} />
                {p.label}
              </div>
              <div className="num font-display mt-1 text-2xl font-semibold">{phaseCounts[p.id] ?? 0}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Выходов в этом месяце" value={String(thisMonth.length)} note={`на ${money(thisMonth.reduce((a, i) => a + (i.price ?? 0), 0))}`} to="/integrations?period=month" />
        <Stat label="Комиссия по текущим кампаниям" value={money(commission)} note={`${active.length} кампаний в работе`} to="/campaigns" />
        <Stat label="Мои блогеры в работе" value={String(mine)} note="вы ответственный" to="/bloggers?owner=me" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Todo title="Пора напомнить о себе" hint="Написали или ждём ответ дольше трёх дней" items={stale} render={(b) => `без движения с ${date(b.updated_at)}`} />
        <Todo title="Следующий шаг на сегодня" hint="Срок в карточке наступил" items={due} render={(b) => `до ${date(b.next_action_at)}`} />
        <Todo title="Нет статуса самозанятого или ИП" hint="Без него договор не заключаем" items={legalGap} render={(b) => legalInfo(b.legal_status).label} />
        <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <h2 className="font-medium">Интеграции без erid</h2>
          <p className="text-[13px] text-muted">Каждый выход маркируем через ОРД</p>
          {noErid.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Все согласованные выходы промаркированы.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {noErid.slice(0, 6).map((i) => {
                const b = bloggerById(i.blogger_id)
                return (
                  <li key={i.id} className="flex items-center gap-2 py-2 text-[13px]">
                    {b && <PlatformTag p={b.platform} />}
                    <Link to={`/bloggers/${i.blogger_id}`} className="font-medium hover:text-accent">
                      {b?.nick ?? '—'}
                    </Link>
                    <span className="text-muted">{date(i.publish_date)}</span>
                    <StatusBadge status={i.status} className="ml-auto" />
                  </li>
                )
              })}
              {noErid.length > 6 && (
                <li className="pt-2 text-[13px]">
                  <Link to="/integrations?filter=no_erid" className="text-muted hover:text-accent">
                    Ещё {noErid.length - 6}
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h2 className="font-medium">Ближайшие выходы</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Запланированных выходов нет. Поставьте дату выхода в интеграции — она появится здесь.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {upcoming.map((i) => {
              const b = bloggerById(i.blogger_id)
              return (
                <li key={i.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="num w-20 font-medium">{date(i.publish_date)}</span>
                  {b && <PlatformTag p={b.platform} />}
                  <Link to={`/bloggers/${i.blogger_id}`} className="font-medium hover:text-accent">
                    {b?.nick}
                  </Link>
                  <span className="hidden truncate text-muted sm:inline">{campaigns.find((c) => c.id === i.campaign_id)?.name}</span>
                  <span className="num ml-auto">{money(i.price)}</span>
                  <StatusBadge status={i.status} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

function Stat({ label, value, note, to }: { label: string; value: string; note: string; to: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-surface p-5 ring-1 ring-line hover:ring-night/30">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="num font-display mt-2 text-[26px] leading-none font-semibold">{value}</div>
      <div className="mt-2 text-xs text-muted">{note}</div>
    </Link>
  )
}

function Todo({ title, hint, items, render }: { title: string; hint: string; items: Blogger[]; render: (b: Blogger) => string }) {
  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {items.length > 0 && <span className="num rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent-dark">{items.length}</span>}
      </div>
      <p className="text-[13px] text-muted">{hint}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Здесь пусто — всё в порядке.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.slice(0, 6).map((b) => (
            <li key={b.id} className="flex items-center gap-2 py-2 text-[13px]">
              <PlatformTag p={b.platform} />
              <Link to={`/bloggers/${b.id}`} className="font-medium hover:text-accent">
                {b.nick}
              </Link>
              <span className="truncate text-muted">{render(b)}</span>
              <StatusBadge status={b.status} className="ml-auto" />
            </li>
          ))}
          {items.length > 6 && <li className="pt-2 text-[13px] text-muted">и ещё {items.length - 6}</li>}
        </ul>
      )}
    </section>
  )
}
