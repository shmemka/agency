import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { PHASES, statusInfo } from '../lib/constants'
import { checklist, isActive, isLive, ordDeadline } from '../lib/rules'
import { count, cpm, date, money, todayISO } from '../lib/format'
import type { Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Chip, Empty, Input, PageHeader, Segmented, Select, Spinner, StatusBadge, StatusSelect, Table, cx } from '../components/ui'
import { BloggerName, useIntegrationPanel } from '../components/bits'
import { NewIntegrationModal } from '../components/BloggerForm'

export function Integrations() {
  const { integrations, blogger, campaign, campaigns, docs, settings, loading, moveIntegration, reload } = useData()
  const { profile } = useAuth()
  const { open } = useIntegrationPanel()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const q = params.get('q') ?? ''
  const tab = params.get('tab') ?? 'active'
  const cid = params.get('campaign') ?? ''
  const phase = params.get('phase') ?? ''
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const today = todayISO()

  // подборки, которые клиент ещё не одобрил, живут на странице кампании
  const all = useMemo(() => integrations.filter((i) => !i.campaign_id || i.client_decision === 'approved'), [integrations])
  const ready = (i: Integration) => checklist(i, docs).filter((x) => x.done).length
  const needsOrd = (i: Integration) => isLive(i) && !i.ord_reported_at && i.marked_by === 'us'
  const noDocs = (i: Integration) => i.status === 'published' && ready(i) < 6

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((i) => {
        if (tab === 'active' && !isActive(i)) return false
        if (tab === 'live' && !isLive(i)) return false
        if (tab === 'ord' && !needsOrd(i)) return false
        if (tab === 'docs' && !noDocs(i)) return false
        if (cid === 'none' ? i.campaign_id : cid && i.campaign_id !== cid) return false
        if (phase && statusInfo(i.status).phase !== phase) return false
        if (needle) {
          const b = blogger(i.blogger_id)
          if (![b?.nick, b?.name, i.promo_code, i.erid].join(' ').toLowerCase().includes(needle)) return false
        }
        return true
      })
      .sort((a, z) => (z.publish_date ?? '9999').localeCompare(a.publish_date ?? '9999'))
  }, [all, tab, cid, phase, q, blogger, docs])

  const totals = rows.reduce((a, i) => ({ price: a.price + (i.price ?? 0), reach: a.reach + (i.fact_reach ?? 0) }), { price: 0, reach: 0 })

  async function markOrd() {
    if (!window.confirm(`Отметить, что статистика передана в ОРД по ${rows.length} интеграциям?`)) return
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
      <PageHeader
        title="Интеграции"
        sub="Каждый выход блогера: этап, деньги, документы и маркировка"
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={1.5} />
            Новая интеграция
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" strokeWidth={1.5} />
          <Input className="bg-surface pl-10" placeholder="Ник, промокод, erid" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={cid} onChange={(e) => set('campaign', e.target.value)} tone="surface" className="w-56" aria-label="Кампания">
          <option value="">Все кампании</option>
          <option value="none">Без кампании</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={phase} onChange={(e) => set('phase', e.target.value)} tone="surface" className="w-40" aria-label="Этап">
          <option value="">Любой этап</option>
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(v) => set('tab', v)}
          options={[
            { id: 'active', label: `В работе ${all.filter(isActive).length}` },
            { id: 'live', label: `Вышли ${all.filter(isLive).length}` },
            { id: 'docs', label: `Не хватает документов ${all.filter(noDocs).length}` },
            { id: 'ord', label: `Не сдано в ОРД ${all.filter(needsOrd).length}` },
            { id: 'all', label: 'Все' },
          ]}
        />
        {tab === 'ord' && rows.length > 0 && (
          <Button variant="primary" size="sm" loading={busy} onClick={markOrd}>
            Отметить сданными: {rows.length}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Empty title={all.length ? 'Под фильтры ничего не подходит' : 'Интеграций пока нет'}>{all.length ? 'Измените фильтры или поиск' : 'Интеграция появляется, когда вы начинаете переговоры с блогером или клиент одобряет его в подборке'}</Empty>
      ) : (
        <>
          <div className="hidden md:block">
            <Table
              min={840}
              head={
                <tr>
                  <th>Выход</th>
                  <th>Блогер</th>
                  <th>Кампания</th>
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
              {rows.slice(0, 300).map((i) => {
                const f = cpm(i.price_client ?? i.price, i.fact_reach)
                const r = ready(i)
                return (
                  <tr key={i.id} tabIndex={0} onClick={() => open(i.id)} onKeyDown={(e) => e.key === 'Enter' && open(i.id)} className="cursor-pointer transition-colors duration-150 hover:bg-soft">
                    <td className="num">{date(i.publish_date)}</td>
                    <td className="max-w-52">
                      <BloggerName b={blogger(i.blogger_id)} />
                    </td>
                    <td className="max-w-44 truncate text-muted">{campaign(i.campaign_id)?.name ?? '—'}</td>
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
                        <span className="num text-xs text-muted">{r} из 6</span>
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
          <ul className="space-y-2 md:hidden">
            {rows.slice(0, 100).map((i) => (
              <li key={i.id}>
                <div role="button" tabIndex={0} onClick={() => open(i.id)} className="rounded-inner bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <BloggerName b={blogger(i.blogger_id)} />
                    <StatusBadge status={i.status} />
                  </div>
                  <div className="num mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                    <span>{date(i.publish_date)}</span>
                    <span className="text-ink">{money(i.price)}</span>
                    <span className="truncate">{campaign(i.campaign_id)?.name}</span>
                    {isLive(i) && <Chip className="ml-auto h-6 text-xs">{ready(i)} из 6</Chip>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <NewIntegrationModal open={adding} onClose={() => setAdding(false)} onCreated={(i) => (i.campaign_id ? toast('Блогер добавлен в подборку кампании') : open(i.id))} />
    </>
  )
}
