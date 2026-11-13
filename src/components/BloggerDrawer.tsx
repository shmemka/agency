import { useMemo, useState } from 'react'
import { ArrowUpRight, Plus, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { legalInfo, platformInfo, type BloggerStatus } from '../lib/constants'
import { isActive } from '../lib/rules'
import { count, cpm, date, money } from '../lib/format'
import type { Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { BloggerStatusSelect, Button, Card, Chip, Drawer, IconButton, Segmented, Spinner, StatusBadge, StatusRail } from './ui'
import { AudienceBar, BloggerName, TaskList, statsStale, useIntegrationPanel } from './bits'
import { BloggerFields, NewIntegrationModal, cleanBlogger, type BloggerDraft } from './BloggerForm'
import { DocumentsPanel } from './DocumentsPanel'
import { Feed } from './Feed'
import { OfferCard, tgUsername } from './OfferCard'
import { confirmDialog, confirmDiscard, promptDialog } from './dialogs'

type Tab = 'work' | 'data' | 'docs'

export function useBloggerStatus() {
  const { patchBlogger } = useData()
  return async (b: Blogger, s: BloggerStatus) => {
    if (s === b.status) return
    let reason: string | null = null
    if (s === 'blacklist') {
      reason = await promptDialog({ title: `${b.nick} в чёрный список`, label: 'Причина', placeholder: 'Сорвал сроки, накрутка, грубил', ok: 'В чёрный список', required: true, multiline: true })
      if (!reason) return
    }
    const err = await patchBlogger(b.id, { status: s, blacklist_reason: reason })
    toast(err ?? `${b.nick}: статус обновлён`)
  }
}

export function BloggerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { blogger, integrations, campaign, docs, tasks, loading, reload, moveIntegration, patchBlogger } = useData()
  const { isAdmin } = useAuth()
  const { open } = useIntegrationPanel()
  const setStatus = useBloggerStatus()
  const b = blogger(id)
  const [tab, setTab] = useState<Tab>('work')
  const [adding, setAdding] = useState(false)
  const [d, setD] = useState<BloggerDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const mine = useMemo(() => integrations.filter((i) => i.blogger_id === id).sort((a, z) => (z.publish_date ?? '9').localeCompare(a.publish_date ?? '9')), [integrations, id])

  if (!b) {
    return (
      <Drawer onClose={onClose} label="Карточка блогера">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-muted">{loading ? <Spinner /> : 'Блогер не найден или у вас нет к нему доступа'}</div>
      </Drawer>
    )
  }

  const p = platformInfo(b.platform)
  const active = mine.filter(isActive)
  const rest = mine.filter((i) => !isActive(i))
  const draft = d ?? b
  const dirty = d !== null && JSON.stringify(cleanBlogger(d)) !== JSON.stringify(cleanBlogger(b))
  const c = cpm(b.price, b.avg_reach)
  const tg = tgUsername(b.contact)
  const guard = async () => !dirty || (await confirmDiscard())
  const closeSafe = async () => {
    if (await guard()) onClose()
  }

  async function save() {
    if (!d?.nick?.trim()) return toast('Ник не может быть пустым')
    setBusy(true)
    const err = await patchBlogger(b!.id, cleanBlogger(d))
    setBusy(false)
    if (err) return toast(err.includes('bloggers_platform_nick') ? 'Блогер с таким ником уже есть' : err)
    setD(null)
    toast('Изменения сохранены')
  }

  async function remove() {
    if (!(await confirmDialog({ title: `Удалить ${b!.nick}?`, body: 'Вместе с блогером удалятся его интеграции и история', ok: 'Удалить', danger: true }))) return
    const { error } = await supabase.from('bloggers').delete().eq('id', b!.id)
    if (error) return toast(error.message)
    await reload('bloggers', 'integrations')
    toast('Блогер удалён')
    onClose()
  }

  return (
    <Drawer onClose={onClose} beforeClose={guard} label={`Карточка ${b.nick}`}>
      <div className="flex flex-col gap-3 p-3 md:p-4">
        <Card>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 text-xl">
              <BloggerName b={b} big />
            </div>
            {tg && (
              <a href={`https://t.me/${tg}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-soft px-4 text-sm hover:bg-ink/10">
                <Send className="size-4" strokeWidth={1.5} />
                Написать
              </a>
            )}
            {isAdmin && (
              <IconButton label="Удалить блогера" onClick={remove} className="hover:text-bad">
                <Trash2 className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            )}
            <span className="hidden md:block">
              <IconButton label="Закрыть" onClick={closeSafe}>
                <X className="size-[18px]" strokeWidth={1.5} />
              </IconButton>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BloggerStatusSelect value={b.status} onChange={(s) => setStatus(b, s)} />
            <Chip>{legalInfo(b.legal_status).label}</Chip>
            {(b.followers ?? 0) >= 10_000 && <Chip tone={b.rkn_registered ? undefined : 'warn'}>{b.rkn_registered ? 'В перечне РКН' : 'РКН не отмечен'}</Chip>}
            {statsStale(b) && <Chip tone="warn">Статистика старше 60 дней</Chip>}
          </div>
          {b.status === 'blacklist' && b.blacklist_reason && <p className="mt-3 rounded-2xl bg-soft px-4 py-3">Причина: {b.blacklist_reason}</p>}
          <dl className="num mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              [p.followers, count(b.followers)],
              [p.reach, count(b.avg_reach)],
              ['Цена', money(b.price)],
              ['CPM', c ? money(c) : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="truncate text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 text-base">{v}</dd>
              </div>
            ))}
          </dl>
          {(b.audience_female_pct !== null || b.audience_age) && <AudienceBar female={b.audience_female_pct} age={b.audience_age} className="mt-4 max-w-xs" />}
        </Card>

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="self-start"
          options={[
            { id: 'work', label: 'Работа' },
            { id: 'data', label: 'Данные' },
            { id: 'docs', label: `Документы ${docs.filter((x) => x.blogger_id === b.id).length || ''}` },
          ]}
        />

        {tab === 'work' && (
          <>
            {b.status !== 'blacklist' && b.status !== 'worked' && <OfferCard key={b.id} b={b} />}
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base">В работе</h3>
                <Button size="sm" variant="primary" disabled={b.status === 'blacklist'} onClick={() => setAdding(true)}>
                  <Plus className="size-4" strokeWidth={1.5} />
                  Новая интеграция
                </Button>
              </div>
              {active.length === 0 ? (
                <p className="text-muted">{b.status === 'blacklist' ? 'Блогер в чёрном списке, новые интеграции закрыты' : 'Активных интеграций нет. Создайте интеграцию, когда начнёте переговоры'}</p>
              ) : (
                <div className="space-y-3">
                  {active.map((i) => (
                    <div key={i.id} className="rounded-inner bg-soft p-4">
                      <button onClick={() => open(i.id)} className="mb-3 flex w-full items-center gap-2 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{campaign(i.campaign_id)?.name ?? 'Без кампании'}</span>
                          <span className="num block text-xs text-muted">
                            {i.publish_date ? `выход ${date(i.publish_date)}, ` : ''}
                            {money(i.price)}
                          </span>
                        </span>
                        <span className="flex size-9 items-center justify-center rounded-full bg-surface">
                          <ArrowUpRight className="size-4" strokeWidth={1.5} />
                        </span>
                      </button>
                      <StatusRail value={i.status} onChange={(s) => moveIntegration(i, s)} />
                    </div>
                  ))}
                </div>
              )}
              {rest.length > 0 && (
                <ul className="mt-4">
                  {rest.map((i) => (
                    <li key={i.id}>
                      <button onClick={() => open(i.id)} className="flex min-h-11 w-full items-center gap-3 border-t border-line py-2 text-left hover:bg-soft">
                        <span className="num w-20 shrink-0 text-muted">{date(i.publish_date)}</span>
                        <span className="min-w-0 flex-1 truncate">{campaign(i.campaign_id)?.name ?? 'Без кампании'}</span>
                        <span className="num hidden sm:inline">{money(i.price)}</span>
                        {i.campaign_id && i.client_decision !== 'approved' ? <Chip>В подборке</Chip> : <StatusBadge status={i.status} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h3 className="mb-3 text-base">Задачи</h3>
              <TaskList tasks={tasks.filter((t) => t.blogger_id === b.id)} scope={{ blogger_id: b.id }} />
            </Card>
            <Card>
              <h3 className="mb-3 text-base">Комментарии и история</h3>
              {b.notes && <p className="mb-3 rounded-2xl bg-soft px-4 py-3 whitespace-pre-line text-muted">{b.notes}</p>}
              <Feed bloggerId={b.id} />
            </Card>
          </>
        )}

        {tab === 'data' && (
          <Card>
            <BloggerFields d={draft} set={(k, v) => setD((x) => ({ ...(x ?? b), [k]: v }))} />
            {dirty && (
              <div className="sticky bottom-3 mt-6 flex justify-end gap-2 rounded-full bg-surface p-1 shadow-[0_8px_24px_rgba(21,23,28,0.1)] ring-1 ring-line">
                <Button variant="ghost" onClick={() => setD(null)}>
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
            <DocumentsPanel bloggerId={b.id} choices={mine} />
          </Card>
        )}
      </div>
      <NewIntegrationModal open={adding} onClose={() => setAdding(false)} bloggerId={b.id} onCreated={(i) => open(i.id)} />
    </Drawer>
  )
}
