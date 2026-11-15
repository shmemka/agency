import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { AGE_GROUPS, PLATFORMS } from '../lib/constants'
import { addToCampaign, removeStoredFiles } from '../lib/actions'
import { commission, inWork, isActive, nextStep } from '../lib/rules'
import { count, dateRange, money, parseNumber, plural } from '../lib/format'
import type { Blogger, Campaign, Client, Income, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Chip, Drawer, DrawerClose, Empty, Field, IconButton, Input, Modal, Progress, Select, SkelDrawer, Toggle, cx, submitOnEnter } from '../components/ui'
import { AudienceBar, BloggerName } from '../components/bits'
import { CampaignModal, ClientModal } from '../components/CampaignForm'
import { DocumentsPanel } from '../components/DocumentsPanel'
import { confirmDialog } from '../components/dialogs'
import { WorkRow } from '../components/WorkRow'

/**
 * Панель сделки поверх «Работы»: клиент, блогеры с их шагами, деньги и документы - всё одним столбцом, без вкладок.
 * Сделка открыта, пока её не закрыли: статус считает база по блогерам, вручную - только «Закрыть» и «Открыть снова»
 */
export function DealPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { campaign, clients, integrations, tasks, docs, settings, loading, reload } = useData()
  const { isAdmin, personName, profile } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null)
  const [editClient, setEditClient] = useState<Partial<Client> | null>(null)
  // новая сделка открывается сразу с выбором блогеров
  const [picking, setPicking] = useState(() => sp.get('pick') === '1')
  useEffect(() => {
    if (!sp.has('pick')) return
    const p = new URLSearchParams(sp)
    p.delete('pick')
    setSp(p, { replace: true })
  }, [sp, setSp])
  const c = campaign(id)
  const all = useMemo(() => integrations.filter((i) => i.campaign_id === id), [integrations, id])
  const rows = all.filter(inWork)
  const active = rows.filter(isActive)
  const rest = rows.filter((i) => !isActive(i))

  if (!c)
    return (
      <Drawer onClose={onClose} label="Сделка">
        {loading ? (
          <SkelDrawer />
        ) : (
          <div className="p-4">
            <Empty title="Сделка не найдена">Возможно, её удалили или у вас нет к ней доступа</Empty>
          </div>
        )}
      </Drawer>
    )
  const canEdit = isAdmin || c.owner_id === profile?.id
  const closed = c.status === 'done' || c.status === 'cancelled'
  const client = clients.find((x) => x.id === c.client_id)

  async function setClosed(v: boolean) {
    if (v && active.length && !(await confirmDialog({ title: `Закрыть сделку «${c!.name}»?`, body: `В работе ещё ${active.length} ${plural(active.length, 'блогер', 'блогера', 'блогеров')}. Они останутся в списке дел, а сделка уйдёт в закрытые`, ok: 'Закрыть сделку' }))) return
    const { error } = await supabase.from('campaigns').update({ status: v ? 'done' : 'planning' }).eq('id', c!.id)
    if (error) return toast(error.message)
    await reload('campaigns')
    toast(v ? 'Сделка закрыта' : 'Сделка снова открыта')
  }

  async function remove() {
    // блогер без сделки - это работа без клиента, а её не бывает: сначала убирают блогеров, потом сделку
    if (all.length) return toast(`В сделке ${all.length} ${plural(all.length, 'блогер', 'блогера', 'блогеров')}: закройте её, а не удаляйте`)
    const docCount = docs.filter((d) => d.campaign_id === c!.id).length
    const taskCount = tasks.filter((t) => t.campaign_id === c!.id).length
    const items = [docCount ? `Документы сделки: ${docCount}` : '', taskCount ? `Задачи по сделке: ${taskCount}` : ''].filter(Boolean)
    if (!(await confirmDialog({ title: `Удалить сделку «${c!.name}»?`, body: items.length ? 'Удалятся навсегда' : 'В сделке нет блогеров, документов и задач', items, ok: 'Удалить', danger: true }))) return
    const fileErr = await removeStoredFiles({ campaignId: c!.id })
    if (fileErr) return toast(fileErr)
    const { error } = await supabase.from('campaigns').delete().eq('id', c!.id)
    if (error) return toast(error.message)
    await reload('campaigns', 'documents', 'tasks')
    onClose()
  }

  const add = canEdit && !closed && (
    <Button size="sm" variant="primary" onClick={() => setPicking(true)}>
      <Plus className="size-4" strokeWidth={1.5} />
      Добавить
    </Button>
  )

  return (
    <Drawer onClose={onClose} label={`Сделка ${c.name}`}>
      <div className="flex flex-col gap-3 p-3 md:p-4">
        <Card>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {/* отдельного экрана клиентов нет: клиента правят прямо из сделки */}
              {client && isAdmin ? (
                <button type="button" onClick={() => setEditClient(client)} className="text-[13px] text-muted transition-colors duration-150 hover:text-ink">
                  {client.name}
                </button>
              ) : (
                <div className="text-[13px] text-muted">{client?.name ?? 'Клиент не указан'}</div>
              )}
              <h2 className="mt-0.5 text-xl leading-7">{c.name}</h2>
            </div>
            {canEdit && (
              <IconButton label="Изменить сделку" onClick={() => setEdit(c)}>
                <Pencil className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            )}
            {isAdmin && (
              <IconButton label="Удалить сделку" onClick={remove} className="hover:text-bad">
                <Trash2 className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            )}
            <span className="hidden md:block">
              <DrawerClose />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
            <Chip tone={closed ? undefined : 'dark'}>{closed ? 'Закрыта' : 'Открыта'}</Chip>
            {(c.start_date || c.end_date) && <span className="num">{dateRange(c.start_date, c.end_date)}</span>}
            {c.owner_id && <span>ведёт {personName(c.owner_id).split(' ')[0]}</span>}
            {canEdit && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setClosed(!closed)}>
                {closed ? 'Открыть снова' : 'Закрыть сделку'}
              </Button>
            )}
          </div>
        </Card>

        <Card className="px-0! pb-2!">
          <div className="mb-2 flex items-center justify-between gap-2 px-5 sm:px-6">
            <h3 className="text-base">
              Блогеры <span className="num text-muted">{rows.length || ''}</span>
            </h3>
            {add}
          </div>
          {rows.length === 0 ? (
            <p className="px-5 pb-3 text-muted sm:px-6">Добавьте блогеров, о которых договорились с клиентом: они появятся в списке дел</p>
          ) : (
            <ul>
              {active.map((i) => (
                <WorkRow key={i.id} i={i} step={nextStep(i, docs, settings)} />
              ))}
              {rest.map((i) => (
                <WorkRow key={i.id} i={i} step={null} />
              ))}
            </ul>
          )}
        </Card>

        {isAdmin && <Money c={c} rows={rows.filter((i) => i.status !== 'declined')} />}

        <Card>
          <h3 className="mb-3 text-base">Документы</h3>
          <DocumentsPanel campaignId={c.id} />
        </Card>
      </div>
      <Picker open={picking} onClose={() => setPicking(false)} campaignId={c.id} />
      <CampaignModal value={edit} onClose={() => setEdit(null)} />
      <ClientModal value={editClient} onClose={() => setEditClient(null)} />
    </Drawer>
  )
}

