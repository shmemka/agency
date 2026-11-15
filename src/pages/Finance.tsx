import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Check, Download, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { date, downloadXlsx, money, parseNumber, plural, todayISO } from '../lib/format'
import type { Expense, Income } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Chip, Empty, Field, IconButton, Input, Modal, PageHeader, Segmented, Select, Skel, SkelList, SkelTable, StatusBadge, Table, Toggle, cx } from '../components/ui'
import { BloggerName, useIntegrationPanel } from '../components/bits'
import { confirmDialog } from '../components/dialogs'
import { DateInput } from '../components/DateInput'
import { bgLocation } from '../lib/settingsNav'
import { commission as commissionOf, inWork } from '../lib/rules'

type Tab = 'summary' | 'incomes' | 'payouts' | 'expenses'
type Period = 'month' | 'quarter' | 'year'

/** Границы текущего периода: [from, to). Записи с будущими датами в текущий период не попадают */
function periodRange(p: Period) {
  const d = new Date()
  const m = p === 'month' ? d.getMonth() : p === 'quarter' ? Math.floor(d.getMonth() / 3) * 3 : 0
  const len = p === 'month' ? 1 : p === 'quarter' ? 3 : 12
  const iso = (y: number, mm: number) => `${y + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}-01`
  return { from: iso(d.getFullYear(), m), to: iso(d.getFullYear(), m + len) }
}

// корзина в строке таблицы: на компьютере видна при наведении на строку, на телефоне - всегда
const TRASH = 'size-8 hover:text-bad focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

/** Название текущего периода: «Ноябрь 2026», «IV квартал 2026», «2026 год» */
function periodLabel(p: Period) {
  const d = new Date()
  const y = d.getFullYear()
  if (p === 'month') return `${MONTHS[d.getMonth()]} ${y}`
  if (p === 'quarter') return `${['I', 'II', 'III', 'IV'][Math.floor(d.getMonth() / 3)]} квартал ${y}`
  return `${y} год`
}

/**
 * Сверка периода: поступления минус налог минус расходы равно остаток.
 * На компьютере - уравнение в строку, на телефоне - столбик, как в ведомости.
 * Остаток - единственное лаймовое место раздела
 */
function Ledger({ busy, period, onPeriod, lines, result }: { busy: boolean; period: Period; onPeriod: (p: Period) => void; lines: { label: string; value: number; note: string; minus?: boolean }[]; result: number }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base">{periodLabel(period)}</h2>
        <Segmented<Period> value={period} onChange={onPeriod} options={[{ id: 'month', label: 'Месяц' }, { id: 'quarter', label: 'Квартал' }, { id: 'year', label: 'Год' }]} />
      </div>
      <div className="mt-5 lg:mt-6 lg:flex lg:items-stretch lg:gap-4">
        {lines.map((l) => (
          <div key={l.label} className="contents">
            {l.minus && (
              <span aria-hidden className="hidden w-4 shrink-0 items-center justify-center text-2xl text-faint lg:flex">
                −
              </span>
            )}
            <div className="flex items-baseline justify-between gap-3 border-b border-line py-3 first:pt-0 lg:min-w-0 lg:flex-1 lg:flex-col lg:justify-center lg:gap-1 lg:self-center lg:border-0 lg:py-0">
              <div className="min-w-0">
                <div className="text-[13px] text-muted">{l.label}</div>
                <div className="mt-0.5 text-xs text-faint lg:hidden">{l.note}</div>
              </div>
              {busy ? (
                <Skel className="h-6 w-28" />
              ) : (
                <div className="appear num shrink-0 text-lg lg:text-2xl lg:leading-8">
                  <span className="text-faint lg:hidden">{l.minus ? '− ' : ''}</span>
                  {money(l.value)}
                </div>
              )}
              <div className="hidden text-xs text-faint lg:block">{l.note}</div>
            </div>
          </div>
        ))}
        <span aria-hidden className="hidden w-4 shrink-0 items-center justify-center text-2xl text-faint lg:flex">
          =
        </span>
        <div className={cx('mt-4 rounded-inner px-5 py-4 lg:mt-0 lg:flex-[1.3]', result < 0 ? 'bg-bad/10 text-bad' : 'bg-lime text-lime-ink')}>
          <div className="text-[13px] opacity-70">Остаётся</div>
          {busy ? <Skel className="mt-1.5 h-8 w-36" /> : <div className="appear num mt-0.5 text-[28px] leading-9 lg:text-[32px] lg:leading-10">{money(result)}</div>}
          <div className="mt-0.5 text-xs opacity-70">после налога и расходов</div>
        </div>
      </div>
    </Card>
  )
}

