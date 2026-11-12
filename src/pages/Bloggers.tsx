import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, FileSpreadsheet, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { BLOGGER_STATUSES, PLATFORMS } from '../lib/constants'
import { addToCampaign } from '../lib/actions'
import { isActive } from '../lib/rules'
import { count, cpm, money, plural } from '../lib/format'
import type { Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, BloggerStatusBadge, BloggerStatusSelect, Button, Empty, Input, PageHeader, Segmented, Select, Spinner, StatusSelect, Table, cx } from '../components/ui'
import { AudienceBar, BloggerName, statsStale } from '../components/bits'
import { BloggerDrawer, useBloggerStatus } from '../components/BloggerDrawer'
import { BloggerFormModal } from '../components/BloggerForm'
import { ImportModal } from '../components/ImportModal'

type SortKey = 'nick' | 'followers' | 'avg_reach' | 'price' | 'cpm' | 'updated_at'

export function Bloggers() {
  const { bloggers, integrations, campaigns, campaign, loading, error, moveIntegration, reload } = useData()
  const { team, personName, profile, isAdmin } = useAuth()
  const { id } = useParams()
  const nav = useNavigate()
  const setStatus = useBloggerStatus()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [limit, setLimit] = useState(100)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const q = params.get('q') ?? ''
  const tab = params.get('tab') ?? 'all'
  const platform = params.get('platform') ?? ''
  const owner = params.get('owner') ?? ''
  const sort = (params.get('sort') ?? 'updated_at') as SortKey
  const dir = params.get('dir') === 'asc' ? 1 : -1
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (!v) p.delete(k)
    else p.set(k, v)
    setParams(p, { replace: true })
  }

  const activeBy = useMemo(() => {
    const m = new Map<string, typeof integrations>()
    for (const i of integrations) if (isActive(i)) m.set(i.blogger_id, [...(m.get(i.blogger_id) ?? []), i])
    return m
  }, [integrations])

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return bloggers.filter((b) => {
      if (platform && b.platform !== platform) return false
      if (owner === 'me' && b.owner_id !== profile?.id) return false
      if (owner === 'none' && b.owner_id) return false
      if (owner && owner !== 'me' && owner !== 'none' && b.owner_id !== owner) return false
      if (needle && ![b.nick, b.name, b.topic, b.contact, b.city, b.content_type, ...(b.tags ?? [])].join(' ').toLowerCase().includes(needle)) return false
      return true
    })
  }, [bloggers, q, platform, owner, profile?.id])

  const rows = useMemo(() => {
    const list = base.filter((b) => (tab === 'all' ? true : tab === 'active' ? activeBy.has(b.id) : tab === 'stale' ? statsStale(b) : b.status === tab))
    const val = (b: Blogger): number | string => (sort === 'nick' ? b.nick.toLowerCase() : sort === 'cpm' ? (cpm(b.price, b.avg_reach) ?? Infinity * dir) : sort === 'updated_at' ? b.updated_at : (b[sort] ?? -1))
    return [...list].sort((a, z) => (val(a) < val(z) ? -dir : val(a) > val(z) ? dir : 0))
  }, [base, tab, sort, dir, activeBy])

  const open = (b: Blogger) => nav({ pathname: `/bloggers/${b.id}`, search: params.toString() })
  const toggle = (bid: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(bid)) n.delete(bid)
      else n.add(bid)
      return n
    })
  const chosen = bloggers.filter((b) => picked.has(b.id))

  async function toShortlist(cid: string) {
    const { added, error } = await addToCampaign(cid, chosen, integrations)
    if (error) return toast(error)
    await reload('integrations')
    toast(added ? `В подборку «${campaign(cid)?.name}» добавлено: ${added}` : 'Эти блогеры уже в подборке')
    setPicked(new Set())
  }

  async function transfer(pid: string) {
    const { error } = await supabase.from('bloggers').update({ owner_id: pid }).in('id', [...picked])
    if (error) return toast(error.message)
    await reload('bloggers')
    toast(`Передано ${personName(pid)}: ${picked.size}`)
    setPicked(new Set())
  }

  const Th = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={cx(right && 'text-right')}>
      <button
        className={cx('inline-flex items-center gap-1 hover:text-ink', sort === k && 'text-ink')}
        onClick={() => {
          const p = new URLSearchParams(params)
          p.set('sort', k)
          p.set('dir', sort === k && dir === -1 ? 'asc' : 'desc')
          setParams(p, { replace: true })
        }}
      >
        {children}
        {sort === k && (dir === 1 ? <ArrowUp className="size-3" strokeWidth={1.5} /> : <ArrowDown className="size-3" strokeWidth={1.5} />)}
      </button>
    </th>
  )

  const work = (b: Blogger) => {
    const list = activeBy.get(b.id)
    if (!list) return <span className="text-faint">—</span>
    return (
      <div className="flex flex-col items-start gap-1">
        {list.slice(0, 2).map((i) => (
          <span key={i.id} onClick={(e) => e.stopPropagation()}>
            <StatusSelect value={i.status} onChange={(s) => moveIntegration(i, s)} />
            {i.campaign_id && <span className="mt-0.5 block max-w-36 truncate pl-2.5 text-xs text-muted">{campaign(i.campaign_id)?.name}</span>}
          </span>
        ))}
        {list.length > 2 && <span className="text-xs text-muted">и ещё {list.length - 2}</span>}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Блогеры"
        sub={isAdmin ? `${bloggers.length} в базе, ${activeBy.size} в работе` : `Ваши блогеры: ${bloggers.length}, в работе ${activeBy.size}`}
        actions={
          <>
            <Button onClick={() => setImporting(true)}>
              <FileSpreadsheet className="size-4" strokeWidth={1.5} />
              Импорт из Excel
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" strokeWidth={1.5} />
              Добавить блогера
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" strokeWidth={1.5} />
          <Input className="bg-surface pl-10" placeholder="Ник, тематика, контакт" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={platform} onChange={(e) => set('platform', e.target.value)} aria-label="Площадка" tone="surface" className="w-40">
          <option value="">Все площадки</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        {isAdmin && (
          <Select value={owner} onChange={(e) => set('owner', e.target.value)} aria-label="Ответственный" tone="surface" className="w-48">
            <option value="">Все ответственные</option>
            <option value="me">Мои</option>
            <option value="none">Без ответственного</option>
            {team
              .filter((t) => t.is_active && t.id !== profile?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email}
                </option>
              ))}
          </Select>
        )}
      </div>
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => set('tab', v === 'all' ? null : v)}
        options={[
          { id: 'all', label: `Все ${base.length}` },
          { id: 'active', label: `В работе ${base.filter((b) => activeBy.has(b.id)).length}` },
          ...BLOGGER_STATUSES.map((s) => ({ id: s.id as string, label: `${s.label} ${base.filter((b) => b.status === s.id).length}` })),
          { id: 'stale', label: 'Статистика устарела' },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <Empty title="Блогеры не загрузились">{error}</Empty>
      ) : bloggers.length === 0 ? (
        <Empty
          title="Здесь будут ваши блогеры"
          action={
            <>
              <Button onClick={() => setImporting(true)}>Импорт из Excel</Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Добавить блогера
              </Button>
            </>
          }
        >
          Загрузите таблицу с никами или добавьте первого блогера вручную
        </Empty>
      ) : rows.length === 0 ? (
        <Empty title="Никого не нашли">Измените поиск или фильтры</Empty>
      ) : (
        <>
          <div className="hidden md:block">
            <Table
              min={860}
              head={
                <tr>
                  <th className="w-10" />
                  <Th k="nick">Блогер</Th>
                  <th>Статус</th>
                  <th>В работе</th>
                  <Th k="followers" right>
                    Подписчики
                  </Th>
                  <Th k="avg_reach" right>
                    Охват
                  </Th>
                  <th className="max-[1379px]:hidden">Аудитория</th>
                  <Th k="price" right>
                    Цена
                  </Th>
                  <Th k="cpm" right>
                    CPM
                  </Th>
                  {isAdmin && <th>Ответственный</th>}
                </tr>
              }
            >
              {rows.slice(0, limit).map((b) => {
                const c = cpm(b.price, b.avg_reach)
                return (
                  <tr key={b.id} onClick={() => open(b)} onKeyDown={(e) => e.key === 'Enter' && open(b)} tabIndex={0} className={cx('cursor-pointer transition-colors duration-150 hover:bg-soft', (id === b.id || picked.has(b.id)) && 'bg-soft')}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(b.id)} onChange={() => toggle(b.id)} aria-label={`Выбрать ${b.nick}`} className="size-4 accent-[#15171c]" />
                    </td>
                    <td className="max-w-44">
                      <BloggerName b={b} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <BloggerStatusSelect value={b.status} onChange={(s) => setStatus(b, s)} />
                    </td>
                    <td>{work(b)}</td>
                    <td className="num text-right">{count(b.followers)}</td>
                    <td className={cx('num text-right', statsStale(b) && 'text-faint')} title={statsStale(b) ? 'Статистика старше 60 дней' : undefined}>
                      {count(b.avg_reach)}
                    </td>
                    <td className="max-[1379px]:hidden">
                      <AudienceBar female={b.audience_female_pct} age={b.audience_age} className="w-28" />
                    </td>
                    <td className="num text-right">{money(b.price)}</td>
                    <td className="num text-right text-muted">{c ? money(c) : '—'}</td>
                    {isAdmin && (
                      <td>
                        {b.owner_id ? (
                          <span className="inline-flex items-center gap-2">
                            <Avatar name={personName(b.owner_id)} className="size-6 text-[10px]" />
                            {personName(b.owner_id).split(' ')[0]}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.slice(0, limit).map((b) => (
              <li key={b.id}>
                <div role="button" tabIndex={0} onClick={() => open(b)} className="rounded-inner bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <BloggerName b={b} />
                    <BloggerStatusBadge status={b.status} />
                  </div>
                  <div className="num mt-3 flex justify-between text-[13px] text-muted">
                    <span>{count(b.followers)} подп.</span>
                    <span>охват {count(b.avg_reach)}</span>
                    <span>{money(b.price)}</span>
                  </div>
                  {activeBy.has(b.id) && <div className="mt-3">{work(b)}</div>}
                </div>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <div className="mt-3 text-center">
              <Button onClick={() => setLimit((l) => l + 200)}>Показать ещё {Math.min(200, rows.length - limit)}</Button>
            </div>
          )}
        </>
      )}

      {picked.size > 0 && (
        <div className="rise fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-[28px] bg-ink p-2 pl-5 text-white md:bottom-6">
          <span className="flex-1 whitespace-nowrap">
            {picked.size} {plural(picked.size, 'блогер', 'блогера', 'блогеров')}
          </span>
          <Select value="" onChange={(e) => e.target.value && toShortlist(e.target.value)} aria-label="Добавить в подборку" tone="dark" className="w-44">
            <option value="">В подборку…</option>
            {campaigns
              .filter((c) => c.status === 'planning' || c.status === 'active')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
          {isAdmin && (
            <Select value="" onChange={(e) => e.target.value && transfer(e.target.value)} aria-label="Передать специалисту" tone="dark" className="w-40">
              <option value="">Передать…</option>
              {team
                .filter((t) => t.is_active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || t.email}
                  </option>
                ))}
            </Select>
          )}
          <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setPicked(new Set())}>
            Снять
          </Button>
        </div>
      )}

      {id && <BloggerDrawer id={id} onClose={() => nav({ pathname: '/bloggers', search: params.toString() })} />}
      <BloggerFormModal open={adding} onClose={() => setAdding(false)} onCreated={open} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </>
  )
}