/** Выбор блогеров для сделки: с клиентом уже договорились, поэтому они сразу встают в список дел */
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
  const [mine, setMine] = useState(false)

  useEffect(() => {
    if (!open) return
    setPicked(new Set())
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
        if (mine && !b.signed) return false
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
  }, [bloggers, integrations, campaignId, q, platform, female, age, maxPrice, minReach, mine])

  async function add() {
    setBusy(true)
    const { added, error } = await addToCampaign(campaignId, bloggers.filter((b) => picked.has(b.id)), integrations)
    setBusy(false)
    if (error) return toast(error)
    await reload('integrations')
    toast(`В сделку добавлено: ${added}`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Добавить блогеров"
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
          <option value="f">Женская, от 60 %</option>
          <option value="m">Мужская, от 60 %</option>
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
      <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted">
        <span className="flex items-center gap-4">
          Подходит: {list.length}
          <Toggle checked={mine} onChange={setMine} label="Только наши" />
        </span>
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

  const toClient = rows.reduce((a, i) => a + (i.price_client ?? i.price ?? 0), 0)
  const toBloggers = rows.reduce((a, i) => a + (i.price ?? 0), 0)
  const fee = commission(rows)
  const got = incomes.reduce((a, i) => a + i.amount, 0)
  const dirty = parseNumber(budget) !== saved || (parseNumber(markup) ?? 0) !== c.markup_pct

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
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <h2 className="text-base">Комиссия</h2>
        <div className={cx('num mt-2 text-[36px] leading-10 tracking-tight', fee < 0 && 'text-bad')}>{money(fee)}</div>
        <p className="mt-1 text-[13px] text-muted">Разница между ценой для клиента и ценой блогера</p>
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
        <Progress className="mt-4" value={got} max={Math.max(fee, 0)} />
        <div className="num mt-2 text-[13px] text-muted">
          {money(got)} из {money(fee)} комиссии
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
            label="Клиент внёс 100 % предоплату"
            onChange={async (v) => {
              const { error } = await supabase.from('campaigns').update({ prepaid: v }).eq('id', c.id)
              if (error) toast(`Не сохранилось: ${error.message}`)
              reload('campaigns')
            }}
          />
        </div>
      </Card>
      <Card className="sm:col-span-2" onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Бюджет клиента, ₽" hint="Виден только учредителям">
            <Input inputMode="numeric" className="num" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label="Наценка, %" hint="При изменении цены для клиента пересчитаются">
            <Input inputMode="numeric" className="num" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </Field>
          {/* «Сохранить» появляется, только когда есть что сохранять */}
          {dirty && (
            <div className="fade flex gap-2 sm:col-span-2">
              <Button variant="primary" data-save onClick={save}>
                Сохранить
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setBudget(saved === null ? '' : String(saved))
                  setMarkup(String(c.markup_pct))
                }}
              >
                Отменить
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
