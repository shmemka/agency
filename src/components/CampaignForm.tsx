import { useEffect, useState } from 'react'
import { siteUrl, supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { campaignStatusLabel } from '../lib/constants'
import type { Campaign, Client, ShareLink } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Field, Input, Modal, Select, Textarea, cx } from './ui'
import { CopyLink } from './bits'
import { confirmDialog } from './dialogs'
import { DateInput } from './DateInput'

export function CampaignModal({ value, onClose, onSaved }: { value: Partial<Campaign> | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const { clients, members, settings, reload } = useData()
  const { team } = useAuth()
  const [d, setD] = useState<Partial<Campaign>>({})
  const [crew, setCrew] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const people = team.filter((t) => t.is_active)

  useEffect(() => {
    if (!value) return
    setD(value.id ? value : { status: 'planning', markup_pct: settings?.default_markup_pct ?? 20, ...value })
    setCrew(new Set(members.filter((m) => m.campaign_id === value.id).map((m) => m.profile_id)))
  }, [value])
  // «На паузе», «Завершена» и «Отменена» автоматика не меняет, остальное база считает сама по интеграциям
  const manual = d.status === 'paused' || d.status === 'done' || d.status === 'cancelled'
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K] | null) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.name?.trim()) return toast('Назовите кампанию')
    setBusy(true)
    const payload = { name: d.name.trim(), client_id: d.client_id ?? null, status: d.status, start_date: d.start_date ?? null, end_date: d.end_date ?? null, owner_id: d.owner_id ?? null, brief: d.brief?.trim() || null, markup_pct: d.markup_pct ?? 20 }
    const res = d.id ? await supabase.from('campaigns').update(payload).eq('id', d.id).select().single() : await supabase.from('campaigns').insert(payload).select().single()
    if (res.error) {
      setBusy(false)
      return toast(res.error.message)
    }
    const id = (res.data as Campaign).id
    const before = new Set(members.filter((m) => m.campaign_id === id).map((m) => m.profile_id))
    const add = [...crew].filter((p) => !before.has(p)).map((p) => ({ campaign_id: id, profile_id: p }))
    const drop = [...before].filter((p) => !crew.has(p))
    const r1 = add.length ? await supabase.from('campaign_members').insert(add) : { error: null }
    const r2 = drop.length ? await supabase.from('campaign_members').delete().eq('campaign_id', id).in('profile_id', drop) : { error: null }
    if (r1.error || r2.error) toast(`Кампания сохранена, но команда не обновилась: ${(r1.error ?? r2.error)!.message}`)
    await reload('campaigns', 'campaign_members', 'integrations')
    setBusy(false)
    toast(d.id ? 'Кампания сохранена' : 'Кампания создана')
    onClose()
    onSaved?.(id)
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      wide
      title={d.id ? 'Кампания' : 'Новая кампания'}
      footer={
        <>
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
        <Field label="Статус" hint={manual ? undefined : 'Идёт после первого «Берём» клиента, завершается, когда все интеграции закрыты'}>
          <Select value={manual ? d.status! : 'auto'} onChange={(e) => set('status', (e.target.value === 'auto' ? 'planning' : e.target.value) as Campaign['status'])}>
            <option value="auto">{d.id && !manual && value?.status ? `Автоматически: ${campaignStatusLabel(value.status).toLowerCase()}` : 'Автоматически'}</option>
            <option value="paused">На паузе</option>
            <option value="done">Завершена</option>
            <option value="cancelled">Отменена</option>
          </Select>
        </Field>
        <Field label="Начало">
          <DateInput value={d.start_date} onChange={(v) => set('start_date', v)} aria-label="Начало" />
        </Field>
        <Field label="Конец">
          <DateInput value={d.end_date} onChange={(v) => set('end_date', v)} aria-label="Конец" />
        </Field>
        <Field label="Ответственный">
          <Select value={d.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)}>
            <option value="">Не назначен</option>
            {people.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || t.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Наценка, %" hint="Цена для клиента = цена блогера + наценка">
          <Input inputMode="numeric" className="num" value={d.markup_pct ?? ''} onChange={(e) => set('markup_pct', Number(e.target.value.replace(',', '.')) || 0)} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1 text-[13px] text-muted">Кто ещё работает над кампанией</div>
          <div className="flex flex-wrap gap-1.5">
            {people
              .filter((t) => t.id !== d.owner_id && t.role !== 'admin')
              .map((t) => {
                const on = crew.has(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setCrew((s) => {
                        const n = new Set(s)
                        if (on) n.delete(t.id)
                        else n.add(t.id)
                        return n
                      })
                    }
                    className={cx('h-8 rounded-full px-3 text-[13px] transition-colors duration-150', on ? 'bg-ink text-white' : 'bg-soft text-muted hover:text-ink')}
                  >
                    {t.full_name || t.email}
                  </button>
                )
              })}
            {people.filter((t) => t.id !== d.owner_id && t.role !== 'admin').length === 0 && <span className="text-muted">Учредители видят все кампании. Специалистов можно добавить, когда они появятся в команде</span>}
          </div>
        </div>
        <Field label="Бриф" className="sm:col-span-2">
          <Textarea rows={3} value={d.brief ?? ''} onChange={(e) => set('brief', e.target.value)} placeholder="Продукт, аудитория, ключевые сообщения, ограничения" />
        </Field>
      </div>
    </Modal>
  )
}

