import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { AGE_GROUPS, DECISIONS, PLATFORMS, STATUSES, campaignStatusLabel, phaseInfo, platformLabel } from '../lib/constants'
import { addToCampaign } from '../lib/actions'
import { isLive } from '../lib/rules'
import { count, cpm, date, downloadXlsx, money, parseNumber, plural } from '../lib/format'
import type { Blogger, Campaign, Decision, Income, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Chip, Empty, Field, IconButton, Input, Menu, Modal, PageHeader, Progress, Segmented, Select, Spinner, StatusBadge, StatusSelect, Table, Toggle, cx, submitOnEnter } from '../components/ui'
import { AudienceBar, BloggerName, useIntegrationPanel } from '../components/bits'
import { CampaignModal, ShareBox } from '../components/CampaignForm'
import { DocumentsPanel } from '../components/DocumentsPanel'
import { confirmDialog } from '../components/dialogs'

type Tab = 'shortlist' | 'work' | 'docs' | 'report' | 'money'
const ORDER: Record<Decision, number> = { pending: 0, none: 1, approved: 2, rejected: 3 }

export function CampaignPage() {
  const { id = '' } = useParams()
  const { campaign, clients, integrations, loading, reload } = useData()
  const { isAdmin, personName, profile } = useAuth()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null)
  const c = campaign(id)
  const rows = useMemo(() => integrations.filter((i) => i.campaign_id === id), [integrations, id])
  const approved = rows.filter((i) => i.client_decision === 'approved' && i.status !== 'declined')
  const tab = (sp.get('tab') as Tab) ?? (approved.length && !rows.some((i) => i.client_decision === 'pending') ? 'work' : 'shortlist')
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(sp)
    p.set('tab', t)
    setSp(p, { replace: true })
  }

  if (!c) return loading ? <Spinner className="mx-auto mt-20" /> : <Empty title="Кампания не найдена">Возможно, её удалили или у вас нет к ней доступа</Empty>
  const canEdit = isAdmin || c.owner_id === profile?.id

  async function remove() {
    // кандидаты из подборки без кампании никому не нужны: удаляем их, а одобренные интеграции оставляем
    const drafts = rows.filter((i) => i.client_decision !== 'approved')
    const kept = rows.length - drafts.length
    const body = [
      drafts.length ? `Кандидаты из подборки удалятся: ${drafts.length}.` : '',
      kept ? `Одобренные интеграции останутся у блогеров, но без кампании: ${kept}.` : '',
    ].filter(Boolean).join(' ') || 'В кампании нет блогеров'
    if (!(await confirmDialog({ title: `Удалить кампанию «${c!.name}»?`, body, ok: 'Удалить', danger: true }))) return
    if (drafts.length) {
      const d = await supabase.from('integrations').delete().in('id', drafts.map((i) => i.id))
      if (d.error) return toast(d.error.message)
    }
    const { error } = await supabase.from('campaigns').delete().eq('id', c!.id)
    if (error) return toast(error.message)
    await reload('campaigns', 'integrations')
    nav('/campaigns')
  }

  return (
    <>
      <Link to="/campaigns" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ChevronLeft className="size-4" strokeWidth={1.5} />
        Кампании
      </Link>
      <PageHeader
        title={c.name}
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Chip tone={c.status === 'active' ? 'dark' : undefined}>{campaignStatusLabel(c.status)}</Chip>
            <span>{clients.find((x) => x.id === c.client_id)?.name ?? 'Клиент не указан'}</span>
            {(c.start_date || c.end_date) && (
              <span className="num">
                {date(c.start_date)} – {date(c.end_date)}
              </span>
            )}
            {c.owner_id && <span>ведёт {personName(c.owner_id).split(' ')[0]}</span>}
          </span>
        }
        actions={
          <>
            <Link to={`/calendar?campaign=${c.id}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium hover:bg-white/70">
              <CalendarDays className="size-4" strokeWidth={1.5} />
              Календарь
            </Link>
            {canEdit && (
              <Button onClick={() => setEdit(c)}>
                <Pencil className="size-4" strokeWidth={1.5} />
                Изменить
              </Button>
            )}
            {isAdmin && (
              <IconButton label="Удалить кампанию" onClick={remove} className="bg-surface hover:text-bad">
                <Trash2 className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            )}
          </>
        }
      />
      <Segmented<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'shortlist', label: `Подборка ${rows.length || ''}` },
          { id: 'work', label: `В работе ${approved.length || ''}` },
          { id: 'docs', label: 'Документы' },
          { id: 'report', label: 'Отчёт' },
          ...(isAdmin ? [{ id: 'money' as const, label: 'Деньги' }] : []),
        ]}
      />
      {tab === 'shortlist' && <Shortlist c={c} rows={rows} />}
      {tab === 'work' && <Work rows={approved} />}
      {tab === 'docs' && (
        <Card className="max-w-3xl">
          <DocumentsPanel campaignId={c.id} />
        </Card>
      )}
      {tab === 'report' && <Report c={c} rows={approved} />}
      {tab === 'money' && isAdmin && <Money c={c} rows={approved} />}
      <CampaignModal value={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function PriceCell({ value, onSave, bold }: { value: number | null; onSave: (n: number | null) => void; bold?: boolean }) {
  const [v, setV] = useState(value === null ? '' : String(value))
  useEffect(() => setV(value === null ? '' : String(value)), [value])
  return (
    <input
      inputMode="numeric"
      value={v}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseNumber(v)
        if (n !== value) onSave(n)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        ;(e.target as HTMLInputElement).blur()
      }}
      aria-label="Цена"
      className={cx('num h-8 w-24 rounded-full bg-soft px-3 text-right text-[13px] focus:bg-surface focus:ring-1 focus:ring-ink/25 focus:outline-none', bold && 'font-medium')}
    />
  )
}

function Shortlist({ c, rows }: { c: Campaign; rows: Integration[] }) {
  const { blogger, patchIntegration, reload } = useData()
  const { isAdmin, profile } = useAuth()
  // убрать кандидата может учредитель или тот, кто ведёт кампанию (одобренных — только учредитель)
  const canRemove = (i: Integration) => isAdmin || (c.owner_id === profile?.id && i.client_decision !== 'approved')
  const { open } = useIntegrationPanel()
  const [picking, setPicking] = useState(false)
  const [sharing, setSharing] = useState(false)
  const list = [...rows].sort((a, b) => ORDER[a.client_decision] - ORDER[b.client_decision] || (b.price_client ?? 0) - (a.price_client ?? 0))
  const fresh = rows.filter((i) => i.client_decision === 'none')
  const chosen = rows.filter((i) => i.client_decision === 'approved' && i.status !== 'declined')
  const shown = rows.filter((i) => i.client_decision !== 'none' && i.client_decision !== 'rejected')
  const sum = (xs: Integration[], k: 'price' | 'price_client') => xs.reduce((a, i) => a + (i[k] ?? 0), 0)
  const reach = (xs: Integration[]) => xs.reduce((a, i) => a + (blogger(i.blogger_id)?.avg_reach ?? 0), 0)

  async function send() {
    if (!fresh.length) return
    const { error } = await supabase.from('integrations').update({ client_decision: 'pending' }).in('id', fresh.map((i) => i.id))
    if (error) return toast(error.message)
    await reload('integrations')
    toast(`Клиент увидит ещё ${fresh.length} ${plural(fresh.length, 'блогера', 'блогеров', 'блогеров')}`)
  }

  async function remove(i: Integration) {
    if (!(await confirmDialog({ title: `Убрать ${blogger(i.blogger_id)?.nick} из подборки?`, ok: 'Убрать', danger: true }))) return
    const { error } = await supabase.from('integrations').delete().eq('id', i.id)
    if (error) return toast(error.message)
    reload('integrations')
  }

  const excel = () =>
    downloadXlsx(
      `Подборка, ${c.name}`,
      shown.map((i) => {
        const b = blogger(i.blogger_id)
        return { Блогер: b?.nick, Ссылка: b?.url, Площадка: b ? platformLabel(b.platform) : '', Тематика: b?.topic, Подписчики: b?.followers, 'Средний охват': b?.avg_reach, 'Женщины, %': b?.audience_female_pct, Формат: i.format, 'Цена, ₽': i.price_client, 'CPM, ₽': Math.round(cpm(i.price_client, b?.avg_reach ?? null) ?? 0) || null, Решение: DECISIONS[i.client_decision], Комментарий: i.client_comment }
      }),
    )

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setPicking(true)}>
          <Plus className="size-4" strokeWidth={1.5} />
          Добавить блогеров
        </Button>
        <Button onClick={() => setSharing(true)} disabled={!rows.length}>
          Отправить клиенту{fresh.length ? `: ${fresh.length} ${plural(fresh.length, 'новый', 'новых', 'новых')}` : ''}
        </Button>
        <Button variant="ghost" onClick={excel} disabled={!shown.length}>
          <Download className="size-4" strokeWidth={1.5} />
          Excel для клиента
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty title="Подборка пуста" action={<Button variant="primary" onClick={() => setPicking(true)}>Добавить блогеров</Button>}>
          Соберите кандидатов под задачу клиента, отправьте ссылку, и клиент сам отметит, кого берёт
        </Empty>
      ) : (
        <>
          <div className="hidden md:block">
            <Table
              min={1020}
              head={
                <tr>
                  <th>Блогер</th>
                  <th className="text-right">Подписчики</th>
                  <th className="text-right">Охват</th>
                  <th>Аудитория</th>
                  <th className="text-right">Блогеру, ₽</th>
                  <th className="text-right">Клиенту, ₽</th>
                  <th className="text-right">CPM</th>
                  <th>Решение клиента</th>
                  <th />
                </tr>
              }
            >
              {list.map((i) => {
                const b = blogger(i.blogger_id)
                const k = cpm(i.price_client, b?.avg_reach ?? null)
                return (
                  <tr key={i.id} onClick={() => open(i.id)} className={cx('cursor-pointer transition-colors duration-150 hover:bg-soft', i.client_decision === 'rejected' && 'text-faint')}>
                    <td className="max-w-56">
                      <BloggerName b={b} link />
                    </td>
                    <td className="num text-right">{count(b?.followers)}</td>
                    <td className="num text-right">{count(b?.avg_reach)}</td>
                    <td>{b && <AudienceBar female={b.audience_female_pct} age={b.audience_age} />}</td>
                    <td className="text-right">
                      <PriceCell value={i.price} onSave={(n) => patchIntegration(i.id, { price: n })} />
                    </td>
                    <td className="text-right">
                      <PriceCell bold value={i.price_client} onSave={(n) => patchIntegration(i.id, { price_client: n, price_client_manual: n !== null })} />
                    </td>
                    <td className="num text-right text-muted">{k ? money(k) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <DecisionMenu i={i} />
                      {i.client_comment && <div className="mt-1 max-w-52 truncate text-xs text-muted" title={i.client_comment}>«{i.client_comment}»</div>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canRemove(i) && (
                        <IconButton label="Убрать из подборки" className="size-8 hover:text-bad" onClick={() => remove(i)}>
                          <Trash2 className="size-4" strokeWidth={1.5} />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">
            {list.map((i) => {
              const b = blogger(i.blogger_id)
              return (
                <li key={i.id} className={cx('rounded-inner bg-surface p-4', i.client_decision === 'rejected' && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2" onClick={() => open(i.id)}>
                    <BloggerName b={b} />
                    <span className="num shrink-0 text-right">
                      {money(i.price_client)}
                      <span className="block text-xs text-muted">блогеру {money(i.price)}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="num text-[13px] text-muted">охват {count(b?.avg_reach)}</span>
                    <DecisionMenu i={i} />
                  </div>
                  {i.client_comment && <p className="mt-2 text-[13px] text-muted">«{i.client_comment}»</p>}
                </li>
              )
            })}
          </ul>

          <Card className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Клиент одобрил', `${chosen.length} из ${rows.length}`],
              ['Сумма для клиента', money(sum(chosen, 'price_client'))],
              ['Охват одобренных', count(reach(chosen))],
              ['Средний CPM', chosen.length && reach(chosen) ? money(cpm(sum(chosen, 'price_client'), reach(chosen))) : '—'],
              ...(isAdmin ? [['Блогерам', money(sum(chosen, 'price'))], ['Наша комиссия', money(Math.max(0, sum(chosen, 'price_client') - sum(chosen, 'price')))], ['Наценка кампании', `${c.markup_pct}%`]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[13px] text-muted">{k}</div>
                <div className="num mt-0.5 text-xl">{v}</div>
              </div>
            ))}
          </Card>
        </>
      )}

      <Picker open={picking} onClose={() => setPicking(false)} campaignId={c.id} />
      <Modal open={sharing} onClose={() => setSharing(false)} title="Подборка для клиента">
        <p className="mb-4 text-muted">Клиент открывает ссылку без входа и отмечает, кого берёт. Он видит охваты, аудиторию и цену с наценкой. Цену блогера и контакты не видит</p>
        <ShareBox campaignId={c.id} kind="shortlist" onCreated={send} />
        {fresh.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-inner bg-soft p-4">
            <span>
              {fresh.length} {plural(fresh.length, 'блогер', 'блогера', 'блогеров')} клиент ещё не видит
            </span>
            <Button size="sm" variant="primary" onClick={send}>
              Показать клиенту
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}

function DecisionMenu({ i }: { i: Integration }) {
  const { patchIntegration } = useData()
  const dot = { none: 'bg-stone-300', pending: 'bg-amber-400', approved: 'bg-leaf', rejected: 'bg-stone-400' }
  return (
    <Menu<Decision>
      title="Решение клиента"
      value={i.client_decision}
      onChange={async (d) => {
        const err = await patchIntegration(i.id, { client_decision: d })
        if (err) toast(err)
      }}
      options={(Object.keys(DECISIONS) as Decision[]).map((d) => ({ id: d, label: DECISIONS[d], dot: dot[d] }))}
      trigger={<Chip dot={dot[i.client_decision]}>{DECISIONS[i.client_decision]}</Chip>}
    />
  )
}

function Picker({ open, onClose, campaignId }: { open: boolean; onClose: () => void; campaignId: string }) {
  const { bloggers, integrations, reload } = useData()
  const [q, setQ] = useState('')
  const [platform, setPlatform] = useState('')
  const [female, setFemale] = useState('')
  const [age, setAge] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minReach, setMinReach] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setPicked(new Set())
  }, [open])

  const list = useMemo(() => {
    const have = new Set(integrations.filter((i) => i.campaign_id === campaignId).map((i) => i.blogger_id))
    const n = q.trim().toLowerCase()
    const mp = parseNumber(maxPrice)
    const mr = parseNumber(minReach)
    const top = (b: Blogger) => AGE_GROUPS.map((g) => ({ id: g.id, v: b.audience_age?.[g.id] ?? 0 })).sort((a, z) => z.v - a.v)[0]
    return bloggers
      .filter((b) => {
        if (have.has(b.id) || b.status === 'blacklist') return false
        if (platform && b.platform !== platform) return false
        if (n && ![b.nick, b.name, b.topic, b.content_type].join(' ').toLowerCase().includes(n)) return false
        if (female === 'f' && !((b.audience_female_pct ?? 0) >= 60)) return false
        if (female === 'm' && !(b.audience_female_pct !== null && b.audience_female_pct <= 40)) return false
        if (age && !(top(b).v > 0 && top(b).id === age)) return false
        if (mp !== null && !(b.price !== null && b.price <= mp)) return false
        if (mr !== null && !((b.avg_reach ?? 0) >= mr)) return false
        return true
      })
      .sort((a, z) => (z.avg_reach ?? 0) - (a.avg_reach ?? 0))
  }, [bloggers, integrations, campaignId, q, platform, female, age, maxPrice, minReach])

  async function add() {
    setBusy(true)
    const { added, error } = await addToCampaign(campaignId, bloggers.filter((b) => picked.has(b.id)), integrations)
    setBusy(false)
    if (error) return toast(error)
    await reload('integrations')
    toast(`В подборку добавлено: ${added}`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Добавить блогеров в подборку"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} disabled={!picked.size} onClick={add}>
            {picked.size ? `Добавить ${picked.size}` : 'Выберите блогеров'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" strokeWidth={1.5} />
          <Input className="pl-10" placeholder="Ник или тематика" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Площадка">
          <option value="">Все площадки</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select value={female} onChange={(e) => setFemale(e.target.value)} aria-label="Пол аудитории">
          <option value="">Любой пол аудитории</option>
          <option value="f">Женская, от 60%</option>
          <option value="m">Мужская, от 60%</option>
        </Select>
        <Select value={age} onChange={(e) => setAge(e.target.value)} aria-label="Возраст аудитории">
          <option value="">Любой возраст</option>
          {AGE_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              Больше всего {g.label}
            </option>
          ))}
        </Select>
        <Input inputMode="numeric" placeholder="Цена до, ₽" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} aria-label="Цена до" />
        <Input inputMode="numeric" placeholder="Охват от" value={minReach} onChange={(e) => setMinReach(e.target.value)} aria-label="Охват от" />
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
        <span>Подходит: {list.length}</span>
        <button className="hover:text-ink" onClick={() => setPicked(new Set(picked.size === list.length ? [] : list.map((b) => b.id)))}>
          {picked.size === list.length && list.length ? 'Снять выбор' : `Выбрать всех: ${list.length}`}
        </button>
      </div>
      <ul className="mt-1 max-h-[46vh] overflow-y-auto">
        {list.slice(0, 200).map((b) => (
          <li key={b.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border-t border-line py-2 hover:bg-soft">
              <input
                type="checkbox"
               
                checked={picked.has(b.id)}
                onChange={() =>
                  setPicked((s) => {
                    const n = new Set(s)
                    if (n.has(b.id)) n.delete(b.id)
                    else n.add(b.id)
                    return n
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <BloggerName b={b} />
              </span>
              <span className="hidden w-28 sm:block">
                <AudienceBar female={b.audience_female_pct} age={b.audience_age} />
              </span>
              <span className="num w-20 text-right text-[13px] text-muted">{count(b.avg_reach)}</span>
              <span className="num w-20 text-right text-[13px]">{money(b.price)}</span>
            </label>
          </li>
        ))}
        {list.length === 0 && <li className="border-t border-line py-6 text-center text-muted">Под фильтры никто не подходит</li>}
        {list.length > 200 && <li className="border-t border-line py-3 text-center text-[13px] text-muted">Показаны первые 200 из {list.length}. «Выбрать всех» отмечает всех {list.length}</li>}
      </ul>
    </Modal>
  )
}

function Work({ rows }: { rows: Integration[] }) {
  const { blogger, moveIntegration } = useData()
  const { open } = useIntegrationPanel()
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  if (!rows.length) return <Empty title="Клиент пока никого не одобрил">Одобренные в подборке блогеры появятся здесь и пойдут по этапам: от первого сообщения до выхода</Empty>
  const cols = STATUSES.filter((s) => s.id !== 'declined' || rows.some((i) => i.status === 'declined'))

  return (
    <>
      <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 md:-mx-6 md:block md:px-6">
        <div className="flex gap-2">
          {cols.map((s) => {
            const items = rows.filter((i) => i.status === s.id)
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
                  const i = rows.find((x) => x.id === drag)
                  if (i) moveIntegration(i, s.id)
                  setDrag(null)
                  setOver(null)
                }}
                className={cx('flex w-52 shrink-0 flex-col rounded-inner p-2 transition-colors duration-150', over === s.id ? 'bg-lime/40' : items.length ? 'bg-ink/[0.04]' : 'hatch')}
              >
                <header className="flex h-8 items-center gap-2 px-2 text-[13px]">
                  <span className={cx('size-2 rounded-full', phaseInfo(s.phase).dot)} />
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="num text-muted">{items.length || ''}</span>
                </header>
                <div className="flex min-h-12 flex-col gap-1.5">
                  {items.map((i) => (
                    <button key={i.id} draggable onDragStart={() => setDrag(i.id)} onDragEnd={() => setDrag(null)} onClick={() => open(i.id)} className={cx('rounded-2xl bg-surface p-3 text-left transition-opacity duration-150', drag === i.id && 'opacity-40')}>
                      <span className="block truncate font-medium">{blogger(i.blogger_id)?.nick}</span>
                      <span className="num mt-1 flex justify-between text-xs text-muted">
                        <span>{i.publish_date ? date(i.publish_date) : 'без даты'}</span>
                        <span>{money(i.price)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      <ul className="space-y-2 md:hidden">
        {[...rows]
          .sort((a, b) => STATUSES.findIndex((s) => s.id === a.status) - STATUSES.findIndex((s) => s.id === b.status))
          .map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-inner bg-surface p-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => open(i.id)}>
                <BloggerName b={blogger(i.blogger_id)} />
                <span className="num mt-1 block text-xs text-muted">
                  {i.publish_date ? `выход ${date(i.publish_date)}, ` : ''}
                  {money(i.price)}
                </span>
              </button>
              <StatusSelect value={i.status} onChange={(s) => moveIntegration(i, s)} />
            </li>
          ))}
      </ul>
    </>
  )
}

function Report({ c, rows }: { c: Campaign; rows: Integration[] }) {
  const { blogger } = useData()
  const { open } = useIntegrationPanel()
  const live = rows.filter(isLive)
  const reach = live.reduce((a, i) => a + (i.fact_reach ?? 0), 0)
  const spent = live.reduce((a, i) => a + (i.price_client ?? 0), 0)
  return (
    <div className="grid max-w-5xl gap-3 lg:grid-cols-2">
      <Card>
        <h2 className="text-base">Отчёт для клиента</h2>
        <p className="mt-1 mb-4 text-muted">Открывается по ссылке без входа и обновляется сам. В нём вышедшие интеграции: ссылка на выход, охват, CPM по цене клиента, erid и скрины статистики</p>
        <ShareBox campaignId={c.id} kind="report" />
      </Card>
      <Card>
        <h2 className="text-base">Сейчас в отчёте</h2>
        <Progress className="mt-4" value={live.length} max={rows.length} />
        <div className="num mt-2 text-[13px] text-muted">
          Вышло {live.length} из {rows.length}
        </div>
        <dl className="num mt-4 grid grid-cols-3 gap-3">
          {[
            ['Охват', count(reach)],
            ['Потрачено', money(spent)],
            ['CPM', reach ? money(cpm(spent, reach)) : '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {live.some((i) => !i.fact_reach || !i.ad_url) && (
        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-base">Чего не хватает для отчёта</h2>
          <ul>
            {live
              .filter((i) => !i.fact_reach || !i.ad_url)
              .map((i) => (
                <li key={i.id}>
                  <button onClick={() => open(i.id)} className="flex min-h-11 w-full items-center gap-3 border-t border-line py-2 text-left hover:bg-soft">
                    <span className="flex-1">
                      <BloggerName b={blogger(i.blogger_id)} />
                    </span>
                    <span className="text-[13px] text-warn">{[!i.ad_url && 'нет ссылки на выход', !i.fact_reach && 'нет охвата по факту'].filter(Boolean).join(', ')}</span>
                    <StatusBadge status={i.status} />
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Money({ c, rows }: { c: Campaign; rows: Integration[] }) {
  const { budgets, reload } = useData()
  const [incomes, setIncomes] = useState<Income[]>([])
  const [budget, setBudget] = useState('')
  const [markup, setMarkup] = useState(String(c.markup_pct))
  const saved = budgets[c.id] ?? null

  useEffect(() => {
    setBudget(saved === null ? '' : String(saved))
  }, [saved])
  useEffect(() => {
    supabase.from('incomes').select('*').eq('campaign_id', c.id).order('paid_on', { ascending: false }).then(({ data }) => setIncomes((data as Income[]) ?? []))
  }, [c.id])

  const toClient = rows.reduce((a, i) => a + (i.price_client ?? 0), 0)
  const toBloggers = rows.reduce((a, i) => a + (i.price ?? 0), 0)
  const got = incomes.reduce((a, i) => a + i.amount, 0)

  async function save() {
    const b = parseNumber(budget)
    const m = parseNumber(markup) ?? 0
    const r1 = await supabase.from('campaign_money').upsert({ campaign_id: c.id, budget: b })
    const r2 = m !== c.markup_pct ? await supabase.from('campaigns').update({ markup_pct: m }).eq('id', c.id) : { error: null }
    if (r1.error || r2.error) return toast((r1.error ?? r2.error)!.message)
    await reload('campaign_money', 'campaigns', 'integrations')
    toast('Сохранено')
  }

  return (
    <div className="grid max-w-5xl gap-3 lg:grid-cols-2">
      <Card>
        <h2 className="text-base">Комиссия</h2>
        <div className="num mt-2 text-[36px] leading-10 tracking-tight">{money(toClient - toBloggers)}</div>
        <p className="mt-1 text-[13px] text-muted">Разница между ценой для клиента и ценой блогера по одобренным интеграциям</p>
        <dl className="num mt-5 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted">Клиент платит за блогеров</dt>
            <dd className="mt-0.5 text-lg">{money(toClient)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Из них блогерам</dt>
            <dd className="mt-0.5 text-lg">{money(toBloggers)}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="text-base">Получено от клиента</h2>
        <Progress className="mt-4" value={got} max={toClient - toBloggers} />
        <div className="num mt-2 text-[13px] text-muted">
          {money(got)} из {money(toClient - toBloggers)} комиссии
        </div>
        <p className="mt-2 text-[13px] text-muted">
          Блогерам клиент платит напрямую, нам приходит комиссия. Поступления вносятся в разделе{' '}
          <Link to="/finance?tab=incomes" className="text-ink underline underline-offset-4">
            Финансы
          </Link>
        </p>
        <div className="mt-4 border-t border-line pt-3">
          <Toggle
            checked={c.prepaid}
            label="Клиент внёс 100% предоплату"
            onChange={async (v) => {
              const { error } = await supabase.from('campaigns').update({ prepaid: v }).eq('id', c.id)
              if (error) toast(`Не сохранилось: ${error.message}`)
              reload('campaigns')
            }}
          />
        </div>
      </Card>
      <Card className="lg:col-span-2" onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <Field label="Бюджет клиента, ₽" hint="Виден только учредителям">
            <Input inputMode="numeric" className="num" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label="Наценка, %" hint="При изменении цены для клиента пересчитаются">
            <Input inputMode="numeric" className="num" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </Field>
          <Button variant="primary" data-save className="mb-5" onClick={save} disabled={parseNumber(budget) === saved && (parseNumber(markup) ?? 0) === c.markup_pct}>
            Сохранить
          </Button>
        </div>
      </Card>
    </div>
  )
}
