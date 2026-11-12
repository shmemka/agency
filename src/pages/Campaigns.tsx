import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Pencil, Plus } from 'lucide-react'
import { fetchAll, supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { CAMPAIGN_STATUSES } from '../lib/constants'
import { date, money, parseNumber } from '../lib/format'
import type { Campaign, Client, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Empty, Field, Input, Modal, PageHeader, Select, Textarea, Toggle, cx } from '../components/ui'
import { DocumentsPanel } from '../components/DocumentsPanel'

export function Campaigns() {
  const { campaigns, clients, reloadCampaigns, pulse } = useData()
  const { personName } = useAuth()
  const [ints, setInts] = useState<Integration[]>([])
  const [editCampaign, setEditCampaign] = useState<Partial<Campaign> | null>(null)
  const [editClient, setEditClient] = useState<Partial<Client> | null>(null)
  const [docsFor, setDocsFor] = useState<Campaign | null>(null)

  useEffect(() => {
    fetchAll<Integration>((f, t) => supabase.from('integrations').select('id,campaign_id,price,status,fact_reach').range(f, t) as unknown as PromiseLike<{ data: Integration[] | null; error: { message: string } | null }>).then(setInts).catch(() => setInts([]))
  }, [pulse])

  const stats = useMemo(() => {
    const m: Record<string, { n: number; spent: number; live: number }> = {}
    for (const i of ints) {
      if (!i.campaign_id) continue
      const s = (m[i.campaign_id] ??= { n: 0, spent: 0, live: 0 })
      s.n++
      if (!['declined', 'blacklist'].includes(i.status)) s.spent += i.price ?? 0
      if (['published', 'done'].includes(i.status)) s.live++
    }
    return m
  }, [ints])

  return (
    <>
      <PageHeader
        title="Клиенты и кампании"
        sub="Бюджет клиента, наша комиссия и предоплата"
        actions={
          <>
            <Button onClick={() => setEditClient({})}>
              <Building2 className="size-4" />
              Новый клиент
            </Button>
            <Button variant="primary" onClick={() => setEditCampaign({ status: 'planning', commission_pct: 20, prepaid: false })}>
              <Plus className="size-4" />
              Новая кампания
            </Button>
          </>
        }
      />

      {campaigns.length === 0 ? (
        <Empty title="Кампаний пока нет">Кампания — это заказ клиента: бюджет, сроки и блогеры, которые выходят по нему.</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {campaigns.map((c) => {
            const st = CAMPAIGN_STATUSES.find((s) => s.id === c.status)!
            const s = stats[c.id] ?? { n: 0, spent: 0, live: 0 }
            const client = clients.find((x) => x.id === c.client_id)
            const fee = ((c.budget ?? 0) * (c.commission_pct ?? 0)) / 100
            const used = c.budget ? Math.min(100, (s.spent / c.budget) * 100) : 0
            return (
              <article key={c.id} className="rounded-2xl bg-surface p-5 ring-1 ring-line">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">{client?.name ?? 'Клиент не указан'}</div>
                    <h2 className="mt-0.5 truncate font-semibold">{c.name}</h2>
                  </div>
                  <span className={cx('inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ring-1 ring-inset', st.chip)}>{st.label}</span>
                  <button onClick={() => setEditCampaign(c)} className="rounded-md p-1.5 text-faint hover:bg-base hover:text-ink" aria-label="Изменить кампанию">
                    <Pencil className="size-4" />
                  </button>
                </div>
                <dl className="num mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Бюджет</dt>
                    <dd className="font-medium">{money(c.budget)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Комиссия {c.commission_pct ?? 0}%</dt>
                    <dd className="font-medium">{c.budget ? money(fee) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Предоплата</dt>
                    <dd className={cx('font-medium', !c.prepaid && 'text-amber-700')}>{c.prepaid ? 'Получена' : 'Не получена'}</dd>
                  </div>
                </dl>
                {c.budget ? (
                  <div className="mt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-base">
                      <div className={cx('h-full rounded-full', s.spent > c.budget ? 'bg-rose-500' : 'bg-night')} style={{ width: `${used}%` }} />
                    </div>
                    <div className="num mt-1.5 text-xs text-muted">
                      На блогеров {money(s.spent)} из {money(c.budget)}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                  <Link to={`/integrations?campaign=${c.id}`} className="font-medium text-ink hover:text-accent">
                    Интеграций: {s.n}, вышло {s.live}
                  </Link>
                  <button onClick={() => setDocsFor(c)} className="hover:text-accent">
                    Документы
                  </button>
                  <span>
                    {date(c.start_date)} — {date(c.end_date)}
                  </span>
                  {c.owner_id && <span>{personName(c.owner_id)}</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {clients.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-medium">Клиенты</h2>
          <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-base/60 text-xs text-muted">
                <tr>
                  {['Компания', 'Контактное лицо', 'Контакт', 'ИНН', 'Ниша', 'Кампаний'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clients.map((cl) => (
                  <tr key={cl.id} onClick={() => setEditClient(cl)} className="cursor-pointer hover:bg-base/70">
                    <td className="px-3 py-2.5 font-medium">{cl.name}</td>
                    <td className="px-3 py-2.5">{cl.contact_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-muted">{cl.contact ?? '—'}</td>
                    <td className="num px-3 py-2.5 text-muted">{cl.inn ?? '—'}</td>
                    <td className="px-3 py-2.5 text-muted">{cl.niche ?? '—'}</td>
                    <td className="num px-3 py-2.5">{campaigns.filter((c) => c.client_id === cl.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <CampaignModal value={editCampaign} onClose={() => setEditCampaign(null)} onSaved={reloadCampaigns} />
      <ClientModal value={editClient} onClose={() => setEditClient(null)} onSaved={reloadCampaigns} />
      <Modal open={!!docsFor} onClose={() => setDocsFor(null)} wide title={`Документы: ${docsFor?.name ?? ''}`}>
        {docsFor && <DocumentsPanel campaignId={docsFor.id} />}
      </Modal>
    </>
  )
}

function CampaignModal({ value, onClose, onSaved }: { value: Partial<Campaign> | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { clients } = useData()
  const { team } = useAuth()
  const [d, setD] = useState<Partial<Campaign>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (value) setD(value)
  }, [value])
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K] | null) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.name?.trim()) return toast('Назовите кампанию')
    setBusy(true)
    const payload = { ...d, name: d.name.trim() }
    delete payload.id
    delete payload.created_at
    delete (payload as Record<string, unknown>).updated_at
    const res = d.id ? await supabase.from('campaigns').update(payload).eq('id', d.id) : await supabase.from('campaigns').insert(payload)
    setBusy(false)
    if (res.error) return toast(res.error.message)
    await onSaved()
    toast(d.id ? 'Кампания сохранена' : 'Кампания создана')
    onClose()
  }

  async function remove() {
    if (!d.id || !confirm('Удалить кампанию? Интеграции останутся, но без кампании.')) return
    const { error } = await supabase.from('campaigns').delete().eq('id', d.id)
    if (error) return toast(error.message)
    await onSaved()
    onClose()
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={d.id ? 'Кампания' : 'Новая кампания'}
      footer={
        <>
          {d.id && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {d.id ? 'Сохранить' : 'Создать кампанию'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" className="sm:col-span-2">
          <Input value={d.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Онлайн-школа, запуск курса ЕГЭ" />
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
        <Field label="Статус">
          <Select value={d.status ?? 'planning'} onChange={(e) => set('status', e.target.value as Campaign['status'])}>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Бюджет клиента на блогеров, ₽">
          <Input inputMode="numeric" className="num" value={d.budget ?? ''} onChange={(e) => set('budget', parseNumber(e.target.value))} />
        </Field>
        <Field label="Наша комиссия, %" hint="Обычно 15–25%">
          <Input inputMode="numeric" className="num" value={d.commission_pct ?? ''} onChange={(e) => set('commission_pct', parseNumber(e.target.value))} />
        </Field>
        <Field label="Начало">
          <Input type="date" value={d.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        </Field>
        <Field label="Конец">
          <Input type="date" value={d.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
        </Field>
        <Field label="Ответственный">
          <Select value={d.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)}>
            <option value="">Не назначен</option>
            {team
              .filter((t) => t.is_active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email}
                </option>
              ))}
          </Select>
        </Field>
        <div className="flex items-center pt-5">
          <Toggle checked={Boolean(d.prepaid)} onChange={(v) => set('prepaid', v)} label="Предоплата 100% получена" />
        </div>
        <Field label="Бриф" className="sm:col-span-2">
          <Textarea rows={4} value={d.brief ?? ''} onChange={(e) => set('brief', e.target.value)} placeholder="Продукт, аудитория, ключевые сообщения, ограничения" />
        </Field>
      </div>
    </Modal>
  )
}

function ClientModal({ value, onClose, onSaved }: { value: Partial<Client> | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [d, setD] = useState<Partial<Client>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (value) setD(value)
  }, [value])
  const set = <K extends keyof Client>(k: K, v: string) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.name?.trim()) return toast('Укажите название компании')
    setBusy(true)
    const payload = { ...d }
    delete payload.id
    delete payload.created_at
    const res = d.id ? await supabase.from('clients').update(payload).eq('id', d.id) : await supabase.from('clients').insert(payload)
    setBusy(false)
    if (res.error) return toast(res.error.message)
    await onSaved()
    toast(d.id ? 'Клиент сохранён' : 'Клиент добавлен')
    onClose()
  }

  async function remove() {
    if (!d.id || !confirm('Удалить клиента? Его кампании останутся без клиента.')) return
    const { error } = await supabase.from('clients').delete().eq('id', d.id)
    if (error) return toast(error.message)
    await onSaved()
    onClose()
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={d.id ? 'Клиент' : 'Новый клиент'}
      footer={
        <>
          {d.id && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {d.id ? 'Сохранить' : 'Добавить клиента'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Компания или бренд" className="sm:col-span-2">
          <Input value={d.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Контактное лицо">
          <Input value={d.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="Телефон, почта или Telegram">
          <Input value={d.contact ?? ''} onChange={(e) => set('contact', e.target.value)} />
        </Field>
        <Field label="ИНН">
          <Input value={d.inn ?? ''} onChange={(e) => set('inn', e.target.value)} />
        </Field>
        <Field label="Ниша">
          <Input value={d.niche ?? ''} onChange={(e) => set('niche', e.target.value)} placeholder="образование, кафе, e-com" />
        </Field>
        <Field label="Заметки" className="sm:col-span-2">
          <Textarea rows={3} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
