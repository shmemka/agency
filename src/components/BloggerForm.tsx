import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { AGE_GROUPS, LEGAL, PLATFORMS, legalInfo, platformInfo } from '../lib/constants'
import { nickFromUrl, parseNumber, platformFromUrl } from '../lib/format'
import type { Blogger, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

export type BloggerDraft = Partial<Blogger>

export function BloggerFields({ d, set }: { d: BloggerDraft; set: <K extends keyof Blogger>(k: K, v: Blogger[K] | null) => void }) {
  const { team, isAdmin } = useAuth()
  const p = platformInfo(d.platform ?? 'tiktok')
  const legal = legalInfo(d.legal_status ?? 'unknown')
  const ageSum = AGE_GROUPS.reduce((a, g) => a + (d.audience_age?.[g.id] ?? 0), 0)
  const num = (k: 'followers' | 'avg_reach' | 'clip_views' | 'price' | 'audience_female_pct') => (
    <Input inputMode="numeric" className="num" value={d[k] ?? ''} onChange={(e) => set(k, parseNumber(e.target.value))} />
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ссылка на профиль" className="sm:col-span-2" hint="Ник и площадка подставятся сами">
        <Input
          value={d.url ?? ''}
          placeholder="https://www.tiktok.com/@nick или https://vk.com/name"
          onChange={(e) => {
            const url = e.target.value
            set('url', url)
            const n = nickFromUrl(url)
            if (n && !d.nick) set('nick', n)
            if (url.includes('.')) set('platform', platformFromUrl(url))
          }}
        />
      </Field>
      <Field label="Ник">
        <Input value={d.nick ?? ''} onChange={(e) => set('nick', e.target.value.replace(/^@/, ''))} />
      </Field>
      <Field label="Имя">
        <Input value={d.name ?? ''} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Площадка">
        <Select value={d.platform ?? 'tiktok'} onChange={(e) => set('platform', e.target.value as Blogger['platform'])}>
          {PLATFORMS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Цена за интеграцию, ₽">{num('price')}</Field>
      <Field label={p.followers}>{num('followers')}</Field>
      <Field label={p.reach} hint={d.platform === 'tiktok' ? 'По последним 9–10 видео' : undefined}>
        {num('avg_reach')}
      </Field>
      {d.platform === 'vk' && <Field label="Средние просмотры клипа">{num('clip_views')}</Field>}

      <div className="rounded-inner bg-soft p-4 sm:col-span-2">
        <div className="mb-3 text-[13px] text-muted">Аудитория</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Женщины, %">{num('audience_female_pct')}</Field>
          {AGE_GROUPS.map((g) => (
            <Field key={g.id} label={`${g.label}, %`}>
              <Input
                inputMode="numeric"
                className="num"
                value={d.audience_age?.[g.id] ?? ''}
                onChange={(e) => {
                  const next = { ...(d.audience_age ?? {}) }
                  const n = parseNumber(e.target.value)
                  if (n === null) delete next[g.id]
                  else next[g.id] = n
                  set('audience_age', Object.keys(next).length ? next : null)
                }}
              />
            </Field>
          ))}
        </div>
        {ageSum > 0 && Math.round(ageSum) !== 100 && <p className="mt-2 text-[13px] text-warn">Возрастные группы дают в сумме {Math.round(ageSum)}%, а должно быть 100</p>}
      </div>

      <Field label="Тематика">
        <Input value={d.topic ?? ''} onChange={(e) => set('topic', e.target.value)} placeholder="учёба, лайфстайл, бьюти" />
      </Field>
      <Field label="Формат контента">
        <Input value={d.content_type ?? ''} onChange={(e) => set('content_type', e.target.value)} placeholder="разговорник, скетчи, влоги" />
      </Field>
      <Field label="Контакт" hint="Telegram блогера или менеджера">
        <Input value={d.contact ?? ''} onChange={(e) => set('contact', e.target.value)} placeholder="@manager" />
      </Field>
      <Field label="Город">
        <Input value={d.city ?? ''} onChange={(e) => set('city', e.target.value)} />
      </Field>

      <div className="rounded-inner bg-soft p-4 sm:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Правовой статус">
            <Select value={d.legal_status ?? 'unknown'} onChange={(e) => set('legal_status', e.target.value as Blogger['legal_status'])}>
              {LEGAL.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Регистрация в перечне РКН" hint="Обязательна от 10 000 подписчиков">
            <Select value={d.rkn_registered === true ? 'yes' : d.rkn_registered === false ? 'no' : ''} onChange={(e) => set('rkn_registered', e.target.value === '' ? null : e.target.value === 'yes')}>
              <option value="">Не знаем</option>
              <option value="yes">Есть</option>
              <option value="no">Нет</option>
            </Select>
          </Field>
        </div>
        {!legal.ok && (
          <p className="mt-3 flex items-start gap-2 text-[13px] text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            Работаем только с самозанятыми и ИП. Уточните статус до договора
          </p>
        )}
      </div>

      {isAdmin && (
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
      )}
      <Field label="Теги" hint="Через запятую">
        <Input value={(d.tags ?? []).join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trimStart()))} />
      </Field>
      <Field label="Заметки" className="sm:col-span-2">
        <Textarea rows={3} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

const EDITABLE = ['nick', 'name', 'platform', 'url', 'topic', 'audience', 'content_type', 'city', 'followers', 'avg_reach', 'clip_views', 'audience_female_pct', 'audience_age', 'price', 'contact', 'email', 'phone', 'legal_status', 'rkn_registered', 'owner_id', 'tags', 'notes'] as const

export function cleanBlogger(d: BloggerDraft): BloggerDraft {
  const out: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    const v = d[k]
    if (v === undefined) continue
    out[k] = typeof v === 'string' ? v.trim() || null : v
  }
  if (d.tags) out.tags = d.tags.map((t) => t.trim()).filter(Boolean)
  return out as BloggerDraft
}

export interface Existing {
  key: string
  owner_name: string
  visible: boolean
}

export async function findExisting(keys: string[]): Promise<Existing[]> {
  if (!keys.length) return []
  const { data, error } = await supabase.rpc('existing_bloggers', { p_keys: keys })
  if (error) throw new Error(error.message)
  return (data ?? []) as Existing[]
}

export function BloggerFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (b: Blogger) => void }) {
  const { reload } = useData()
  const { profile } = useAuth()
  const [d, setD] = useState<BloggerDraft>({})
  const [busy, setBusy] = useState(false)
  const [dup, setDup] = useState<Existing | null>(null)

  useEffect(() => {
    if (open) {
      setD({ platform: 'tiktok', legal_status: 'unknown', owner_id: profile?.id ?? null, tags: [] })
      setDup(null)
    }
  }, [open, profile?.id])

  async function save() {
    const nick = d.nick?.trim()
    if (!nick) return toast('Укажите ник')
    setBusy(true)
    try {
      const [ex] = await findExisting([`${d.platform}:${nick.toLowerCase()}`])
      if (ex) {
        setDup(ex)
        setBusy(false)
        return
      }
    } catch {
      /* проверку дублей повторит база */
    }
    const { data, error } = await supabase.from('bloggers').insert(cleanBlogger(d)).select().single()
    setBusy(false)
    if (error) return toast(error.code === '23505' ? 'Такой блогер уже есть в базе' : error.message)
    await reload('bloggers')
    toast('Блогер добавлен')
    onClose()
    onCreated?.(data as Blogger)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Новый блогер"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Добавить блогера
          </Button>
        </>
      }
    >
      {dup && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-inner bg-amber-100 p-4 text-warn">
          <span className="flex-1">
            Этот блогер уже в базе, ответственный: {dup.owner_name}
            {dup.visible ? '. Найдите его в списке' : ''}
          </span>
          {!dup.visible && (
            <Button
              size="sm"
              onClick={async () => {
                const { error } = await supabase.rpc('request_blogger_access', { p_key: dup.key })
                toast(error ? error.message : 'Запрос отправлен учредителям')
                onClose()
              }}
            >
              Попросить доступ
            </Button>
          )}
        </div>
      )}
      <BloggerFields d={d} set={(k, v) => setD((x) => ({ ...x, [k]: v }))} />
    </Modal>
  )
}

