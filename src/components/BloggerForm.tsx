import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { LEGAL, PLATFORMS, STATUSES, legalInfo } from '../lib/constants'
import { nickFromUrl, parseNumber, platformFromUrl } from '../lib/format'
import type { Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

export type BloggerDraft = Partial<Blogger>

export function BloggerFields({ d, set }: { d: BloggerDraft; set: <K extends keyof Blogger>(k: K, v: Blogger[K] | null) => void }) {
  const { team } = useAuth()
  const legal = legalInfo(d.legal_status ?? 'unknown')
  const num = (k: 'followers' | 'avg_reach' | 'price') => (
    <Input inputMode="numeric" className="num" value={(d[k] ?? '') as number | ''} onChange={(e) => set(k, parseNumber(e.target.value))} />
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ссылка на профиль" className="sm:col-span-2" hint="Ник и площадка подставятся сами">
        <Input
          value={d.url ?? ''}
          placeholder="https://www.tiktok.com/@nick"
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
        <Input value={d.nick ?? ''} onChange={(e) => set('nick', e.target.value.replace(/^@/, ''))} required />
      </Field>
      <Field label="Имя">
        <Input value={d.name ?? ''} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Площадка">
        <Select value={d.platform ?? 'tiktok'} onChange={(e) => set('platform', e.target.value as Blogger['platform'])}>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
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
      <Field label="Подписчики">{num('followers')}</Field>
      <Field label="Средний охват">{num('avg_reach')}</Field>
      <Field label="Цена за интеграцию, ₽">{num('price')}</Field>
      <Field label="Город">
        <Input value={d.city ?? ''} onChange={(e) => set('city', e.target.value)} />
      </Field>
      <Field label="Тематика">
        <Input value={d.topic ?? ''} onChange={(e) => set('topic', e.target.value)} placeholder="учёба, лайфстайл, бьюти" />
      </Field>
      <Field label="Формат контента">
        <Input value={d.content_type ?? ''} onChange={(e) => set('content_type', e.target.value)} placeholder="разговорник, скетчи, влоги" />
      </Field>
      <Field label="Аудитория">
        <Input value={d.audience ?? ''} onChange={(e) => set('audience', e.target.value)} placeholder="школьники 9–11, студенты, взрослые" />
      </Field>
      <Field label="Контакт для связи" hint="Telegram блогера или менеджера">
        <Input value={d.contact ?? ''} onChange={(e) => set('contact', e.target.value)} placeholder="@manager" />
      </Field>
      <Field label="Почта">
        <Input type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="Телефон">
        <Input value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
      </Field>

      <div className="rounded-xl bg-base/70 p-4 sm:col-span-2">
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
          <Field label="Регистрация в РКН (10 000+ подписчиков)">
            <Select
              value={d.rkn_registered === true ? 'yes' : d.rkn_registered === false ? 'no' : ''}
              onChange={(e) => set('rkn_registered', e.target.value === '' ? null : e.target.value === 'yes')}
            >
              <option value="">Не знаем</option>
              <option value="yes">Есть</option>
              <option value="no">Нет</option>
            </Select>
          </Field>
        </div>
        {!legal.ok && (
          <p className="mt-3 flex items-start gap-2 text-[13px] text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            Работаем только с самозанятыми и ИП — уточните статус до договора.
          </p>
        )}
      </div>

      <Field label="Следующий шаг до">
        <Input type="date" value={d.next_action_at ?? ''} onChange={(e) => set('next_action_at', e.target.value || null)} />
      </Field>
      <Field label="Теги" hint="Через запятую">
        <Input
          value={(d.tags ?? []).join(', ')}
          onChange={(e) =>
            set(
              'tags',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter((t, i, a) => t || i === a.length - 1),
            )
          }
        />
      </Field>
      <Field label="Заметки" className="sm:col-span-2">
        <Textarea rows={4} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

export function cleanBlogger(d: BloggerDraft): BloggerDraft {
  const out: BloggerDraft = { ...d }
  delete out.id
  delete out.created_at
  delete out.updated_at
  delete (out as Record<string, unknown>).nick_key
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string') (out as Record<string, unknown>)[k] = v.trim() || null
  }
  out.tags = (d.tags ?? []).map((t) => t.trim()).filter(Boolean)
  return out
}

export function BloggerFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (b: Blogger) => void }) {
  const { reloadBloggers } = useData()
  const { profile } = useAuth()
  const [d, setD] = useState<BloggerDraft>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setD({ platform: 'tiktok', status: 'new', legal_status: 'unknown', owner_id: profile?.id ?? null, tags: [] })
  }, [open, profile?.id])

  async function save() {
    if (!d.nick?.trim()) return toast('Укажите ник')
    setBusy(true)
    const { data, error } = await supabase.from('bloggers').insert(cleanBlogger(d)).select().single()
    setBusy(false)
    if (error) {
      return toast(error.code === '23505' ? 'Такой блогер уже есть в базе' : error.message)
    }
    await reloadBloggers()
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
      <div className="mb-4">
        <Field label="Статус">
          <Select value={d.status ?? 'new'} onChange={(e) => setD({ ...d, status: e.target.value as Blogger['status'] })}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <BloggerFields d={d} set={(k, v) => setD((x) => ({ ...x, [k]: v }))} />
    </Modal>
  )
}
