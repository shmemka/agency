import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { inWork, isActive, isLive, nextStep, type NextStep, type WorkGroup } from '../lib/rules'
import { plural } from '../lib/format'
import type { Campaign, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Empty, Filters, Input, Loading, PageHeader, Segmented, Select, Skel, cx } from '../components/ui'
import { confirmDialog } from '../components/dialogs'
import { IntegrationBoard, NO_DEAL } from '../components/IntegrationBoard'
import { CampaignModal } from '../components/CampaignForm'
import { WorkRow } from '../components/WorkRow'
import { DealPanel } from './Deal'

/*
 * «Работа» - список дел по всем блогерам во всех сделках.
 * Каждый шаг воронки говорит, чей сейчас ход (lib/rules: nextStep), и список сам раскладывается на группы:
 * что сделать нам, чего ждём от блогера, что скоро выходит и какие хвосты остались после выхода.
 * Сделка - подпись в строке и фильтр; её панель (/work/:id) открывается поверх списка
 */

const GROUPS: { id: WorkGroup; title: string; hint: string }[] = [
  { id: 'now', title: 'Сделать сейчас', hint: 'Ход за вами' },
  { id: 'wait', title: 'Ждём блогера', hint: 'Через 3 дня тишины строка поднимется в «Сделать сейчас»' },
  { id: 'soon', title: 'Скоро выход', hint: 'Оплачено, ждём публикацию' },
  { id: 'tails', title: 'Хвосты после выхода', hint: 'Вышло, но собрано не всё' },
]

const closedDeal = (c: Campaign) => c.status === 'done' || c.status === 'cancelled'