/** Тонкая полоса: сколько из плана или лимита. Серая - обычное, жёлтая и красная - лимит близко, зелёная - получено всё */
function Meter({ value, max, tone, className }: { value: number; max: number; tone?: 'warn' | 'bad' | 'done'; className?: string }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-ink/6', className)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('grow h-full rounded-full', tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : tone === 'done' ? 'bg-leaf' : 'bg-ink/70')} style={{ width: `${p}%` }} />
    </div>
  )
}

/** «Самокат, школа» вместо «Самокат, Самокат, школа»: клиента показываем, только если его нет в названии кампании */
function ClientCampaign({ client, campaign, note }: { client?: string; campaign?: string; note: string | null }) {
  if (!client && !campaign) return <span className="text-faint">{note ?? '—'}</span>
  if (!campaign) return <>{client}</>
  const dup = client && campaign.toLowerCase().includes(client.toLowerCase())
  return (
    <>
      {campaign}
      {client && !dup && <span className="text-muted"> · {client}</span>}
    </>
  )
}

export function Finance() {
  const { settings, campaigns, clients, integrations, docs, blogger, campaign, loading } = useData()
  const { team, personName } = useAuth()
  const { open } = useIntegrationPanel()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) ?? 'summary'
  const [period, setPeriod] = useState<Period>('month')
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  // поступления и расходы грузятся отдельно от остальных данных; до этого — скелетон, а не «пока нет»
  const [ready, setReady] = useState(false)
  const busy = loading || !ready
  const [editI, setEditI] = useState<Partial<Income> | null>(null)
  const [editE, setEditE] = useState<Partial<Expense> | null>(null)
  const [onlyNoReceipt, setOnlyNoReceipt] = useState(false)
  const founders = team.filter((t) => t.role === 'admin' && t.is_active)
  const rate = (i: Income) => (i.payer_type === 'org' ? (settings?.tax_org_pct ?? 6) : (settings?.tax_person_pct ?? 4)) / 100

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from('incomes').select('*').order('paid_on', { ascending: false }), supabase.from('expenses').select('*').order('paid_on', { ascending: false })])
    setIncomes((a.data as Income[]) ?? [])
    setExpenses((b.data as Expense[]) ?? [])
    setReady(true)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const { from, to } = periodRange(period)
  const inPeriod = (day: string) => day >= from && day < to
  const inP = incomes.filter((i) => inPeriod(i.paid_on))
  const exP = expenses.filter((e) => inPeriod(e.paid_on))
  const sumIn = inP.reduce((a, i) => a + i.amount, 0)
  const tax = inP.reduce((a, i) => a + i.amount * rate(i), 0)
  const sumEx = exP.reduce((a, e) => a + e.amount, 0)
  const year = `${new Date().getFullYear()}-01-01`
  const limit = settings?.income_limit ?? 2_400_000

  const payouts = useMemo(
    () =>
      integrations
        .filter((i) => ['waiting_payment', 'paid', 'published', 'done'].includes(i.status) && inWork(i))
        .map((i) => ({ i, receipt: docs.some((d) => d.integration_id === i.id && (d.kind === 'receipt' || d.kind === 'act')) }))
        .sort((a, b) => (b.i.publish_date ?? '').localeCompare(a.i.publish_date ?? '')),
    [integrations, docs],
  )
  const payoutRows = payouts.filter((p) => !onlyNoReceipt || (p.i.status !== 'waiting_payment' && !p.receipt))

  async function del(table: 'incomes' | 'expenses', id: string) {
    if (!(await confirmDialog({ title: 'Удалить запись?', ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return toast(error.message)
    load()
  }

  const commission = campaigns
    .filter((c) => c.status !== 'cancelled')
    .map((c) => {
      const rows = integrations.filter((i) => i.campaign_id === c.id && inWork(i) && i.status !== 'declined')
      return { c, plan: commissionOf(rows), fact: incomes.filter((i) => i.campaign_id === c.id).reduce((a, i) => a + i.amount, 0) }
    })
    .filter((x) => x.plan > 0 || x.fact > 0)

  // настройки налогов переехали в «Настройки кабинета», раздел «Деньги и ОРД»
  if ((sp.get('tab') as string | null) === 'settings') return <Navigate to="/settings/money" replace state={{ bg: bgLocation('/finance') }} />

  return (
    <>
      <PageHeader
        title="Финансы"
        actions={
          <>
            {tab === 'incomes' && (
              <Button onClick={() => downloadXlsx('Поступления', incomes.map((i) => ({ Дата: i.paid_on, Сумма: i.amount, Клиент: clients.find((c) => c.id === i.client_id)?.name, Сделка: campaign(i.campaign_id)?.name, Получил: personName(i.receiver_id), Плательщик: i.payer_type === 'org' ? 'Организация или ИП' : 'Физлицо', Налог: Math.round(i.amount * rate(i)), Чек: i.has_receipt ? 'да' : 'нет', Заметка: i.note })))}>
                <Download className="size-4" strokeWidth={1.5} />
                Excel
              </Button>
            )}
            {tab === 'payouts' && (
              <Button onClick={() => downloadXlsx('Выплаты блогерам', payoutRows.map(({ i, receipt }) => ({ Выход: i.publish_date, Блогер: blogger(i.blogger_id)?.nick, Сделка: campaign(i.campaign_id)?.name, Сумма: i.price, Оплачено: i.status === 'waiting_payment' ? 'нет' : 'да', Чек: receipt ? 'да' : 'нет' })))}>
                <Download className="size-4" strokeWidth={1.5} />
                Excel
              </Button>
            )}
            {tab === 'expenses' && (
              <Button onClick={() => downloadXlsx('Расходы', expenses.map((e) => ({ Дата: e.paid_on, Сумма: e.amount, Статья: e.category, Заплатил: personName(e.paid_by), Заметка: e.note })))}>
                <Download className="size-4" strokeWidth={1.5} />
                Excel
              </Button>
            )}
            {(tab === 'incomes' || tab === 'summary') && (
              <Button variant="primary" onClick={() => setEditI({ paid_on: todayISO(), payer_type: 'org', has_receipt: false })}>
                <Plus className="size-4" strokeWidth={1.5} />
                Поступление
              </Button>
            )}
            {tab === 'expenses' && (
              <Button variant="primary" onClick={() => setEditE({ paid_on: todayISO() })}>
                <Plus className="size-4" strokeWidth={1.5} />
                Расход
              </Button>
            )}
          </>
        }
      />
      <Segmented<Tab>
        className="mb-4"
        value={tab}
        onChange={(t) => setSp({ tab: t }, { replace: true })}
        options={[
          { id: 'summary', label: 'Сводка' },
          { id: 'incomes', label: 'Поступления' },
          { id: 'payouts', label: 'Выплаты блогерам' },
          { id: 'expenses', label: 'Расходы' },
        ]}
      />

      {tab === 'summary' && (
        <div className="grid gap-3">
          <Ledger
            busy={busy}
            period={period}
            onPeriod={setPeriod}
            lines={[
              { label: 'Поступления', value: sumIn, note: `${inP.length} ${plural(inP.length, 'платёж', 'платежа', 'платежей')}` },
              { label: 'Налог к уплате', value: tax, note: 'по ставкам поступлений', minus: true },
              { label: 'Расходы', value: sumEx, note: `${exP.length} ${plural(exP.length, 'запись', 'записи', 'записей')}`, minus: true },
            ]}
            result={sumIn - tax - sumEx}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="text-base">Доход учредителей за {new Date().getFullYear()} год</h2>
              <p className="mt-1 text-[13px] text-muted">Лимит самозанятого - {money(limit)} в год. Сверх него доход облагается НДФЛ</p>
              <ul className="mt-5 space-y-5">
                {busy && <SkelList rows={2} />}
                {!busy &&
                  founders.map((f) => {
                    const mine = incomes.filter((i) => i.receiver_id === f.id && i.paid_on >= year)
                    const got = mine.reduce((a, i) => a + i.amount, 0)
                    const share = got / limit
                    const mTax = mine.filter((i) => inPeriod(i.paid_on)).reduce((a, i) => a + i.amount * rate(i), 0)
                    const tone = share >= 0.95 ? 'bad' : share >= 0.8 ? 'warn' : undefined
                    return (
                      <li key={f.id}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm">{f.full_name || f.email}</span>
                          <span className="num text-[13px]">
                            {money(got)} <span className="text-muted">· {Math.round(share * 100)} % лимита</span>
                          </span>
                        </div>
                        <Meter value={got} max={limit} tone={tone} className="mt-2" />
                        <div className="num mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
                          <span>Налог за период {money(mTax)}</span>
                          {tone === 'bad' ? <span className="text-bad">Лимит почти исчерпан, пора переходить на ИП</span> : tone === 'warn' ? <span className="text-warn">Больше 80 % лимита, планируйте переход на ИП</span> : null}
                        </div>
                      </li>
                    )
                  })}
              </ul>
            </Card>
            <Card>
              <h2 className="text-base">Комиссия по сделкам</h2>
              <p className="mt-1 text-[13px] text-muted">Наценка по одобренным интеграциям и сколько из неё уже получено</p>
              {busy ? (
                <SkelList rows={2} className="mt-3" />
              ) : commission.length === 0 ? (
                <p className="mt-4 text-[13px] text-muted">Появится, когда клиент одобрит первых блогеров в подборке</p>
              ) : (
                <ul className="mt-3">
                  {commission.map(({ c, plan, fact }) => (
                    <li key={c.id} className="border-t border-line py-3 first:border-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0 text-sm">{c.name}</span>
                        <span className="num text-[13px]">
                          {money(fact)} <span className="text-muted">из {money(plan)}</span>
                        </span>
                      </div>
                      <Meter value={fact} max={plan} tone={plan > 0 && fact >= plan ? 'done' : undefined} className="mt-2" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'incomes' &&
        (busy ? (
          <SkelTable rows={6} cols={[1, 1, 2, 1.4, 1, 1]} />
        ) : incomes.length === 0 ? (
          <Empty title="Поступлений пока нет">Вносите сюда комиссию и предоплаты клиентов. По ним считается налог и лимит самозанятого</Empty>
        ) : (
          <Table
            min={860}
            head={
              <tr>
                <th>Дата</th>
                <th className="text-right">Сумма</th>
                <th>Клиент и сделка</th>
                <th>Получил</th>
                <th>Плательщик</th>
                <th className="text-right">Налог</th>
                <th>Чек</th>
                <th />
              </tr>
            }
          >
            {incomes.map((i) => (
              <tr key={i.id} onClick={() => setEditI(i)} className="group cursor-pointer hover:bg-soft">
                <td className="num">{date(i.paid_on)}</td>
                <td className="num text-right font-medium">{money(i.amount)}</td>
                <td className="max-w-64 truncate">
                  <ClientCampaign client={clients.find((c) => c.id === i.client_id)?.name} campaign={campaign(i.campaign_id)?.name} note={i.note} />
                </td>
                <td>{personName(i.receiver_id).split(' ')[0]}</td>
                <td className="text-muted">{i.payer_type === 'org' ? 'Организация' : 'Физлицо'}</td>
                <td className="num text-right text-muted">{money(i.amount * rate(i))}</td>
                <td>{i.has_receipt ? <Check className="size-4 text-muted" strokeWidth={1.5} aria-label="Чек есть" /> : <Chip tone="warn">нет чека</Chip>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Удалить" className={TRASH} onClick={() => del('incomes', i.id)}>
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'payouts' && (
        <>
          <div className="mb-3">
            <Toggle checked={onlyNoReceipt} onChange={setOnlyNoReceipt} label={`Оплачено, но нет чека: ${payouts.filter((p) => p.i.status !== 'waiting_payment' && !p.receipt).length}`} />
          </div>
          {loading ? (
            <SkelTable rows={6} cols={[2, 1, 1.4, 1, 1, 1]} />
          ) : payoutRows.length === 0 ? (
            <Empty title={onlyNoReceipt ? 'По всем оплатам чеки на месте' : 'Выплат пока нет'}>Список собирается сам из интеграций на этапе «На оплате» и дальше</Empty>
          ) : (
            <Table
              min={720}
              head={
                <tr>
                  <th>Выход</th>
                  <th>Блогер</th>
                  <th>Сделка</th>
                  <th className="text-right">Сумма</th>
                  <th>Этап</th>
                  <th>Чек или акт</th>
                </tr>
              }
            >
              {payoutRows.slice(0, 300).map(({ i, receipt }) => (
                <tr key={i.id} onClick={() => open(i.id)} className="cursor-pointer hover:bg-soft">
                  <td className="num">{date(i.publish_date)}</td>
                  <td className="max-w-52">
                    <BloggerName b={blogger(i.blogger_id)} />
                  </td>
                  <td className="max-w-48 truncate text-muted">{campaign(i.campaign_id)?.name ?? '—'}</td>
                  <td className="num text-right font-medium">{money(i.price)}</td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                  <td>{receipt ? <Check className="size-4 text-muted" strokeWidth={1.5} aria-label="Чек есть" /> : i.status === 'waiting_payment' ? <span className="text-faint">после оплаты</span> : <Chip tone="warn">нет чека</Chip>}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {tab === 'expenses' &&
        (busy ? (
          <SkelTable rows={6} cols={[1, 1, 1.4, 1.2, 2]} />
        ) : expenses.length === 0 ? (
          <Empty title="Расходов пока нет">Банк, сервисы, реклама агентства</Empty>
        ) : (
          <Table
            min={560}
            head={
              <tr>
                <th>Дата</th>
                <th className="text-right">Сумма</th>
                <th>Статья</th>
                <th>Заплатил</th>
                <th>Заметка</th>
                <th />
              </tr>
            }
          >
            {expenses.map((e) => (
              <tr key={e.id} onClick={() => setEditE(e)} className="group cursor-pointer hover:bg-soft">
                <td className="num">{date(e.paid_on)}</td>
                <td className="num text-right font-medium">{money(e.amount)}</td>
                <td>{e.category ?? '—'}</td>
                <td>{personName(e.paid_by).split(' ')[0]}</td>
                <td className="max-w-64 truncate text-muted">{e.note}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <IconButton label="Удалить" className={TRASH} onClick={() => del('expenses', e.id)}>
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </Table>
        ))}


      <IncomeModal value={editI} onClose={() => setEditI(null)} onSaved={load} founders={founders} />
      <ExpenseModal value={editE} onClose={() => setEditE(null)} onSaved={load} founders={founders} />
    </>
  )
}

function IncomeModal({ value, onClose, onSaved, founders }: { value: Partial<Income> | null; onClose: () => void; onSaved: () => void; founders: { id: string; full_name: string | null; email: string | null }[] }) {
  const { clients, campaigns } = useData()
  const { profile } = useAuth()
  const [d, setD] = useState<Partial<Income>>({})
  useEffect(() => {
    if (value) setD({ receiver_id: profile?.id, ...value })
  }, [value, profile?.id])
  const set = <K extends keyof Income>(k: K, v: Income[K] | null) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.amount || d.amount <= 0) return toast('Укажите сумму')
    const payload = { paid_on: d.paid_on, amount: d.amount, client_id: d.client_id ?? null, campaign_id: d.campaign_id ?? null, receiver_id: d.receiver_id ?? null, payer_type: d.payer_type, has_receipt: d.has_receipt ?? false, receipt_url: d.receipt_url || null, note: d.note || null }
    const res = d.id ? await supabase.from('incomes').update(payload).eq('id', d.id) : await supabase.from('incomes').insert(payload)
    if (res.error) return toast(res.error.message)
    toast('Поступление сохранено')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={d.id ? 'Поступление' : 'Новое поступление'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save}>
            Сохранить поступление
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сумма, ₽">
          <Input inputMode="numeric" className="num" value={d.amount ?? ''} onChange={(e) => set('amount', parseNumber(e.target.value))} />
        </Field>
        <Field label="Дата">
          <DateInput clearable={false} value={d.paid_on} onChange={(v) => v && set('paid_on', v)} aria-label="Дата" />
        </Field>
        <Field label="Сделка">
          <Select
            value={d.campaign_id ?? ''}
            onChange={(e) => {
              const c = campaigns.find((x) => x.id === e.target.value)
              setD((x) => ({ ...x, campaign_id: e.target.value || null, client_id: c?.client_id ?? x.client_id }))
            }}
          >
            <option value="">Без сделки</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Клиент">
          <Select value={d.client_id ?? ''} onChange={(e) => set('client_id', e.target.value || null)}>
            <option value="">Не указан</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Кто получил" hint="Чей доход как самозанятого">
          <Select value={d.receiver_id ?? ''} onChange={(e) => set('receiver_id', e.target.value || null)}>
            {founders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name || f.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Плательщик" hint="От него зависит ставка налога">
          <Select value={d.payer_type ?? 'org'} onChange={(e) => set('payer_type', e.target.value as Income['payer_type'])}>
            <option value="org">Организация или ИП</option>
            <option value="person">Физлицо</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={Boolean(d.has_receipt)} onChange={(v) => set('has_receipt', v)} label="Чек в «Мой налог» выдан" />
        </div>
        <Field label="Ссылка на чек">
          <Input value={d.receipt_url ?? ''} onChange={(e) => set('receipt_url', e.target.value)} placeholder="https://lknpd.nalog.ru/…" />
        </Field>
        <Field label="Заметка">
          <Input value={d.note ?? ''} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ExpenseModal({ value, onClose, onSaved, founders }: { value: Partial<Expense> | null; onClose: () => void; onSaved: () => void; founders: { id: string; full_name: string | null; email: string | null }[] }) {
  const { profile } = useAuth()
  const [d, setD] = useState<Partial<Expense>>({})
  useEffect(() => {
    if (value) setD({ paid_by: profile?.id, ...value })
  }, [value, profile?.id])

  async function save() {
    if (!d.amount || d.amount <= 0) return toast('Укажите сумму')
    const payload = { paid_on: d.paid_on, amount: d.amount, category: d.category || null, paid_by: d.paid_by ?? null, note: d.note || null }
    const res = d.id ? await supabase.from('expenses').update(payload).eq('id', d.id) : await supabase.from('expenses').insert(payload)
    if (res.error) return toast(res.error.message)
    toast('Расход сохранён')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={d.id ? 'Расход' : 'Новый расход'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save}>
            Сохранить расход
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сумма, ₽">
          <Input inputMode="numeric" className="num" value={d.amount ?? ''} onChange={(e) => setD({ ...d, amount: parseNumber(e.target.value) ?? undefined })} />
        </Field>
        <Field label="Дата">
          <DateInput clearable={false} value={d.paid_on} onChange={(v) => v && setD({ ...d, paid_on: v })} aria-label="Дата" />
        </Field>
        <Field label="Статья">
          <Input value={d.category ?? ''} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Банк, сервисы, реклама" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['Банк', 'Сервисы', 'Реклама', 'Домен и хостинг', 'Прочее'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setD({ ...d, category: c })}
                className={cx('h-7 rounded-full px-3 text-xs transition-colors duration-150', d.category === c ? 'bg-ink text-white' : 'bg-soft text-muted hover:text-ink')}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Кто заплатил">
          <Select value={d.paid_by ?? ''} onChange={(e) => setD({ ...d, paid_by: e.target.value || null })}>
            {founders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name || f.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Заметка" className="sm:col-span-2">
          <Input value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}
