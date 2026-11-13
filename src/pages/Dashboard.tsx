import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { PHASES, statusInfo } from '../lib/constants'
import { isActive, isLive, ordDeadline, taskOwner } from '../lib/rules'
import { count, date, money, plural, todayISO } from '../lib/format'
import { Card, PageHeader, StatusBadge, cx } from '../components/ui'
import { BloggerName, TaskList, useIntegrationPanel } from '../components/bits'
import { useAttention } from '../components/Layout'

/** На телефоне полоска узкая: подписи этапов короче, чтобы не обрезались */
const SHORT: Record<string, string> = { talks: 'Перегов.', papers: 'Докум.' }

export function Dashboard() {
  const { integrations, campaigns, tasks, settings, blogger, campaign, bloggers, loading } = useData()
  const { profile, isAdmin } = useAuth()
  const { open } = useIntegrationPanel()
  // свои задачи уже в «Мои задачи на сегодня» — во «Требует внимания» их не повторяем
  const items = useAttention().filter((a) => !a.key.startsWith('t'))
  const today = todayISO()
  const month = today.slice(0, 7)

  const active = integrations.filter(isActive)
  const flow = PHASES.filter((p) => p.id !== 'stop')
  const byPhase = (id: string) => active.filter((i) => statusInfo(i.status).phase === id)
  const total = active.length || 1
  const livePhase = flow.findIndex((p) => p.id === 'live')

  const myTasks = tasks.filter((t) => taskOwner(t) === profile?.id && !t.done_at && !!t.due_date && t.due_date <= today).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  const thisMonth = integrations.filter((i) => i.publish_date?.startsWith(month) && i.status !== 'declined' && (!i.campaign_id || i.client_decision === 'approved'))
  const out = thisMonth.filter(isLive)
  const upcoming = active.filter((i) => i.publish_date && i.publish_date >= today && !isLive(i)).sort((a, b) => a.publish_date!.localeCompare(b.publish_date!)).slice(0, 6)
  const ord = integrations
    .filter((i) => isLive(i) && !i.ord_reported_at)
    .map((i) => ({ i, dl: ordDeadline(i, settings) }))
    .filter((x) => x.dl)
    .sort((a, b) => a.dl!.localeCompare(b.dl!))
  const running = campaigns.filter((c) => c.status === 'active' || c.status === 'planning')
  const commission = integrations.filter((i) => i.campaign_id && running.some((c) => c.id === i.campaign_id) && i.client_decision === 'approved' && i.status !== 'declined').reduce((a, i) => a + Math.max(0, (i.price_client ?? i.price ?? 0) - (i.price ?? 0)), 0)

  return (
    <>
      <PageHeader title={new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())} sub={isAdmin ? 'Все блогеры и кампании агентства' : 'Ваши блогеры и кампании'} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="rise lg:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base">В работе сейчас</h2>
            <Link to="/integrations?tab=active" className="text-[13px] text-muted hover:text-ink">
              Все интеграции
            </Link>
          </div>
          <div className="num mt-2 text-[44px] leading-[48px] tracking-tight">
            {active.length} <span className="text-base tracking-normal text-muted">{plural(active.length, 'интеграция', 'интеграции', 'интеграций')}</span>
          </div>
          {/* яркий момент экрана: путь интеграций от поиска до выхода */}
          <div className="mt-6 flex gap-1" role="img" aria-label="Интеграции по этапам">
            {flow.map((p, idx) => {
              const n = byPhase(p.id).length
              return (
                <Link key={p.id} to={`/integrations?tab=active&phase=${p.id}`} className="group min-w-12 sm:min-w-24" style={{ flex: `${Math.max(n / total, 0.08)} 1 0` }}>
                  <div className={cx('h-10 rounded-full transition-opacity duration-150 group-hover:opacity-80', n === 0 ? 'hatch' : idx >= livePhase - 1 ? 'bar-lime' : 'bg-ink')} style={n > 0 && idx < livePhase - 1 ? { opacity: 0.25 + idx * 0.25 } : undefined} />
                  <div className="mt-2 truncate text-[11px] text-muted sm:text-xs">
                    <span className="sm:hidden">{SHORT[p.id] ?? p.label}</span>
                    <span className="max-sm:hidden">{p.label}</span>
                  </div>
                  <div className="num text-base">{n}</div>
                </Link>
              )
            })}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <div className="text-[13px] text-muted">Выходы в {new Date().toLocaleDateString('ru-RU', { month: 'long' }).replace(/[ьй]$/, 'е').replace(/т$/, 'те')}</div>
            <div className="num mt-1 text-[28px] leading-8">
              {out.length} <span className="text-base text-muted">из {thisMonth.length}</span>
            </div>
            <div className="num mt-1 text-xs text-muted">охват {count(out.reduce((a, i) => a + (i.fact_reach ?? 0), 0))}</div>
          </Card>
          {isAdmin ? (
            <Card>
              <div className="text-[13px] text-muted">Комиссия по текущим кампаниям</div>
              <div className="num mt-1 text-[28px] leading-8">{money(commission)}</div>
              <div className="mt-1 text-xs text-muted">
                {running.length} {plural(running.length, 'кампания', 'кампании', 'кампаний')}, по одобренным интеграциям
              </div>
            </Card>
          ) : (
            <Card>
              <div className="text-[13px] text-muted">Ваши блогеры</div>
              <div className="num mt-1 text-[28px] leading-8">{bloggers.length}</div>
              <div className="mt-1 text-xs text-muted">в работе {new Set(active.map((i) => i.blogger_id)).size}</div>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base">Мои задачи на сегодня</h2>
            <Link to="/tasks" className="text-[13px] text-muted hover:text-ink">
              Все задачи
            </Link>
          </div>
          <TaskList tasks={myTasks} empty="На сегодня задач нет" />
        </Card>

        <Card>
          <h2 className="mb-2 text-base">Требует внимания</h2>
          {items.length === 0 ? (
            <p className="text-muted">{loading ? 'Загружаем' : 'Никто не молчит, сроки не горят'}</p>
          ) : (
            <ul>
              {items.slice(0, 7).map((a) => (
                <li key={a.key}>
                  {a.link.startsWith('?i=') ? (
                    <button onClick={() => open(a.link.slice(3))} className="flex min-h-11 w-full items-center gap-3 border-t border-line py-2 text-left hover:bg-soft">
                      <span className={cx('size-2 shrink-0 rounded-full', a.tone === 'bad' ? 'bg-bad' : 'bg-amber-400')} />
                      {a.text}
                    </button>
                  ) : (
                    <Link to={a.link} className="flex min-h-11 items-center gap-3 border-t border-line py-2 hover:bg-soft">
                      <span className={cx('size-2 shrink-0 rounded-full', a.tone === 'bad' ? 'bg-bad' : 'bg-amber-400')} />
                      {a.text}
                    </Link>
                  )}
                </li>
              ))}
              {items.length > 7 && <li className="border-t border-line pt-2 text-[13px] text-muted">И ещё {items.length - 7}, все в колокольчике</li>}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base">Ближайшие выходы</h2>
            <Link to="/calendar" className="text-[13px] text-muted hover:text-ink">
              Календарь
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-muted">Дат выхода пока нет. Поставьте дату в интеграции, и она появится здесь</p>
          ) : (
            <ul>
              {upcoming.map((i) => (
                <li key={i.id}>
                  <button onClick={() => open(i.id)} className="flex min-h-12 w-full items-center gap-3 border-t border-line py-2 text-left hover:bg-soft">
                    <span className="num w-16 shrink-0">{date(i.publish_date)}</span>
                    <span className="min-w-0 flex-1">
                      <BloggerName b={blogger(i.blogger_id)} />
                    </span>
                    <span className="hidden max-w-32 truncate text-xs text-muted sm:inline">{campaign(i.campaign_id)?.name}</span>
                    <StatusBadge status={i.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base">Сдать статистику в ОРД</h2>
            {ord.length > 0 && (
              <Link to="/integrations?tab=ord" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                Отметить сданные <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
              </Link>
            )}
          </div>
          {ord.length === 0 ? (
            <p className="text-muted">По всем вышедшим интеграциям статистика передана</p>
          ) : (
            <ul>
              {ord.slice(0, 6).map(({ i, dl }) => (
                <li key={i.id}>
                  <button onClick={() => open(i.id)} className="flex min-h-12 w-full items-center gap-3 border-t border-line py-2 text-left hover:bg-soft">
                    <span className="min-w-0 flex-1">
                      <BloggerName b={blogger(i.blogger_id)} />
                    </span>
                    <span className={cx('num shrink-0 text-[13px]', dl! < today ? 'text-bad' : 'text-muted')}>{dl! < today ? `срок прошёл ${date(dl)}` : `до ${date(dl)}`}</span>
                  </button>
                </li>
              ))}
              {ord.length > 6 && <li className="border-t border-line pt-2 text-[13px] text-muted">И ещё {ord.length - 6}</li>}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
