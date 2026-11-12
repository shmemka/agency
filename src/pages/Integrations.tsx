import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Plus, Search } from 'lucide-react'
import { fetchAll, supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { PHASES, statusInfo, type Status } from '../lib/constants'
import { count, cpm, date, money } from '../lib/format'
import type { Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Empty, Input, PageHeader, Select, Spinner, StatusSelect } from '../components/ui'
import { IntegrationFormModal } from '../components/IntegrationForm'
import { PlatformTag } from './Bloggers'

export function Integrations() {
  const { bloggerById, campaigns, pulse } = useData()
  const [items, setItems] = useState<Integration[] | null>(null)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Integration | null>(null)
  const [adding, setAdding] = useState(false)

  const q = params.get('q') ?? ''
  const campaign = params.get('campaign') ?? ''
  const phase = params.get('phase') ?? ''
  const period = params.get('period') ?? 'all'
  const filter = params.get('filter') ?? ''
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }

  const load = useCallback(async () => {
    try {
      const rows = await fetchAll<Integration>((f, t) => supabase.from('integrations').select('*').order('publish_date', { ascending: false, nullsFirst: true }).range(f, t))
      setItems(rows)
    } catch (e) {
      toast((e as Error).message)
      setItems([])
    }
  }, [])
  useEffect(() => {
    load()
  }, [load, pulse])

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (items ?? []).filter((i) => {
      if (campaign === 'none' ? i.campaign_id : campaign && i.campaign_id !== campaign) return false
      if (phase && statusInfo(i.status).phase !== phase) return false
      if (period === 'month' && !(i.publish_date && i.publish_date >= monthStart)) return false
      if (period === 'upcoming' && !(i.publish_date && i.publish_date >= today)) return false
      if (filter === 'no_erid' && (i.erid || !['agreed', 'waiting_payment', 'paid', 'published'].includes(i.status))) return false
      if (needle) {
        const b = bloggerById(i.blogger_id)
        const hay = [b?.nick, b?.name, i.promo_code, i.format, i.erid].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [items, q, campaign, phase, period, filter, bloggerById, monthStart, today])

  const totals = rows.reduce(
    (a, i) => ({ price: a.price + (i.price ?? 0), reach: a.reach + (i.fact_reach ?? 0), revenue: a.revenue + (i.revenue ?? 0) }),
    { price: 0, reach: 0, revenue: 0 },
  )

  async function setStatus(i: Integration, s: Status) {
    setItems((list) => list?.map((x) => (x.id === i.id ? { ...x, status: s } : x)) ?? null)
    const { error } = await supabase.from('integrations').update({ status: s }).eq('id', i.id)
    toast(error ? error.message : `${bloggerById(i.blogger_id)?.nick}: ${statusInfo(s).label}`)
  }

  return (
    <>
      <PageHeader
        title="Интеграции"
        sub="Все выходы блогеров: даты, деньги, охваты и маркировка"
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Новая интеграция
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Ник, промокод, erid" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={campaign} onChange={(e) => set('campaign', e.target.value)} className="w-56" aria-label="Кампания">
          <option value="">Все кампании</option>
          <option value="none">Без кампании</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={phase} onChange={(e) => set('phase', e.target.value)} className="w-40" aria-label="Этап">
          <option value="">Любой этап</option>
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select value={period} onChange={(e) => set('period', e.target.value === 'all' ? '' : e.target.value)} className="w-40" aria-label="Период">
          <option value="all">За всё время</option>
          <option value="month">Этот месяц</option>
          <option value="upcoming">Предстоящие</option>
        </Select>
        <Select value={filter} onChange={(e) => set('filter', e.target.value)} className="w-44" aria-label="Маркировка">
          <option value="">Любая маркировка</option>
          <option value="no_erid">Без erid</option>
        </Select>
      </div>

      {items === null ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Empty title={items.length ? 'Под фильтры ничего не подходит' : 'Интеграций пока нет'}>
          {items.length ? 'Измените фильтры или поиск.' : 'Интеграция — это конкретный выход блогера. Добавьте её здесь или в карточке блогера.'}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[13px] [&_td.num]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="border-b border-line bg-base/60 text-xs text-muted">
                <tr>
                  {['Дата', 'Блогер', 'Кампания', 'Статус'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                  {['Цена', 'Гарант', 'Факт', 'CPM факт', 'Сумма оплат'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-right font-medium">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-medium">Промокод</th>
                  <th className="px-3 py-2.5 font-medium">erid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, 500).map((i) => {
                  const b = bloggerById(i.blogger_id)
                  const f = cpm(i.price, i.fact_reach)
                  const needErid = ['agreed', 'waiting_payment', 'paid', 'published'].includes(i.status)
                  return (
                    <tr key={i.id} tabIndex={0} onClick={() => setEditing(i)} onKeyDown={(e) => e.key === 'Enter' && setEditing(i)} className="cursor-pointer hover:bg-base/70">
                      <td className="num px-3 py-2.5 whitespace-nowrap">{date(i.publish_date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {b && <PlatformTag p={b.platform} />}
                          <Link to={`/bloggers/${i.blogger_id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-accent">
                            {b?.nick ?? '—'}
                          </Link>
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-muted">{campaigns.find((c) => c.id === i.campaign_id)?.name ?? '—'}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <StatusSelect value={i.status} onChange={(s) => setStatus(i, s)} />
                      </td>
                      <td className="num px-3 py-2.5 text-right font-medium">{money(i.price)}</td>
                      <td className="num px-3 py-2.5 text-right text-muted">{count(i.guaranteed_reach)}</td>
                      <td className="num px-3 py-2.5 text-right">{count(i.fact_reach)}</td>
                      <td className="num px-3 py-2.5 text-right text-muted">{f ? money(f) : '—'}</td>
                      <td className="num px-3 py-2.5 text-right text-muted">{i.revenue ? money(i.revenue) : '—'}</td>
                      <td className="px-3 py-2.5 text-muted">{i.promo_code ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {i.erid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Check className="size-3.5" />
                            {i.ord_registered ? 'ОРД' : 'есть'}
                          </span>
                        ) : needErid ? (
                          <span className="text-amber-700">нужен</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-line bg-base/60 text-[13px]">
                <tr>
                  <td className="px-3 py-2.5 font-medium" colSpan={4}>
                    Итого: {rows.length}
                  </td>
                  <td className="num px-3 py-2.5 text-right font-medium">{money(totals.price)}</td>
                  <td />
                  <td className="num px-3 py-2.5 text-right">{count(totals.reach)}</td>
                  <td className="num px-3 py-2.5 text-right text-muted">{totals.reach ? money(cpm(totals.price, totals.reach)) : '—'}</td>
                  <td className="num px-3 py-2.5 text-right text-muted">{totals.revenue ? money(totals.revenue) : '—'}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          {rows.length > 500 && <p className="border-t border-line p-3 text-center text-xs text-muted">Показаны первые 500 — уточните фильтры.</p>}
        </div>
      )}

      <IntegrationFormModal open={adding} onClose={() => setAdding(false)} campaignId={campaign && campaign !== 'none' ? campaign : undefined} onSaved={load} />
      <IntegrationFormModal open={!!editing} onClose={() => setEditing(null)} initial={editing} onSaved={load} />
    </>
  )
}
