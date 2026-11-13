import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Check, Download, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { date, downloadXlsx, money, parseNumber, plural, todayISO } from '../lib/format'
import type { Expense, Income } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Chip, Empty, Field, IconButton, Input, Modal, PageHeader, Progress, Segmented, Select, StatusBadge, Table, Toggle, cx } from '../components/ui'
import { BloggerName, useIntegrationPanel } from '../components/bits'
import { confirmDialog } from '../components/dialogs'
import { DateInput } from '../components/DateInput'

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

export function Finance() {
  const { settings, campaigns, clients, integrations, docs, blogger, campaign } = useData()
  const { team, personName } = useAuth()
  const { open } = useIntegrationPanel()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) ?? 'summary'
  const [period, setPeriod] = useState<Period>('month')
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [editI, setEditI] = useState<Partial<Income> | null>(null)
  const [editE, setEditE] = useState<Partial<Expense> | null>(null)
  const [onlyNoReceipt, setOnlyNoReceipt] = useState(false)
  const founders = team.filter((t) => t.role === 'admin' && t.is_active)
  const rate = (i: Income) => (i.payer_type === 'org' ? (settings?.tax_org_pct ?? 6) : (settings?.tax_person_pct ?? 4)) / 100

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from('incomes').select('*').order('paid_on', { ascending: false }), supabase.from('expenses').select('*').order('paid_on', { ascending: false })])
    setIncomes((a.data as Income[]) ?? [])
    setExpenses((b.data as Expense[]) ?? [])
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
        .filter((i) => ['waiting_payment', 'paid', 'published', 'done'].includes(i.status) && (!i.campaign_id || i.client_decision === 'approved'))
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
      const rows = integrations.filter((i) => i.campaign_id === c.id && i.client_decision === 'approved' && i.status !== 'declined')
      return { c, plan: rows.reduce((a, i) => a + Math.max(0, (i.price_client ?? i.price ?? 0) - (i.price ?? 0)), 0), fact: incomes.filter((i) => i.campaign_id === c.id).reduce((a, i) => a + i.amount, 0) }
    })
    .filter((x) => x.plan > 0 || x.fact > 0)

  // настройки переехали на отдельную страницу
  if ((sp.get('tab') as string | null) === 'settings') return <Navigate to="/settings" replace />

  return (
    <>
      <PageHeader
        title="Финансы"
        sub="Раздел видят только учредители"
        actions={
          <>
            {tab === 'incomes' && (
              <Button onClick={() => downloadXlsx('Поступления', incomes.map((i) => ({ Дата: i.paid_on, Сумма: i.amount, Клиент: clients.find((c) => c.id === i.client_id)?.name, Кампания: campaign(i.campaign_id)?.name, Получил: personName(i.receiver_id), Плательщик: i.payer_type === 'org' ? 'Организация или ИП' : 'Физлицо', Налог: Math.round(i.amount * rate(i)), Чек: i.has_receipt ? 'да' : 'нет', Заметка: i.note })))}>
                <Download className="size-4" strokeWidth={1.5} />
                Excel
              </Button>
            )}
            {tab === 'payouts' && (
              <Button onClick={() => downloadXlsx('Выплаты блогерам', payoutRows.map(({ i, receipt }) => ({ Выход: i.publish_date, Блогер: blogger(i.blogger_id)?.nick, Кампания: campaign(i.campaign_id)?.name, Сумма: i.price, Оплачено: i.status === 'waiting_payment' ? 'нет' : 'да', Чек: receipt ? 'да' : 'нет' })))}>
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
        <>
          <Segmented<Period> className="mb-3" value={period} onChange={setPeriod} options={[{ id: 'month', label: 'Месяц' }, { id: 'quarter', label: 'Квартал' }, { id: 'year', label: 'Год' }]} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Поступления', money(sumIn), `${inP.length} ${plural(inP.length, 'платёж', 'платежа', 'платежей')}`],
              ['Налог к уплате', money(tax), 'по ставке каждого поступления'],
              ['Расходы', money(sumEx), `${exP.length} ${plural(exP.length, 'запись', 'записи', 'записей')}`],
              ['Остаётся', money(sumIn - tax - sumEx), 'после налога и расходов'],
            ].map(([k, v, n]) => (
              <Card key={k}>
                <div className="text-[13px] text-muted">{k}</div>
                <div className="num mt-1 text-[28px] leading-8">{v}</div>
                <div className="mt-1 text-xs text-muted">{n}</div>
              </Card>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="text-base">Доход учредителей за {new Date().getFullYear()} год</h2>
              <p className="mt-1 text-[13px] text-muted">Лимит самозанятого: {money(limit)} в год. За его пределами доход облагается уже НДФЛ</p>
              <ul className="mt-4 space-y-5">
                {founders.map((f) => {
                  const mine = incomes.filter((i) => i.receiver_id === f.id && i.paid_on >= year)
                  const got = mine.reduce((a, i) => a + i.amount, 0)
                  const share = got / limit
                  const mTax = mine.filter((i) => inPeriod(i.paid_on)).reduce((a, i) => a + i.amount * rate(i), 0)
                  return (
                    <li key={f.id}>
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span>{f.full_name || f.email}</span>
                        <span className="num text-[13px] text-muted">
                          {money(got)}, {Math.round(share * 100)}% лимита
                        </span>
                      </div>
                      <Progress value={got} max={limit} over={share >= 0.95} />
                      <div className="num mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
                        <span>налог за период: {money(mTax)}</span>
                        {share >= 0.95 ? <span className="text-bad">Лимит почти исчерпан, пора переходить на ИП</span> : share >= 0.8 ? <span className="text-warn">Больше 80% лимита, планируйте переход на ИП</span> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
            <Card>
              <h2 className="text-base">Комиссия по кампаниям</h2>
              {commission.length === 0 ? (
                <p className="mt-3 text-muted">Появится, когда клиент одобрит первых блогеров в подборке</p>
              ) : (
                <ul className="mt-2">
                  {commission.map(({ c, plan, fact }) => (
                    <li key={c.id} className="border-t border-line py-3 first:border-0">
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="num shrink-0 text-[13px] text-muted">
                          получено {money(fact)} из {money(plan)}
                        </span>
                      </div>
                      <Progress value={fact} max={plan} className="h-2" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'incomes' &&
        (incomes.length === 0 ? (
          <Empty title="Поступлений пока нет">Вносите сюда комиссию и предоплаты клиентов. По ним считается налог и лимит самозанятого</Empty>
        ) : (
          <Table
            min={860}
            head={
              <tr>
                <th>Дата</th>
                <th className="text-right">Сумма</th>
                <th>Клиент и кампания</th>
                <th>Получил</th>
                <th>Плательщик</th>
                <th className="text-right">Налог</th>
                <th>Чек</th>
                <th />
              </tr>
            }
          >
            {incomes.map((i) => (
              <tr key={i.id} onClick={() => setEditI(i)} className="cursor-pointer hover:bg-soft">
                <td className="num">{date(i.paid_on)}</td>
                <td className="num text-right font-medium">{money(i.amount)}</td>
                <td className="max-w-64 truncate">{[clients.find((c) => c.id === i.client_id)?.name, campaign(i.campaign_id)?.name].filter(Boolean).join(', ') || <span className="text-faint">{i.note ?? '—'}</span>}</td>
                <td>{personName(i.receiver_id).split(' ')[0]}</td>
                <td className="text-muted">{i.payer_type === 'org' ? 'Организация' : 'Физлицо'}</td>
                <td className="num text-right text-muted">{money(i.amount * rate(i))}</td>
                <td>{i.has_receipt ? <Check className="size-4" strokeWidth={1.5} /> : <span className="text-warn">нет чека</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Удалить" className="size-8 hover:text-bad" onClick={() => del('incomes', i.id)}>
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
          {payoutRows.length === 0 ? (
            <Empty title={onlyNoReceipt ? 'По всем оплатам чеки на месте' : 'Выплат пока нет'}>Список собирается сам из интеграций на этапе «На оплате» и дальше</Empty>
          ) : (
            <Table
              min={720}
              head={
                <tr>
                  <th>Выход</th>
                  <th>Блогер</th>
                  <th>Кампания</th>
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
                  <td>{receipt ? <Chip dot="bg-leaf">есть</Chip> : i.status === 'waiting_payment' ? <span className="text-faint">после оплаты</span> : <Chip tone="warn">нет чека</Chip>}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {tab === 'expenses' &&
        (expenses.length === 0 ? (
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
              <tr key={e.id} onClick={() => setEditE(e)} className="cursor-pointer hover:bg-soft">
                <td className="num">{date(e.paid_on)}</td>
                <td className="num text-right font-medium">{money(e.amount)}</td>
                <td>{e.category ?? '—'}</td>
                <td>{personName(e.paid_by).split(' ')[0]}</td>
                <td className="max-w-64 truncate text-muted">{e.note}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <IconButton label="Удалить" className="size-8 hover:text-bad" onClick={() => del('expenses', e.id)}>
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
        <Field label="Кампания">
          <Select
            value={d.campaign_id ?? ''}
            onChange={(e) => {
              const c = campaigns.find((x) => x.id === e.target.value)
              setD((x) => ({ ...x, campaign_id: e.target.value || null, client_id: c?.client_id ?? x.client_id }))
            }}
          >
            <option value="">Без кампании</option>
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