export function Work() {
  const { id } = useParams()
  const { campaigns, clients, integrations, blogger, docs, settings, loading, reload } = useData()
  const { isAdmin, profile } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<Partial<Campaign> | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const q = params.get('q') ?? ''
  const deal = params.get('deal') ?? ''
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  // панель сделки и список живут в одном адресе: фильтры при открытии и закрытии сделки не теряются
  const keep = () => {
    const p = new URLSearchParams(params)
    p.delete('i')
    p.delete('pick')
    return p.toString() ? `?${p}` : ''
  }
  const dealLink = (cid: string) => `/work/${cid}${keep()}`

  const mine = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return integrations.filter((i) => {
      if (!inWork(i)) return false
      if (deal === 'none' ? i.campaign_id : deal && i.campaign_id !== deal) return false
      if (needle) {
        const b = blogger(i.blogger_id)
        if (![b?.nick, b?.name, i.promo_code, i.erid].join(' ').toLowerCase().includes(needle)) return false
      }
      return true
    })
  }, [integrations, deal, q, blogger])

  const groups = useMemo(() => {
    const out: Record<WorkGroup, { i: Integration; step: NextStep }[]> = { now: [], wait: [], soon: [], tails: [] }
    for (const i of mine) {
      const step = nextStep(i, docs, settings)
      if (step) out[step.group].push({ i, step })
    }
    for (const k of Object.keys(out) as WorkGroup[]) out[k].sort((a, z) => a.step.sort - z.step.sort)
    return out
  }, [mine, docs, settings])
  const active = mine.filter(isActive)
  const closed = mine.filter((i) => !isActive(i))
  const orphans = integrations.filter((i) => !i.campaign_id && inWork(i)).length
  const picked = campaigns.find((c) => c.id === deal)
  // выбрана одна сделка - её название уже стоит над списком, в строках оно не повторяется
  const rowDeal = picked ? undefined : dealLink
  // по ним мы сами сдаём статистику в ОРД и ещё не сдали
  const ord = groups.tails.map((x) => x.i).filter((i) => isLive(i) && !i.ord_reported_at && i.marked_by === 'us' && i.erid)

  async function markOrd() {
    if (!(await confirmDialog({ title: 'Отметить сдачу в ОРД?', body: `Статистика по ${ord.length} ${plural(ord.length, 'интеграции', 'интеграциям', 'интеграциям')} будет отмечена как переданная`, ok: 'Отметить' }))) return
    setBusy(true)
    const { error } = await supabase.from('integrations').update({ ord_reported_at: new Date().toISOString(), ord_reported_by: profile?.id }).in('id', ord.map((r) => r.id))
    setBusy(false)
    if (error) return toast(error.message)
    await reload('integrations')
    toast('Отмечено: статистика передана')
  }

  const newDeal = isAdmin && (
    <Button variant="primary" onClick={() => setCreating({})}>
      <Plus className="size-4" strokeWidth={1.5} />
      Новая сделка
    </Button>
  )

  return (
    <>
      <PageHeader title="Работа" actions={newDeal} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1 md:min-w-52 md:max-w-xs md:flex-none md:basis-80">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" strokeWidth={1.5} />
          <Input className="rounded-full! bg-surface pl-10" type="search" enterKeyHint="search" placeholder="Ник, промокод, erid" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Поиск" />
        </div>
        <Filters active={deal ? 1 : 0} onReset={() => set('deal', '')}>
          <Select value={deal} onChange={(e) => set('deal', e.target.value)} tone="surface" className="w-64" aria-label="Сделка">
            <option value="">Все сделки</option>
            {campaigns
              .filter((c) => !closedDeal(c))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            {orphans > 0 && <option value="none">{NO_DEAL}</option>}
            {campaigns.filter(closedDeal).map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.name} (закрыта)`}
              </option>
            ))}
          </Select>
        </Filters>
        <Segmented
          className="md:ml-auto"
          value={view}
          onChange={(v) => set('view', v === 'board' ? 'board' : '')}
          options={[
            { id: 'list', label: 'Список' },
            { id: 'board', label: 'Доска' },
          ]}
        />
      </div>

      {/* выбрана сделка: кто клиент и вход в её панель - блогеры, деньги, документы */}
      {picked && (
        <div className="appear mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-5 py-4">
          <div className="min-w-0">
            <div className="text-[13px] text-muted">{clients.find((x) => x.id === picked.client_id)?.name ?? 'Клиент не указан'}</div>
            <div className="truncate text-lg">{picked.name}</div>
          </div>
          <Link to={dealLink(picked.id)} className="inline-flex h-10 shrink-0 items-center rounded-full bg-soft px-4 text-sm font-medium transition-colors duration-150 hover:bg-ink/8">
            Открыть сделку
          </Link>
        </div>
      )}
      {deal === 'none' && <p className="mb-4 rounded-card bg-surface px-5 py-4 text-[13px] text-muted">Эти интеграции заведены без сделки. Откройте карточку и выберите сделку во вкладке «Условия»: работа с блогером идёт только с клиентом</p>}

      {loading ? (
        <Loading className="space-y-5">
          {[3, 2].map((n, g) => (
            <div key={g}>
              <Skel className="mb-3 h-4 w-36" />
              <div className="rounded-card bg-surface px-5">
                {Array.from({ length: n }, (_, r) => (
                  <div key={r} className="flex h-14 items-center gap-4 border-t border-line first:border-t-0">
                    <Skel className="size-6 shrink-0" />
                    <Skel className="h-3.5 w-32" />
                    <Skel className="hidden h-3.5 w-28 md:block" />
                    <Skel className="hidden h-3.5 flex-1 md:block" />
                    <Skel className="ml-auto h-8 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Loading>
      ) : !mine.length ? (
        picked ? (
          <Empty
            title="В сделке пока нет блогеров"
            action={
              <Link to={`/work/${picked.id}?pick=1`} className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-ink/85">
                Добавить блогеров
              </Link>
            }
          >
            Добавьте тех, о ком договорились с клиентом: они появятся в списке дел
          </Empty>
        ) : q || deal ? (
          <Empty title="Ничего не нашли">Измените поиск или выберите другую сделку</Empty>
        ) : (
          <Empty title="В работе пока никого" action={newDeal}>
            Создайте сделку с клиентом и добавьте в неё блогеров. Здесь появится список: кому написать, чего ждём и что скоро выходит
          </Empty>
        )
      ) : view === 'board' ? (
        active.length ? (
          <div className="appear">
            <IntegrationBoard rows={active} showCampaign />
          </div>
        ) : (
          <Empty title="На доске пусто">Все блогеры этой выборки закрыты</Empty>
        )
      ) : (
        <div className="appear space-y-6">
          {GROUPS.map((g) => {
            const rows = groups[g.id]
            if (!rows.length) return null
            return (
              <section key={g.id} aria-label={g.title}>
                <header className="mb-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  <h2 className="text-base">
                    {g.title} <span className="num text-muted">{rows.length}</span>
                  </h2>
                  <span className="text-[13px] text-muted max-md:hidden">{g.hint}</span>
                  {g.id === 'tails' && ord.length > 0 && (
                    <Button size="sm" className="ml-auto" loading={busy} onClick={markOrd}>
                      Отметить сдачу в ОРД: {ord.length}
                    </Button>
                  )}
                </header>
                <ul className="overflow-hidden rounded-card bg-surface">
                  {rows.map(({ i, step }) => (
                    <WorkRow key={i.id} i={i} step={step} dealLink={rowDeal} />
                  ))}
                </ul>
              </section>
            )
          })}
          {!active.length && <p className="px-1 text-muted">Открытых дел нет: все блогеры этой выборки закрыты</p>}
          {closed.length > 0 && (
            <section aria-label="Закрытые">
              <button type="button" aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)} className="mb-2 flex h-8 items-center gap-1.5 px-1 text-muted transition-colors duration-150 hover:text-ink">
                Закрытые и отказы <span className="num">{closed.length}</span>
                <ChevronDown className={cx('size-4 transition-transform duration-200', showClosed && 'rotate-180')} strokeWidth={1.5} />
              </button>
              {showClosed && (
                <ul className="fade overflow-hidden rounded-card bg-surface">
                  {closed.map((i) => (
                    <WorkRow key={i.id} i={i} step={null} dealLink={rowDeal} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {id && <DealPanel key={id} id={id} onClose={() => nav(`/work${keep()}`)} />}
      <CampaignModal value={creating} onClose={() => setCreating(null)} onSaved={(cid) => nav(`/work/${cid}?pick=1`)} />
    </>
  )
}
