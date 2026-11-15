import { useMemo, useState } from 'react'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, Check, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { PHASES, statusInfo } from '../lib/constants'
import { checklist, isActive, isLive, ordDeadline } from '../lib/rules'
import { count, cpm, date, money, todayISO } from '../lib/format'
import type { Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Chip, Empty, Filters, Input, Menu, PageHeader, Segmented, Select, Skel, SkelTable, StatusBadge, StatusSelect, Table, cx, useEntrance } from '../components/ui'
import { BloggerName, useIntegrationPanel } from '../components/bits'
import { confirmDialog } from '../components/dialogs'
import { IntegrationBoard, NO_DEAL } from '../components/IntegrationBoard'
import { CampaignModal } from '../components/CampaignForm'
import { DealView } from './Campaign'
import type { Campaign } from '../lib/types'

/*
 * «Работа» - одно место для всех сделок.
 * Сделка - один заказ клиента: один блогер или несколько. Работа с блогером всегда идёт в сделке с клиентом.
 * Сверху ряд сделок: «Все» - общая доска интеграций по этапам, сделка - её подборка, доска, документы, отчёт и деньги
 */

const CLOSED: Campaign['status'][] = ['done', 'cancelled']

export function Work() {
  const { id } = useParams()
  const { campaigns, integrations, loading } = useData()
  const { isAdmin } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [creating, setCreating] = useState<Partial<Campaign> | null>(null)
  const open = campaigns.filter((c) => !CLOSED.includes(c.status))
  const closed = campaigns.filter((c) => CLOSED.includes(c.status))
  const orphans = integrations.filter((i) => !i.campaign_id).length
  const noDeal = !id && params.get('deal') === 'none'
  const pill = (on: boolean) => cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-150', on ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink')
  const shut = closed.find((c) => c.id === id)

  return (
    <>
      <PageHeader
        title="Работа"
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setCreating({})}>
              <Plus className="size-4" strokeWidth={1.5} />
              Новая сделка
            </Button>
          )
        }
      />
      {/* сделки: открытые - в ряд, завершённые и отменённые - в архиве */}
      {loading ? (
        <div className="mb-5 flex gap-2">
          {[64, 140, 120, 160].map((w, k) => (
            <Skel key={k} className="h-9 rounded-full" style={{ width: w }} />
          ))}
        </div>
      ) : (
        <nav aria-label="Сделки" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:flex-wrap md:px-6">
          <NavLink to="/work" end className={() => pill(!id && !noDeal)}>
            Все
          </NavLink>
          {open.map((c) => (
            <NavLink key={c.id} to={`/work/${c.id}`} className={({ isActive }) => pill(isActive)}>
              {c.name}
            </NavLink>
          ))}
          {orphans > 0 && (
            <NavLink to="/work?deal=none" className={() => pill(noDeal)}>
              {NO_DEAL}
              <span className="num opacity-60">{orphans}</span>
            </NavLink>
          )}
          {closed.length > 0 && (
            <Menu
              title="Архив сделок"
              value={(shut?.id ?? '') as string}
              chevron={false}
              options={closed.map((c) => ({ id: c.id, label: c.name }))}
              onChange={(v) => nav(`/work/${v}`)}
              trigger={
                <span className={pill(!!shut)}>
                  <Archive className="size-4" strokeWidth={1.5} />
                  {shut ? shut.name : 'Архив'}
                  {!shut && <span className="num opacity-60">{closed.length}</span>}
                </span>
              }
            />
          )}
        </nav>
      )}
      {id ? <DealView key={id} id={id} /> : <AllWork />}
      <CampaignModal value={creating} onClose={() => setCreating(null)} onSaved={(cid) => nav(`/work/${cid}?tab=work&pick=1`)} />
    </>
  )
}