export function ClientModal({ value, onClose }: { value: Partial<Client> | null; onClose: () => void }) {
  const { reload } = useData()
  const [d, setD] = useState<Partial<Client>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (value) setD(value)
  }, [value])
  const set = (k: keyof Client, v: string) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.name?.trim()) return toast('Укажите название компании')
    setBusy(true)
    const payload = { name: d.name.trim(), contact_name: d.contact_name || null, contact: d.contact || null, inn: d.inn || null, niche: d.niche || null, notes: d.notes || null }
    const res = d.id ? await supabase.from('clients').update(payload).eq('id', d.id) : await supabase.from('clients').insert(payload)
    setBusy(false)
    if (res.error) return toast(res.error.message)
    await reload('clients')
    toast(d.id ? 'Клиент сохранён' : 'Клиент добавлен')
    onClose()
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={d.id ? 'Клиент' : 'Новый клиент'}
      footer={
        <>
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
          <Input value={d.niche ?? ''} onChange={(e) => set('niche', e.target.value)} placeholder="образование, кафе" />
        </Field>
        <Field label="Заметки" className="sm:col-span-2">
          <Textarea rows={3} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/** Ссылка для клиента: создать, скопировать, отозвать */
export function ShareBox({ campaignId, kind, onCreated }: { campaignId: string; kind: ShareLink['kind']; onCreated?: () => void }) {
  const { links, reload } = useData()
  const link = links.find((l) => l.campaign_id === campaignId && l.kind === kind && !l.revoked)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    const { error } = await supabase.from('share_links').insert({ campaign_id: campaignId, kind })
    setBusy(false)
    if (error) return toast(error.message)
    await reload('share_links')
    onCreated?.()
  }

  async function revoke() {
    if (!link || !(await confirmDialog({ title: 'Отозвать ссылку?', body: 'Клиент больше не сможет её открыть', ok: 'Отозвать', danger: true }))) return
    const { error } = await supabase.from('share_links').update({ revoked: true }).eq('id', link.id)
    if (error) return toast(error.message)
    await reload('share_links')
    toast('Ссылка отозвана')
  }

  if (!link)
    return (
      <Button variant="primary" loading={busy} onClick={create}>
        Создать ссылку для клиента
      </Button>
    )
  const url = siteUrl(`s/?t=${link.token}`)
  return (
    <div className="space-y-2">
      <CopyLink url={url} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => window.open(`${url}&preview=1`, '_blank')}>
          Открыть как клиент
        </Button>
        <Button size="sm" variant="danger" onClick={revoke}>
          Отозвать ссылку
        </Button>
      </div>
    </div>
  )
}
