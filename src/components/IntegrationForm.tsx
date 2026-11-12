import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { STATUSES } from '../lib/constants'
import { cpm, money, parseNumber } from '../lib/format'
import type { Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Field, Input, Modal, Select, Textarea, Toggle } from './ui'

type Draft = Partial<Integration>

const numFields = ['price', 'guaranteed_reach', 'fact_reach', 'payments_count', 'revenue'] as const

export function IntegrationFormModal({
  open,
  onClose,
  initial,
  bloggerId,
  campaignId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial?: Integration | null
  bloggerId?: string
  campaignId?: string
  onSaved?: () => void
}) {
  const { bloggers, campaigns, bloggerById } = useData()
  const { team, profile } = useAuth()
  const [d, setD] = useState<Draft>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) setD(initial)
    else {
      const b = bloggerById(bloggerId)
      setD({ blogger_id: bloggerId, campaign_id: campaignId ?? null, status: 'negotiating', price: b?.price ?? null, owner_id: profile?.id ?? null })
    }
  }, [open, initial, bloggerId, campaignId, bloggerById, profile?.id])

  const set = <K extends keyof Integration>(k: K, v: Integration[K] | null) => setD((x) => ({ ...x, [k]: v }))
  const numVal = (k: (typeof numFields)[number]) => (d[k] ?? '') as number | ''

  async function save() {
    if (!d.blogger_id) return toast('Выберите блогера')
    setBusy(true)
    const payload: Draft = { ...d }
    delete payload.id
    delete payload.created_at
    delete payload.updated_at
    for (const k of ['erid', 'promo_code', 'script_url', 'ad_url', 'format', 'notes'] as const) {
      if (typeof payload[k] === 'string') payload[k] = (payload[k] as string).trim() || null
    }
    const res = initial ? await supabase.from('integrations').update(payload).eq('id', initial.id) : await supabase.from('integrations').insert(payload)
    setBusy(false)
    if (res.error) return toast(`Не сохранилось: ${res.error.message}`)
    toast(initial ? 'Интеграция сохранена' : 'Интеграция добавлена')
    onSaved?.()
    onClose()
  }

  async function remove() {
    if (!initial || !confirm('Удалить интеграцию? Документы останутся в карточке блогера.')) return
    const { error } = await supabase.from('integrations').delete().eq('id', initial.id)
    if (error) return toast(error.message)
    toast('Интеграция удалена')
    onSaved?.()
    onClose()
  }

  const g = cpm(d.price ?? null, d.guaranteed_reach ?? null)
  const f = cpm(d.price ?? null, d.fact_reach ?? null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={initial ? `Интеграция: ${bloggerById(initial.blogger_id)?.nick ?? ''}` : 'Новая интеграция'}
      footer={
        <>
          {initial && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {initial ? 'Сохранить' : 'Добавить интеграцию'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!bloggerId && !initial && (
          <Field label="Блогер" className="sm:col-span-2">
            <Select value={d.blogger_id ?? ''} onChange={(e) => set('blogger_id', e.target.value)}>
              <option value="">Выберите блогера</option>
              {[...bloggers]
                .sort((a, b) => a.nick.localeCompare(b.nick))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nick}
                    {b.name ? ` (${b.name})` : ''}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="Кампания">
          <Select value={d.campaign_id ?? ''} onChange={(e) => set('campaign_id', e.target.value || null)}>
            <option value="">Без кампании</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Статус">
          <Select value={d.status ?? 'negotiating'} onChange={(e) => set('status', e.target.value as Integration['status'])}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Дата выхода">
          <Input type="date" value={d.publish_date ?? ''} onChange={(e) => set('publish_date', e.target.value || null)} />
        </Field>
        <Field label="Формат" hint="Например: нативка 30 сек, сторис, разговорник">
          <Input value={d.format ?? ''} onChange={(e) => set('format', e.target.value)} />
        </Field>

        {(
          [
            ['price', 'Цена, ₽'],
            ['guaranteed_reach', 'Гарант охвата'],
            ['fact_reach', 'Охват по факту'],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <Input inputMode="numeric" className="num" value={numVal(k)} onChange={(e) => set(k, parseNumber(e.target.value))} />
          </Field>
        ))}
        <div className="flex items-end gap-6 pb-2 text-sm text-muted">
          <span>
            CPM гарант: <b className="num text-ink">{g ? money(g) : '—'}</b>
          </span>
          <span>
            CPM факт: <b className="num text-ink">{f ? money(f) : '—'}</b>
          </span>
        </div>

        <div className="rounded-xl bg-base/70 p-4 sm:col-span-2">
          <p className="mb-3 text-[13px] font-medium">Маркировка</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="erid" hint="Токен из ОРД — без него выход не публикуем">
              <Input value={d.erid ?? ''} onChange={(e) => set('erid', e.target.value)} placeholder="2SDnjc…" />
            </Field>
            <div className="flex items-center pt-5">
              <Toggle checked={Boolean(d.ord_registered)} onChange={(v) => set('ord_registered', v)} label="Отчитались в ОРД" />
            </div>
          </div>
        </div>

        <Field label="Сценарий (ссылка)">
          <Input value={d.script_url ?? ''} onChange={(e) => set('script_url', e.target.value)} placeholder="https://docs.google.com/…" />
        </Field>
        <div className="flex items-center pt-5">
          <Toggle checked={Boolean(d.script_approved)} onChange={(v) => set('script_approved', v)} label="Сценарий согласован" />
        </div>
        <Field label="Ссылка на рекламу">
          <Input value={d.ad_url ?? ''} onChange={(e) => set('ad_url', e.target.value)} />
        </Field>
        <Field label="Промокод">
          <Input value={d.promo_code ?? ''} onChange={(e) => set('promo_code', e.target.value)} />
        </Field>
        <Field label="Оплат по промокоду">
          <Input inputMode="numeric" className="num" value={numVal('payments_count')} onChange={(e) => set('payments_count', parseNumber(e.target.value))} />
        </Field>
        <Field label="Сумма оплат, ₽">
          <Input inputMode="numeric" className="num" value={numVal('revenue')} onChange={(e) => set('revenue', parseNumber(e.target.value))} />
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
        <Field label="Заметки" className="sm:col-span-2">
          <Textarea rows={3} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