/** Все интеграции всех сделок: доска по этапам и списки того, что нужно доделать */
function AllWork() {
  const { integrations, blogger, campaign, docs, settings, loading, moveIntegration, reload } = useData()
  const entering = useEntrance(!loading)
  const { profile } = useAuth()
  const { open } = useIntegrationPanel()
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(100)
  const q = params.get('q') ?? ''
  // доска - главный вид; старые ссылки ?tab=active и ?tab=live ведут на доску и в полный список
  const raw = params.get('tab') ?? 'board'
  const tab = raw === 'active' ? 'board' : raw === 'live' ? 'all' : raw
  // без сделки - интеграции, заведённые раньше, когда работа без клиента была возможна
  const none = params.get('deal') === 'none'
  const phase = params.get('phase') ?? ''
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const today = todayISO()

  // подборки, которые клиент ещё не одобрил, живут в сделке
  const all = useMemo(() => integrations.filter((i) => !i.campaign_id || i.client_decision === 'approved'), [integrations])
  const ready = (i: Integration) => checklist(i, docs).filter((x) => x.done).length
  const needsOrd = (i: Integration) => isLive(i) && !i.ord_reported_at && i.marked_by === 'us'
  const noDocs = (i: Integration) => i.status === 'published' && ready(i) < 6

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((i) => {
        if (tab === 'board' && !isActive(i)) return false
        if (tab === 'ord' && !needsOrd(i)) return false
        if (tab === 'docs' && !noDocs(i)) return false
        if (none && i.campaign_id) return false
        if (phase && statusInfo(i.status).phase !== phase) return false
        if (needle) {
          const b = blogger(i.blogger_id)
          if (![b?.nick, b?.name, i.promo_code, i.erid].join(' ').toLowerCase().includes(needle)) return false
        }
        return true
      })
      .sort((a, z) => (z.publish_date ?? '9999').localeCompare(a.publish_date ?? '9999'))
  }, [all, tab, none, phase, q, blogger, docs])

  const totals = rows.reduce((a, i) => ({ price: a.price + (i.price ?? 0), reach: a.reach + (i.fact_reach ?? 0) }), { price: 0, reach: 0 })

  async function markOrd() {
    if (!(await confirmDialog({ title: 'Отметить сдачу в ОРД?', body: `Статистика по ${rows.length} интеграциям будет отмечена как переданная`, ok: 'Отметить' }))) return
    setBusy(true)
    const { error } = await supabase.from('integrations').update({ ord_reported_at: new Date().toISOString(), ord_reported_by: profile?.id }).in('id', rows.map((r) => r.id))
    setBusy(false)
    if (error) return toast(error.message)
    await reload('integrations')
    toast('Отмечено: статистика передана')
  }

  const ordCell = (i: Integration) => {
    if (!i.erid) return isLive(i) || statusInfo(i.status).phase === 'money' ? <span className="text-warn">нет erid</span> : <span className="text-faint">—</span>
    if (i.marked_by !== 'us') return <span className="text-muted">erid есть</span>
    if (i.ord_reported_at)
      return (
        <span className="inline-flex items-center gap-1 text-muted">
          <Check className="size-3.5" strokeWidth={1.5} />
          сдано
        </span>
      )
    const dl = ordDeadline(i, settings)
    return dl ? <span className={cx(dl < today ? 'text-bad' : 'text-muted')}>до {date(dl)}</span> : <span className="text-muted">erid есть</span>
  }

  return (
    <>
      {none && (
        <Card className="mb-3 text-[13px] text-muted">
          Эти интеграции заведены без сделки. Откройте карточку и выберите сделку: работа с блогером идёт только с клиентом
        </Card>
      )}
      <div className="mb-3 flex items-center gap-2 md:flex-wrap">
        <div className="relative min-w-0 flex-1 md:min-w-52 md:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" strokeWidth={1.5} />
          <Input className="rounded-full! bg-surface pl-10" type="search" enterKeyHint="search" placeholder="Ник, промокод, erid" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Filters
          active={phase ? 1 : 0}
          onReset={() => set('phase', '')}
        >
        <Select value={phase} onChange={(e) => set('phase', e.target.value)} tone="surface" className="w-40" aria-label="Этап">
          <option value="">Любой этап</option>
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        </Filters>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(v) => set('tab', v)}
          options={[
            { id: 'board', label: `Доска ${all.filter(isActive).length}` },
            { id: 'docs', label: `Нет документов ${all.filter(noDocs).length}` },
            { id: 'ord', label: `Не сдано в ОРД ${all.filter(needsOrd).length}` },
            { id: 'all', label: 'Все списком' },
          ]}
        />
        {tab === 'ord' && rows.length > 0 && (
          <Button variant="primary" size="sm" loading={busy} onClick={markOrd}>
            Отметить сданными: {rows.length}
          </Button>
        )}
      </div>

      {loading ? (
        <SkelTable rows={10} cols={[2.4, 1.6, 1.2, 1, 1, 1]} />
      ) : rows.length === 0 ? (
        <Empty title={all.length ? 'Под фильтры ничего не подходит' : 'В работе пока никого'}>{all.length ? 'Измените фильтры или поиск' : 'Создайте сделку с клиентом и добавьте в неё блогеров: они появятся здесь и пойдут по этапам'}</Empty>
      ) : tab === 'board' ? (
        <div className="appear">
          <IntegrationBoard rows={rows} showCampaign />
        </div>
      ) : (
        <>
          <div className="appear hidden md:block">
            <Table
              enter={entering}
              min={840}
              head={
                <tr>
                  <th>Выход</th>
                  <th>Блогер</th>
                  <th>Сделка</th>
                  <th>Этап</th>
                  <th className="text-right">Блогеру</th>
                  <th className="text-right max-[1379px]:hidden">Клиенту</th>
                  <th className="text-right">Охват</th>
                  <th className="text-right max-[1379px]:hidden">CPM</th>
                  <th>Документы</th>
                  <th>ОРД</th>
                </tr>
              }
            >
              {rows.slice(0, limit).map((i) => {
                const f = cpm(i.price_client ?? i.price, i.fact_reach)
                const r = ready(i)
                return (
                  <tr key={i.id} tabIndex={0} onClick={() => open(i.id)} onKeyDown={(e) => e.key === 'Enter' && open(i.id)} className="cursor-pointer transition-colors duration-150 hover:bg-soft">
                    <td className="num">{date(i.publish_date)}</td>
                    <td className="max-w-52">
                      <BloggerName b={blogger(i.blogger_id)} />
                    </td>
                    <td className={cx('max-w-44 truncate', i.campaign_id ? 'text-muted' : 'text-faint')}>{i.campaign_id ? campaign(i.campaign_id)?.name : NO_DEAL}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <StatusSelect value={i.status} onChange={(s) => moveIntegration(i, s)} />
                    </td>
                    <td className="num text-right">{money(i.price)}</td>
                    <td className="num text-right text-muted max-[1379px]:hidden">{i.campaign_id ? money(i.price_client) : '—'}</td>
                    <td className="num text-right">{i.fact_reach ? count(i.fact_reach) : <span className="text-faint">{i.guaranteed_reach ? `гарант ${count(i.guaranteed_reach)}` : '—'}</span>}</td>
                    <td className="num text-right text-muted max-[1379px]:hidden">{f ? money(f) : '—'}</td>
                    <td>
                      <span className="flex items-center gap-2" title={checklist(i, docs).filter((x) => !x.done).map((x) => x.label).join(', ') || 'Всё на месте'}>
                        <span className="hatch flex h-1.5 w-12 overflow-hidden rounded-full">
                          <span className="bar-lime rounded-full" style={{ width: `${(r / 6) * 100}%` }} />
                        </span>
                        <span className="num text-xs whitespace-nowrap text-muted">{r} из 6</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{ordCell(i)}</td>
                  </tr>
                )
              })}
              <tr className="text-muted">
                <td colSpan={4}>Всего: {rows.length}</td>
                <td className="num text-right text-ink">{money(totals.price)}</td>
                <td className="max-[1379px]:hidden" />
                <td className="num text-right text-ink">{count(totals.reach)}</td>
                <td className="max-[1379px]:hidden" />
                <td colSpan={2} />
              </tr>
            </Table>
          </div>
          <ul className={cx('appear space-y-2 md:hidden', entering && 'stagger')}>
            {rows.slice(0, limit).map((i) => (
              <li key={i.id}>
                <div role="button" tabIndex={0} onClick={() => open(i.id)} className="rounded-inner bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <BloggerName b={blogger(i.blogger_id)} />
                    <StatusBadge status={i.status} />
                  </div>
                  <div className="num mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                    <span>{date(i.publish_date)}</span>
                    <span className="text-ink">{money(i.price)}</span>
                    <span className="truncate">{i.campaign_id ? campaign(i.campaign_id)?.name : NO_DEAL}</span>
                    {isLive(i) && <Chip className="ml-auto h-6 text-xs">{ready(i)} из 6</Chip>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {!loading && tab !== 'board' && rows.length > limit && (
        <div className="mt-3 text-center">
          <Button onClick={() => setLimit((l) => l + 200)}>Показать ещё {Math.min(200, rows.length - limit)}</Button>
        </div>
      )}
    </>
  )
}
