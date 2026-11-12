import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Columns3, ExternalLink, FileSpreadsheet, Plus, Rows3, Search, ShieldAlert } from 'lucide-react'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { PHASES, PLATFORMS, STATUSES, legalInfo, statusInfo, type Phase, type Status } from '../lib/constants'
import { count, cpm, date, money } from '../lib/format'
import type { Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Empty, Input, PageHeader, Select, Spinner, StatusSelect, cx } from '../components/ui'
import { BloggerDrawer } from '../components/BloggerDrawer'
import { BloggerFormModal } from '../components/BloggerForm'
import { ImportModal } from '../components/ImportModal'

type SortKey = 'nick' | 'followers' | 'avg_reach' | 'price' | 'cpm' | 'updated_at'

export function PlatformTag({ p }: { p: Blogger['platform'] }) {
  const info = PLATFORMS.find((x) => x.id === p)!
  return (
    <span className="inline-flex h-5 min-w-6 items-center justify-center rounded bg-base px-1 text-[10px] font-semibold text-muted ring-1 ring-line" title={info.label}>
      {info.short}
    </span>
  )
}

export function Bloggers() {
  const { bloggers, loading, error, patchBlogger } = useData()
  const { team, personName, profile } = useAuth()
  const { id } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [limit, setLimit] = useState(200)

  const q = params.get('q') ?? ''
  const phase = (params.get('phase') ?? 'active') as Phase | 'all' | 'active'
  const status = params.get('status') as Status | null
  const platform = params.get('platform') ?? ''
  const owner = params.get('owner') ?? ''
  const view = params.get('view') === 'board' ? 'board' : 'table'
  const sort = (params.get('sort') ?? 'updated_at') as SortKey
  const dir = params.get('dir') === 'asc' ? 1 : -1

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v === null || v === '') p.delete(k)
    else p.set(k, v)
    setParams(p, { replace: true })
  }

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return bloggers.filter((b) => {
      if (platform && b.platform !== platform) return false
      if (owner === 'me' && b.owner_id !== profile?.id) return false
      if (owner === 'none' && b.owner_id) return false
      if (owner && owner !== 'me' && owner !== 'none' && b.owner_id !== owner) return false
      if (needle) {
        const hay = [b.nick, b.name, b.topic, b.contact, b.city, b.audience, b.content_type, ...(b.tags ?? [])].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [bloggers, q, platform, owner, profile?.id])

  const phaseCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const b of base) {
      const ph = statusInfo(b.status).phase
      c[ph] = (c[ph] ?? 0) + 1
    }
    return c
  }, [base])
  const activeCount = base.filter((b) => !['done', 'declined', 'blacklist'].includes(b.status)).length

  const rows = useMemo(() => {
    const list = base.filter((b) => {
      if (status) return b.status === status
      if (phase === 'all') return true
      if (phase === 'active') return !['done', 'declined', 'blacklist'].includes(b.status)
      return statusInfo(b.status).phase === phase
    })
    const val = (b: Blogger): number | string => {
      if (sort === 'nick') return b.nick.toLowerCase()
      if (sort === 'cpm') return cpm(b.price, b.avg_reach) ?? Number.POSITIVE_INFINITY * dir
      if (sort === 'updated_at') return b.updated_at
      return (b[sort] as number | null) ?? -1
    }
    return [...list].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      return x < y ? -dir : x > y ? dir : 0
    })
  }, [base, phase, status, sort, dir])

  async function changeStatus(b: Blogger, s: Status) {
    const err = await patchBlogger(b.id, { status: s })
    if (err) toast(`Не удалось сменить статус: ${err}`)
    else toast(`${b.nick}: ${statusInfo(s).label}`)
  }

  const open = (b: Blogger) => nav({ pathname: `/bloggers/${b.id}`, search: params.toString() })

  const SortHead = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={cx('px-3 py-2.5 font-medium', right && 'text-right')}>
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
        {sort === k && (dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )

  return (
    <>
      <PageHeader
        title="Блогеры"
        sub={`${bloggers.length} в базе, ${activeCount} в работе`}
        actions={
          <>
            <Button onClick={() => setImporting(true)}>
              <FileSpreadsheet className="size-4" />
              Импорт из Excel
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Добавить блогера
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Ник, тематика, контакт, город" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={platform} onChange={(e) => set('platform', e.target.value)} aria-label="Площадка" className="w-36">
          <option value="">Все площадки</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select value={owner} onChange={(e) => set('owner', e.target.value)} aria-label="Ответственный" className="w-44">
          <option value="">Все ответственные</option>
          <option value="me">Мои</option>
          <option value="none">Без ответственного</option>
          {team
            .filter((t) => t.is_active)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || t.email}
              </option>
            ))}
        </Select>
        <div className="ml-auto flex rounded-lg bg-surface p-0.5 ring-1 ring-line" role="group" aria-label="Вид">
          {[
            { v: 'table', icon: Rows3, label: 'Таблица' },
            { v: 'board', icon: Columns3, label: 'Доска' },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => set('view', o.v === 'table' ? null : o.v)}
              aria-pressed={view === o.v}
              className={cx('inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px]', view === o.v ? 'bg-night text-white' : 'text-muted hover:text-ink')}
            >
              <o.icon className="size-4" />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[
            { id: 'active', label: 'В работе', n: activeCount },
            { id: 'all', label: 'Все', n: base.length },
            ...PHASES.map((p) => ({ id: p.id, label: p.label, n: phaseCounts[p.id] ?? 0, dot: p.dot })),
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => {
                const p = new URLSearchParams(params)
                p.delete('status')
                if (c.id === 'active') p.delete('phase')
                else p.set('phase', c.id)
                setParams(p, { replace: true })
              }}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] ring-1 transition-colors',
                phase === c.id && !status ? 'bg-ink text-white ring-ink' : 'bg-surface text-muted ring-line hover:text-ink',
              )}
            >
              {'dot' in c && c.dot && <span className={cx('size-1.5 rounded-full', c.dot)} />}
              {c.label}
              <span className="num opacity-60">{c.n}</span>
            </button>
          ))}
          {phase !== 'active' && phase !== 'all' && (
            <Select value={status ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Статус" className="h-8 w-44">
              <option value="">Любой статус этапа</option>
              {STATUSES.filter((s) => s.phase === phase).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <Empty title="Не удалось загрузить блогеров">{error}</Empty>
      ) : bloggers.length === 0 ? (
        <Empty
          title="В базе пока нет блогеров"
          action={
            <div className="flex justify-center gap-2">
              <Button onClick={() => setImporting(true)}>Импорт из Excel</Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Добавить блогера
              </Button>
            </div>
          }
        >
          Загрузите таблицу с никами или добавьте первого блогера вручную.
        </Empty>
      ) : view === 'board' ? (
        <Board bloggers={base} onOpen={open} onMove={changeStatus} personName={personName} />
      ) : rows.length === 0 ? (
        <Empty title="Никого не нашли">Измените поиск или фильтры.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-[13px] [&_td.num]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="border-b border-line bg-base/60 text-xs text-muted">
                <tr>
                  <SortHead k="nick">Блогер</SortHead>
                  <th className="px-3 py-2.5 font-medium">Статус</th>
                  <SortHead k="followers" right>
                    Подписчики
                  </SortHead>
                  <SortHead k="avg_reach" right>
                    Охват
                  </SortHead>
                  <SortHead k="price" right>
                    Цена
                  </SortHead>
                  <SortHead k="cpm" right>
                    CPM
                  </SortHead>
                  <th className="px-3 py-2.5 font-medium">Тематика</th>
                  <th className="px-3 py-2.5 font-medium">Контакт</th>
                  <th className="px-3 py-2.5 font-medium">Ответственный</th>
                  <SortHead k="updated_at">Обновлён</SortHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, limit).map((b) => {
                  const c = cpm(b.price, b.avg_reach)
                  const legal = legalInfo(b.legal_status)
                  return (
                    <tr
                      key={b.id}
                      onClick={() => open(b)}
                      onKeyDown={(e) => e.key === 'Enter' && open(b)}
                      tabIndex={0}
                      className={cx('cursor-pointer hover:bg-base/70 focus-visible:bg-base', id === b.id && 'bg-accent-soft/50')}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <PlatformTag p={b.platform} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{b.nick}</span>
                              {b.url && (
                                <a href={b.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-faint hover:text-accent" aria-label="Открыть профиль">
                                  <ExternalLink className="size-3.5" />
                                </a>
                              )}
                              {!legal.ok && ['agreed', 'waiting_details', 'waiting_contract', 'waiting_signature', 'waiting_payment'].includes(b.status) && (
                                <span title="Не указан статус самозанятого/ИП">
                                  <ShieldAlert className="size-3.5 text-amber-500" />
                                </span>
                              )}
                            </div>
                            {b.name && <div className="truncate text-xs text-muted">{b.name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusSelect value={b.status} onChange={(s) => changeStatus(b, s)} />
                      </td>
                      <td className="num px-3 py-2.5 text-right">{count(b.followers)}</td>
                      <td className="num px-3 py-2.5 text-right">{count(b.avg_reach)}</td>
                      <td className="num px-3 py-2.5 text-right font-medium">{money(b.price)}</td>
                      <td className="num px-3 py-2.5 text-right text-muted">{c ? money(c) : '—'}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-muted" title={b.topic ?? b.content_type ?? ''}>
                        {b.topic || b.content_type || '—'}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2.5 text-muted">{b.contact || '—'}</td>
                      <td className="px-3 py-2.5">
                        {b.owner_id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar name={personName(b.owner_id)} className="size-5 text-[9px]" />
                            <span className="whitespace-nowrap">{personName(b.owner_id).split(' ')[0]}</span>
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted">{date(b.updated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <Button size="sm" onClick={() => setLimit((l) => l + 300)}>
                Показать ещё {Math.min(300, rows.length - limit)} из {rows.length - limit}
              </Button>
            </div>
          )}
        </div>
      )}

      {id && <BloggerDrawer id={id} onClose={() => nav({ pathname: '/bloggers', search: params.toString() })} />}
      <BloggerFormModal open={adding} onClose={() => setAdding(false)} onCreated={(b) => open(b)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </>
  )
}

function Board({
  bloggers,
  onOpen,
  onMove,
  personName,
}: {
  bloggers: Blogger[]
  onOpen: (b: Blogger) => void
  onMove: (b: Blogger, s: Status) => void
  personName: (id: string | null) => string
}) {
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const cols = STATUSES.filter((s) => showClosed || !['done', 'declined', 'blacklist'].includes(s.id))

  return (
    <div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-night" />
        Показать закрытых и отказы
      </label>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-3">
          {cols.map((s) => {
            const ph = PHASES.find((p) => p.id === s.phase)!
            const items = bloggers.filter((b) => b.status === s.id)
            return (
              <section
                key={s.id}
                aria-label={s.label}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(s.id)
                }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={() => {
                  const b = bloggers.find((x) => x.id === drag)
                  if (b && b.status !== s.id) onMove(b, s.id)
                  setDrag(null)
                  setOver(null)
                }}
                className={cx('flex w-[244px] shrink-0 flex-col rounded-xl bg-line/40 p-2 transition-colors', over === s.id && 'bg-accent-soft ring-2 ring-accent/40')}
              >
                <header className="flex items-center gap-2 px-1.5 pt-1 pb-2">
                  <span className={cx('size-2 rounded-full', ph.dot)} />
                  <span className="text-[13px] font-medium">{s.label}</span>
                  <span className="num ml-auto text-xs text-muted">{items.length}</span>
                </header>
                <div className="flex min-h-16 flex-col gap-1.5">
                  {items.slice(0, 60).map((b) => (
                    <button
                      key={b.id}
                      draggable
                      onDragStart={() => setDrag(b.id)}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => onOpen(b)}
                      className={cx('rounded-lg bg-surface p-2.5 text-left shadow-[0_1px_0_rgba(23,26,43,0.06)] ring-1 ring-line hover:ring-night/30', drag === b.id && 'opacity-40')}
                    >
                      <div className="flex items-center gap-1.5">
                        <PlatformTag p={b.platform} />
                        <span className="truncate text-[13px] font-medium">{b.nick}</span>
                      </div>
                      <div className="num mt-1.5 flex items-center justify-between text-xs text-muted">
                        <span>{money(b.price)}</span>
                        {b.avg_reach ? <span>{count(b.avg_reach)} охв.</span> : null}
                      </div>
                      {b.owner_id && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                          <Avatar name={personName(b.owner_id)} className="size-4 text-[8px]" />
                          {personName(b.owner_id)}
                        </div>
                      )}
                    </button>
                  ))}
                  {items.length > 60 && <p className="px-1.5 py-1 text-xs text-muted">и ещё {items.length - 60} — смотрите в таблице</p>}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