/** Новая интеграция: блогер + (необязательно) кампания. Остальное заполняется в панели */
export function NewIntegrationModal({ open, onClose, bloggerId, onCreated }: { open: boolean; onClose: () => void; bloggerId?: string; onCreated: (i: Integration) => void }) {
  const { bloggers, campaigns, blogger, reload } = useData()
  const [bid, setBid] = useState('')
  const [cid, setCid] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setBid(bloggerId ?? '')
      setCid('')
    }
  }, [open, bloggerId])

  async function create() {
    if (!bid) return toast('Выберите блогера')
    setBusy(true)
    const { data, error } = await supabase
      .from('integrations')
      .insert({ blogger_id: bid, campaign_id: cid || null, price: blogger(bid)?.price ?? null, status: 'new' })
      .select()
      .single()
    setBusy(false)
    if (error) return toast(error.message)
    await reload('integrations')
    onClose()
    onCreated(data as Integration)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новая интеграция"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            Создать интеграцию
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!bloggerId && (
          <Field label="Блогер">
            <Select value={bid} onChange={(e) => setBid(e.target.value)}>
              <option value="">Выберите блогера</option>
              {[...bloggers]
                .filter((b) => b.status !== 'blacklist')
                .sort((a, b) => a.nick.localeCompare(b.nick))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nick}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="Кампания" hint="В кампании блогер сначала попадает в подборку и ждёт решения клиента">
          <Select value={cid} onChange={(e) => setCid(e.target.value)}>
            <option value="">Без кампании</option>
            {campaigns
              .filter((c) => c.status === 'planning' || c.status === 'active')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}
