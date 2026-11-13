import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, FileSpreadsheet, MoreHorizontal, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { BLOGGER_STATUSES, PLATFORMS } from '../lib/constants'
import { isActive } from '../lib/rules'
import { count, cpm, money, plural } from '../lib/format'
import type { Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, BloggerStatusBadge, BloggerStatusSelect, Button, Empty, Input, Menu, PageHeader, Select, Spinner, StatusSelect, Table, cx } from '../components/ui'
import { confirmDialog, promptDialog } from '../components/dialogs'
import { AudienceBar, BloggerName, statsStale } from '../components/bits'
import { BloggerDrawer, useBloggerStatus } from '../components/BloggerDrawer'
import { SendOfferButton } from '../components/OfferCard'
import { BloggerFormModal } from '../components/BloggerForm'
import { ImportModal } from '../components/ImportModal'

type SortKey = 'nick' | 'followers' | 'avg_reach' | 'price' | 'cpm' | 'updated_at'

export function Bloggers() {
  const { bloggers, integrations, campaign, lists, listItems, loading, error, moveIntegration, reload } = useData()
  const { team, personName, personAvatar, profile, isAdmin } = useAuth()
  const { id } = useParams()
  const nav = useNavigate()
  const setStatus = useBloggerStatus()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [limit, setLimit] = useState(100)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const q = params.get('q') ?? ''
  // список (вкладка) и статус — отдельные фильтры; старые ссылки с ?tab= понимаем как статус
  const list = params.get('list') ?? ''
  const status = params.get('status') ?? params.get('tab') ?? ''
  const anchor = useRef<string | null>(null)
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

  const members = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const it of listItems) m.set(it.list_id, (m.get(it.list_id) ?? new Set()).add(it.blogger_id))
    return m
  }, [listItems])
  const current = lists.find((l) => l.id === list)
  const inList = useMemo(() => (current ? base.filter((b) => members.get(current.id)?.has(b.id)) : base), [base, current, members])
  const byStatus = (b: Blogger, st: string) => (st === 'active' ? activeBy.has(b.id) : st === 'stale' ? statsStale(b) : b.status === st)

  const rows = useMemo(() => {
    const list = inList.filter((b) => !status || byStatus(b, status))
    const val = (b: Blogger): number | string => (sort === 'nick' ? b.nick.toLowerCase() : sort === 'cpm' ? (cpm(b.price, b.avg_reach) ?? Infinity * dir) : sort === 'updated_at' ? b.updated_at : (b[sort] ?? -1))
    return [...list].sort((a, z) => (val(a) < val(z) ? -dir : val(a) > val(z) ? dir : 0))
  }, [inList, status, sort, dir, activeBy])

  const open = (b: Blogger) => nav({ pathname: `/bloggers/${b.id}`, search: params.toString() })
  // Shift+клик по галочке выделяет всех между прошлой отмеченной и этой
  const toggle = (bid: string, shift = false) => {
    const shown = rows.slice(0, limit).map((b) => b.id)
    const from = anchor.current ? shown.indexOf(anchor.current) : -1
    const to = shown.indexOf(bid)
    setPicked((s) => {
      const n = new Set(s)
      const on = !n.has(bid)
      const ids = shift && from >= 0 && to >= 0 ? shown.slice(Math.min(from, to), Math.max(from, to) + 1) : [bid]
      for (const id of ids) {
        if (on) n.add(id)
        else n.delete(id)
      }
      return n
    })
    anchor.current = bid
  }
  const chosen = bloggers.filter((b) => picked.has(b.id))

  async function newList(): Promise<string | null> {
    const name = await promptDialog({ title: 'Новый список', label: 'Название', placeholder: 'Весна, beauty, кандидаты для «Пятёрки»', ok: 'Создать', required: true })
    if (!name?.trim()) return null
    const { data, error } = await supabase.from('blogger_lists').insert({ name: name.trim() }).select('id').single()
    if (error) {
      toast(/blogger_lists/.test(error.message) ? 'Сначала запустите миграцию 010_blogger_lists.sql в Supabase' : error.message)
      return null
    }
    await reload('blogger_lists')
    return (data as { id: string }).id
  }

  async function toList(id: string) {
    const lid = id === 'new' ? await newList() : id
    if (!lid) return
    const have = members.get(lid) ?? new Set()
    const add = chosen.filter((b) => !have.has(b.id)).map((b) => ({ list_id: lid, blogger_id: b.id }))
    if (add.length) {
      const { error } = await supabase.from('blogger_list_items').insert(add)
      if (error) return toast(error.message)
      await reload('blogger_list_items')
    }
    const name = lists.find((l) => l.id === lid)?.name ?? 'список'
    toast(add.length ? `В «${name}» добавлено: ${add.length}` : `Эти блогеры уже в «${name}»`)
    setPicked(new Set())
  }

  async function fromList() {
    if (!current) return
    const { error } = await supabase.from('blogger_list_items').delete().eq('list_id', current.id).in('blogger_id', [...picked])
    if (error) return toast(error.message)
    await reload('blogger_list_items')
    toast(`Убрано из «${current.name}»: ${picked.size}`)
    setPicked(new Set())
  }

  async function renameList() {
    if (!current) return
    const name = await promptDialog({ title: 'Переименовать список', label: 'Название', value: current.name, ok: 'Сохранить', required: true })
    if (!name?.trim() || name.trim() === current.name) return
    const { error } = await supabase.from('blogger_lists').update({ name: name.trim() }).eq('id', current.id)
    if (error) return toast(error.message)
    reload('blogger_lists')
  }

  async function deleteList() {
    if (!current) return
    const n = members.get(current.id)?.size ?? 0
    if (!(await confirmDialog({ title: `Удалить список «${current.name}»?`, body: n ? `Блогеры (${n}) останутся в базе, удалится только список` : 'Список пустой', ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from('blogger_lists').delete().eq('id', current.id)
    if (error) return toast(error.message)
    set('list', null)
    reload('blogger_lists', 'blogger_list_items')
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
          <Input className="rounded-full! bg-surface pl-10" placeholder="Ник, тематика, контакт" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={platform} onChange={(e) => set('platform', e.target.value)} aria-label="Площадка" tone="surface" className="w-40">
          <option value="">Все площадки</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        {/* специалисту тоже нужен этот выбор: уведомление «Вам передали блогеров» открывает список с фильтром «Мои» */}
        {!isAdmin && (
          <Select value={owner === 'me' ? 'me' : ''} onChange={(e) => set('owner', e.target.value)} aria-label="Ответственный" tone="surface" className="w-52">
            <option value="">Все доступные</option>
            <option value="me">Где я ответственный</option>
          </Select>
        )}
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
        <Select value={status} onChange={(e) => set('status', e.target.value || null)} aria-label="Статус" tone="surface" className="w-56">
          <option value="">Все статусы</option>
          <option value="active">{`В работе ${inList.filter((b) => activeBy.has(b.id)).length}`}</option>
          {BLOGGER_STATUSES.map((st) => (
            <option key={st.id} value={st.id}>
              {`${st.label} ${inList.filter((b) => b.status === st.id).length}`}
            </option>
          ))}
          <option value="stale">{`Статистика устарела ${inList.filter(statsStale).length}`}</option>
        </Select>
      </div>
      {/* вкладки: «Все» и списки, которые создают учредители */}
      <div className="mb-4 flex items-center gap-2">
        <div role="tablist" aria-label="Списки блогеров" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
          {[{ id: '', name: 'Все', n: base.length }, ...lists.map((l) => ({ id: l.id, name: l.name, n: base.filter((b) => members.get(l.id)?.has(b.id)).length }))].map((t) => (
            <button
              key={t.id || 'all'}
              role="tab"
              aria-selected={list === t.id || (!current && !t.id)}
              onClick={() => {
                set('list', t.id || null)
                setPicked(new Set())
              }}
              className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150', list === t.id || (!current && !t.id) ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
            >
              {t.name}
              <span className={cx('num', list === t.id || (!current && !t.id) ? 'text-white/60' : 'text-faint')}>{t.n}</span>
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={async () => {
                const id = await newList()
                if (id) set('list', id)
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] whitespace-nowrap text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
              Новый список
            </button>
          )}
        </div>
        {isAdmin && current && (
          <Menu
            value={'' as string}
            chevron={false}
            title={`Список «${current.name}»`}
            options={[
              { id: 'rename', label: 'Переименовать' },
              { id: 'delete', label: 'Удалить список' },
            ]}
            onChange={(v) => (v === 'rename' ? renameList() : deleteList())}
            trigger={
              <span className="flex size-10 items-center justify-center rounded-full bg-surface text-muted hover:text-ink">
                <MoreHorizontal className="size-4" strokeWidth={1.5} />
              </span>
            }
          />
        )}
      </div>

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
      ) : current && !members.get(current.id)?.size ? (
        <Empty title={`В списке «${current.name}» пока никого`}>Откройте вкладку «Все», отметьте блогеров галочками и выберите «В список…» внизу экрана</Empty>
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
                  {isAdmin && <th className="text-right">Ответственный</th>}
                </tr>
              }
            >
              {rows.slice(0, limit).map((b) => {
                const c = cpm(b.price, b.avg_reach)
                return (
                  <tr key={b.id} onClick={() => open(b)} onKeyDown={(e) => e.key === 'Enter' && open(b)} tabIndex={0} className={cx('group cursor-pointer transition-colors duration-150 hover:bg-soft', (id === b.id || picked.has(b.id)) && 'bg-soft')}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={picked.has(b.id)}
                        onChange={() => {}}
                        onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                        onClick={(e) => toggle(b.id, e.shiftKey)}
                        aria-label={`Выбрать ${b.nick}`}
                        title="Shift+клик выделяет всех между двумя галочками"
                      />
                    </td>
                    <td className="max-w-52">
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1">
                          <BloggerName b={b} />
                        </span>
                        <SendOfferButton b={b} className="-my-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
                      </div>
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
                      <td className="text-right">
                        {b.owner_id ? (
                          <Avatar name={personName(b.owner_id)} src={personAvatar(b.owner_id)} className="size-6 align-middle text-[10px]" />
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
                <div role="button" tabIndex={0} onClick={() => open(b)} className={cx('rounded-inner bg-surface p-4', picked.has(b.id) && 'ring-2 ring-ink/20')}>
                  <div className="flex items-start justify-between gap-2">
                    {/* галочка на телефоне: массовые действия (в подборку, передать) работают и здесь */}
                    <label className="-m-2 flex items-center p-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={picked.has(b.id)}
                        onChange={() => {}}
                        onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                        onClick={(e) => toggle(b.id, e.shiftKey)}
                        aria-label={`Выбрать ${b.nick}`}
                        title="Shift+клик выделяет всех между двумя галочками"
                      />
                    </label>
                    <span className="min-w-0 flex-1">
                      <BloggerName b={b} />
                    </span>
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
          {current && (
            <Button variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={fromList}>
              Убрать из списка
            </Button>
          )}
          <Select value="" onChange={(e) => e.target.value && toList(e.target.value)} aria-label="Добавить в список" tone="dark" className="w-44">
            <option value="">В список…</option>
            {lists
              .filter((l) => l.id !== current?.id)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            {isAdmin && <option value="new">Новый список…</option>}
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

      {id && <BloggerDrawer key={id} id={id} onClose={() => nav({ pathname: '/bloggers', search: params.toString() })} />}
      <BloggerFormModal open={adding} onClose={() => setAdding(false)} onCreated={open} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </>
  )
}
