import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { DECISIONS, MARKED_BY, platformInfo } from '../lib/constants'
import { checklist, isLive, ordDeadline } from '../lib/rules'
import { count, cpm, date, daysBetween, money, parseNumber, todayISO } from '../lib/format'
import type { Decision, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Drawer, Field, IconButton, Input, Segmented, Select, Spinner, StatusRail, Toggle, cx } from './ui'
import { RichEditor } from './RichEditor'
import { BloggerName, TaskList } from './bits'
import { DocumentsPanel } from './DocumentsPanel'
import { Feed } from './Feed'
import { confirmDialog, confirmDiscard } from './dialogs'
import { DateInput } from './DateInput'

type Tab = 'work' | 'terms' | 'docs'

export function IntegrationPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { integrations, blogger, campaign, campaigns, docs, tasks, settings, loading, moveIntegration, patchIntegration, reload } = useData()
  const { isAdmin, profile, team } = useAuth()
  const i = integrations.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('work')
  const [d, setD] = useState<Partial<Integration>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setD({})
  }, [id])

  const dirty = Object.keys(d).length > 0
  // цена для клиента считается от цены блогера и наценки кампании прямо в черновике, как это сделает база при сохранении
  const v = useMemo(() => {
    const x = { ...i, ...d } as Integration
    const m = campaigns.find((c) => c.id === x.campaign_id)?.markup_pct
    if (x.campaign_id && !x.price_client_manual) x.price_client = x.price === null || x.price === undefined ? null : Math.ceil((x.price * (1 + (m ?? 0) / 100)) / 100) * 100
    return x
  }, [i, d, campaigns])

  if (!i) {
    return (
      <Drawer onClose={onClose} label="Интеграция">
        <div className="flex flex-1 items-center justify-center p-6 text-muted">{loading ? <Spinner /> : 'Интеграция не найдена или у вас нет к ней доступа'}</div>
      </Drawer>
    )
  }

  const b = blogger(i.blogger_id)
  const c = campaign(i.campaign_id)
  const list = checklist(i, docs)
  const deadline = ordDeadline(i, settings)
  const left = deadline ? daysBetween(todayISO(), deadline) : null
  const set = <K extends keyof Integration>(k: K, val: Integration[K]) => setD((x) => ({ ...x, [k]: val }))
  const num = (k: 'price' | 'price_client' | 'guaranteed_reach' | 'fact_reach' | 'payments_count' | 'revenue') => (
    <Input inputMode="numeric" className="num" value={v[k] ?? ''} onChange={(e) => setD((x) => ({ ...x, [k]: parseNumber(e.target.value), ...(k === 'price_client' ? { price_client_manual: true } : {}) }))} />
  )

  async function save() {
    setBusy(true)
    const patch = { ...d }
    for (const k of ['erid', 'promo_code', 'script_url', 'ad_url', 'format', 'notes'] as const) {
      if (typeof patch[k] === 'string') patch[k] = (patch[k] as string).trim() || null
    }
    const err = await patchIntegration(i!.id, patch)
    setBusy(false)
    if (err) return toast(`Не сохранилось: ${err}`)
    setD({})
    toast('Изменения сохранены')
  }

  async function remove() {
    if (!(await confirmDialog({ title: 'Удалить интеграцию?', body: 'Её документы останутся в карточке блогера', ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from('integrations').delete().eq('id', i!.id)
    if (error) return toast(error.message)
    await reload('integrations')
    toast('Интеграция удалена')
    onClose()
  }

  async function ord(on: boolean) {
    const err = await patchIntegration(i!.id, { ord_reported_at: on ? new Date().toISOString() : null, ord_reported_by: on ? (profile?.id ?? null) : null })
    toast(err ?? (on ? 'Отмечено: статистика передана в ОРД' : 'Отметка снята'))
  }

  const guard = async () => !dirty || (await confirmDiscard())
  const closeSafe = async () => {
    if (await guard()) onClose()
  }

  const g = cpm(v.price_client ?? v.price, v.guaranteed_reach)
  const f = cpm(v.price_client ?? v.price, v.fact_reach)

  return (
    <Drawer onClose={onClose} beforeClose={guard} label={`Интеграция ${b?.nick ?? ''}`}>
      <div className="flex flex-col gap-3 p-3 md:p-4">
        <Card>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[13px] text-muted">
                {c ? (
                  <Link to={`/campaigns/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                ) : (
                  'Без кампании'
                )}
                {c && i.client_decision !== 'approved' && <span>, клиент: {DECISIONS[i.client_decision].toLowerCase()}</span>}
              </div>
              <div className="text-xl">
                <BloggerName b={b} link />
              </div>
            </div>
            {isAdmin && (
              <IconButton label="Удалить интеграцию" onClick={remove} className="hover:text-bad">
                <Trash2 className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            )}
            <span className="hidden md:block">
              <IconButton label="Закрыть" onClick={closeSafe}>
                <X className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            </span>
          </div>
          <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              ['Выход', date(i.publish_date)],
              ['Блогеру', money(i.price)],
              ['Клиенту', c ? money(i.price_client) : '—'],
              ['Охват', i.fact_reach ? count(i.fact_reach) : i.guaranteed_reach ? `гарант ${count(i.guaranteed_reach)}` : '—'],
            ].map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 text-base">{val}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5">
            <StatusRail value={i.status} onChange={(s) => moveIntegration(i, s)} />
          </div>
        </Card>

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'work', label: 'Работа' },
            { id: 'terms', label: 'Условия' },
            { id: 'docs', label: `Документы ${docs.filter((x) => x.integration_id === i.id).length || ''}` },
          ]}
          className="self-start"
        />

        {tab === 'work' && (
          <>
            <Card>
              <div className="flex items-baseline justify-between">
                <h3 className="text-base">Готовность</h3>
                <span className="num text-[13px] text-muted">
                  {list.filter((x) => x.done).length} из {list.length}
                </span>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {list.map((x) => (
                  <li key={x.label} className={cx('flex items-center gap-2.5', !x.done && 'text-muted')}>
                    <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-full', x.done ? 'bar-lime text-ink' : 'hatch')}>{x.done && <Check className="size-3" strokeWidth={2.5} />}</span>
                    {x.label}
                  </li>
                ))}
              </ul>
              {i.marked_by === 'us' && isLive(i) && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                  <span className={cx(!i.ord_reported_at && left !== null && left <= 2 && 'text-bad', !i.ord_reported_at && left !== null && left > 2 && left <= 7 && 'text-warn')}>
                    {i.ord_reported_at
                      ? `Статистика передана в ОРД ${date(i.ord_reported_at)}`
                      : deadline
                        ? `Сдать статистику в ОРД до ${date(deadline)}`
                        : 'Статистика в ОРД не передана'}
                  </span>
                  <Button size="sm" variant={i.ord_reported_at ? 'ghost' : 'primary'} onClick={() => ord(!i.ord_reported_at)}>
                    {i.ord_reported_at ? 'Снять отметку' : 'Передали в ОРД'}
                  </Button>
                </div>
              )}
            </Card>
            <Card>
              <h3 className="mb-3 text-base">Задачи</h3>
              <TaskList tasks={tasks.filter((t) => t.integration_id === i.id)} scope={{ integration_id: i.id, blogger_id: i.blogger_id, campaign_id: i.campaign_id }} />
            </Card>
            <Card>
              <h3 className="mb-3 text-base">Комментарии и история</h3>
              <Feed bloggerId={i.blogger_id} integrationId={i.id} />
            </Card>
          </>
        )}

        {tab === 'terms' && (
          <Card className="pb-20">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Кампания">
                <Select
                  value={v.campaign_id ?? ''}
                  onChange={(e) =>
                    // интеграцию без кампании уже ведут: привязка к кампании не должна прятать её в подборку
                    setD((x) => ({ ...x, campaign_id: e.target.value || null, ...(e.target.value && !i.campaign_id ? { client_decision: 'approved' as Decision } : {}) }))
                  }
                >
                  <option value="">Без кампании</option>
                  {campaigns.filter((x) => x.status === 'planning' || x.status === 'active' || x.id === i.campaign_id).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {v.campaign_id && (
                <Field label="Решение клиента">
                  <Select value={v.client_decision} onChange={(e) => set('client_decision', e.target.value as Decision)}>
                    {Object.entries(DECISIONS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Дата выхода">
                <DateInput value={v.publish_date} onChange={(x) => set('publish_date', x)} aria-label="Дата выхода" />
              </Field>
              <Field label="Формат">
                <Input value={v.format ?? ''} onChange={(e) => set('format', e.target.value)} placeholder={b ? platformInfo(b.platform).format : ''} />
              </Field>
              <Field label="Цена блогера, ₽">{num('price')}</Field>
              {v.campaign_id && (
                <Field label="Цена для клиента, ₽" hint={v.price_client_manual ? 'Задана вручную и не пересчитывается' : `Считается сама: цена блогера + ${campaign(v.campaign_id)?.markup_pct ?? 0}%`}>
                  {num('price_client')}
                </Field>
              )}
              {v.price_client_manual && (
                <div className="sm:col-span-2">
                  <Button size="sm" onClick={() => setD((x) => ({ ...x, price_client_manual: false }))}>
                    Вернуть расчёт по наценке
                  </Button>
                </div>
              )}
              <Field label="Гарант охвата">{num('guaranteed_reach')}</Field>
              <Field label="Охват по факту">{num('fact_reach')}</Field>
              <p className="num text-[13px] text-muted sm:col-span-2">
                CPM по гаранту {g ? money(g) : '—'}, по факту {f ? money(f) : '—'}
              </p>
            </div>

            <h3 className="mt-6 mb-3 text-base">Маркировка</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="erid" hint="Токен из Яндекс ОРД. Без него выход не публикуем">
                <Input value={v.erid ?? ''} onChange={(e) => set('erid', e.target.value)} />
              </Field>
              <Field label="Кто маркирует">
                <Select value={v.marked_by} onChange={(e) => set('marked_by', e.target.value as Integration['marked_by'])}>
                  {Object.entries(MARKED_BY).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Дата первого показа" hint="От неё считается срок сдачи статистики">
                <DateInput value={v.first_shown_at} onChange={(x) => set('first_shown_at', x)} aria-label="Дата первого показа" />
              </Field>
            </div>

            <h3 className="mt-6 mb-3 text-base">Сценарий и результат</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Сценарий, ссылка">
                <Input value={v.script_url ?? ''} onChange={(e) => set('script_url', e.target.value)} placeholder="https://docs.google.com/…" />
              </Field>
              <div className="flex items-end">
                <Toggle checked={v.script_approved} onChange={(x) => set('script_approved', x)} label="Сценарий согласован" />
              </div>
              <Field label="Ссылка на выход">
                <Input value={v.ad_url ?? ''} onChange={(e) => set('ad_url', e.target.value)} />
              </Field>
              <Field label="Промокод">
                <Input value={v.promo_code ?? ''} onChange={(e) => set('promo_code', e.target.value)} />
              </Field>
              <Field label="Оплат по промокоду">{num('payments_count')}</Field>
              <Field label="Сумма оплат, ₽">{num('revenue')}</Field>
              <Field label="Ответственный">
                <Select value={v.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)} disabled={!isAdmin}>
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
              <Field as="div" label="Заметки" className="sm:col-span-2">
                <RichEditor value={v.notes} onChange={(x) => set('notes', x)} label="Заметки" className="min-h-24" />
              </Field>
            </div>
            {dirty && (
              <div className="sticky bottom-3 mt-6 flex justify-end gap-2 rounded-full bg-surface p-1 shadow-[0_8px_24px_rgba(21,23,28,0.1)] ring-1 ring-line">
                <Button variant="ghost" onClick={() => setD({})}>
                  Отменить
                </Button>
                <Button variant="primary" data-save loading={busy} onClick={save}>
                  Сохранить изменения
                </Button>
              </div>
            )}
          </Card>
        )}

        {tab === 'docs' && (
          <Card>
            <DocumentsPanel bloggerId={i.blogger_id} integrationId={i.id} />
          </Card>
        )}
      </div>
    </Drawer>
  )
}
