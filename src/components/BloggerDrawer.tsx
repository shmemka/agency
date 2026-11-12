import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, MessageSquare, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { useAuth } from '../auth/AuthProvider'
import { legalInfo, platformLabel, statusInfo, statusLabel, type Status } from '../lib/constants'
import { count, cpm, date, dateTime, money } from '../lib/format'
import type { Activity, Blogger, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Drawer, Empty, Spinner, StatusBadge, StatusRail, StatusSelect, Textarea, cx } from './ui'
import { BloggerFields, cleanBlogger, type BloggerDraft } from './BloggerForm'
import { DocumentsPanel } from './DocumentsPanel'
import { IntegrationFormModal } from './IntegrationForm'

type Tab = 'work' | 'data' | 'integrations' | 'docs'

export function BloggerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { bloggerById, patchBlogger, loading, reloadBloggers } = useData()
  const { isAdmin } = useAuth()
  const blogger = bloggerById(id)
  const [tab, setTab] = useState<Tab>('work')
  const [docCount, setDocCount] = useState<number | null>(null)
  const [intCount, setIntCount] = useState<number | null>(null)

  if (!blogger) {
    return (
      <Drawer onClose={onClose} label="Карточка блогера">
        <div className="flex flex-1 items-center justify-center">{loading ? <Spinner /> : <p className="text-muted">Блогер не найден — возможно, его удалили.</p>}</div>
      </Drawer>
    )
  }

  async function setStatus(s: Status) {
    if (!blogger || s === blogger.status) return
    const err = await patchBlogger(blogger.id, { status: s })
    toast(err ? `Не удалось: ${err}` : `Статус: ${statusLabel(s)}`)
  }

  async function remove() {
    if (!blogger || !confirm(`Удалить ${blogger.nick} вместе с интеграциями и историей?`)) return
    const { error } = await supabase.from('bloggers').delete().eq('id', blogger.id)
    if (error) return toast(error.message)
    await reloadBloggers()
    toast('Блогер удалён')
    onClose()
  }

  const legal = legalInfo(blogger.legal_status)
  const c = cpm(blogger.price, blogger.avg_reach)

  return (
    <Drawer onClose={onClose} label={`Карточка ${blogger.nick}`}>
      <div className="border-b border-line px-6 pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <span>{platformLabel(blogger.platform)}</span>
              {blogger.source && <span className="truncate text-faint">из «{blogger.source}»</span>}
            </div>
            <h2 className="font-display truncate text-[26px] leading-tight font-semibold tracking-tight">{blogger.nick}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {blogger.name && <span className="text-ink">{blogger.name}</span>}
              {blogger.url && (
                <a href={blogger.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                  Профиль <ExternalLink className="size-3.5" />
                </a>
              )}
              {blogger.contact && <span>{blogger.contact}</span>}
            </div>
          </div>
          {isAdmin && (
            <button onClick={remove} className="rounded-md p-2 text-faint hover:bg-rose-50 hover:text-rose-700" aria-label="Удалить блогера" title="Удалить блогера">
              <Trash2 className="size-4" />
            </button>
          )}
          <button onClick={onClose} className="rounded-md p-2 text-faint hover:bg-base hover:text-ink" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>

        <dl className="num mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ['Подписчики', count(blogger.followers)],
            ['Охват', count(blogger.avg_reach)],
            ['Цена', money(blogger.price)],
            ['CPM', c ? money(c) : '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <StatusRail value={blogger.status} onChange={setStatus} />
        </div>

        {!legal.ok && ['agreed', 'waiting_details', 'waiting_contract', 'waiting_signature', 'waiting_payment'].includes(blogger.status) && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            Правовой статус «{legal.label}». Договор заключаем только с самозанятым или ИП.
          </p>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line px-4" role="tablist">
        {(
          [
            ['work', 'Работа'],
            ['data', 'Данные'],
            ['integrations', `Интеграции${intCount !== null ? ` ${intCount}` : ''}`],
            ['docs', `Документы${docCount !== null ? ` ${docCount}` : ''}`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx('relative h-11 shrink-0 px-3 text-[13.5px] whitespace-nowrap', tab === t ? 'font-medium text-ink' : 'text-muted hover:text-ink')}
          >
            {label}
            {tab === t && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <div className="flex-1 px-6 py-5 sm:overflow-y-auto">
        <div hidden={tab !== 'work'}>
          <WorkTab blogger={blogger} />
        </div>
        {tab === 'data' && <DataTab key={blogger.id} blogger={blogger} />}
        <div hidden={tab !== 'integrations'}>
          <IntegrationsTab blogger={blogger} onCount={setIntCount} />
        </div>
        <div hidden={tab !== 'docs'}>
          <DocumentsPanel bloggerId={blogger.id} onCount={setDocCount} />
        </div>
      </div>
    </Drawer>
  )
}

function WorkTab({ blogger }: { blogger: Blogger }) {
  const { personName, profile } = useAuth()
  const { pulse, patchBlogger } = useData()
  const [items, setItems] = useState<Activity[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('activity').select('*').eq('blogger_id', blogger.id).order('created_at', { ascending: false }).limit(200)
    setItems((data as Activity[]) ?? [])
  }, [blogger.id])

  useEffect(() => {
    load()
  }, [load, pulse, blogger.status])

  async function send() {
    if (!text.trim()) return
    setBusy(true)
    const { error } = await supabase.from('activity').insert({ blogger_id: blogger.id, kind: 'comment', body: text.trim(), actor_id: profile?.id })
    setBusy(false)
    if (error) return toast(error.message)
    setText('')
    // поднимаем блогера наверх списка «Обновлён»
    patchBlogger(blogger.id, { next_action_at: blogger.next_action_at })
    load()
  }

  async function removeComment(a: Activity) {
    if (!confirm('Удалить комментарий?')) return
    const { error } = await supabase.from('activity').delete().eq('id', a.id)
    if (error) toast(error.message)
    else load()
  }

  return (
    <div>
      {blogger.notes && (
        <div className="mb-5 rounded-xl bg-base/70 p-4 text-[13px] whitespace-pre-line text-muted">
          <div className="mb-1 font-medium text-ink">Заметки</div>
          {blogger.notes}
        </div>
      )}
      <div className="overflow-hidden rounded-xl ring-1 ring-line focus-within:ring-2 focus-within:ring-night/20">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          placeholder="Что произошло: написали, ответил, прислал реквизиты…"
          className="rounded-none border-0! bg-transparent focus:ring-0!"
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <span className="hidden text-xs text-faint sm:inline">⌘ + Enter — отправить</span>
          <span className="sm:hidden" />
          <Button size="sm" variant="primary" loading={busy} onClick={send} disabled={!text.trim()}>
            <MessageSquare className="size-3.5" />
            Добавить комментарий
          </Button>
        </div>
      </div>

      <h3 className="mt-6 mb-3 text-[13px] font-medium text-muted">История</h3>
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Пока ничего не происходило.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {items.map((a) => {
            const who = a.actor_id ? personName(a.actor_id) : 'Импорт'
            return (
              <li key={a.id} className="relative">
                <span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-line" />
                <div className="flex items-center gap-2 text-xs text-muted">
                  {a.actor_id && <Avatar name={who} className="size-5 text-[9px]" />}
                  <span className="font-medium text-ink">{who}</span>
                  <span>{dateTime(a.created_at)}</span>
                  {a.kind === 'comment' && (a.actor_id === profile?.id || profile?.role === 'admin') && (
                    <button onClick={() => removeComment(a)} className="ml-auto text-faint hover:text-rose-700" aria-label="Удалить комментарий">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 text-[13.5px]">
                  {a.kind === 'comment' && <p className="whitespace-pre-line">{a.body}</p>}
                  {a.kind === 'status' && (
                    <p className="flex flex-wrap items-center gap-1.5">
                      {a.integration_id ? 'Интеграция:' : 'Статус:'}
                      {a.from_status && <StatusBadge status={a.from_status} className="opacity-60" />}
                      <span className="text-faint">→</span>
                      {a.to_status && <StatusBadge status={a.to_status} />}
                    </p>
                  )}
                  {a.kind === 'document' && <p className="text-muted">Добавлен документ «{a.body}»</p>}
                  {a.kind === 'created' && <p className="text-muted">Добавлен в базу{a.to_status ? ` со статусом «${statusLabel(a.to_status)}»` : ''}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function DataTab({ blogger }: { blogger: Blogger }) {
  const { patchBlogger } = useData()
  const [d, setD] = useState<BloggerDraft>(blogger)
  const [busy, setBusy] = useState(false)
  const dirty = useMemo(() => JSON.stringify(cleanBlogger(d)) !== JSON.stringify(cleanBlogger(blogger)), [d, blogger])

  async function save() {
    if (!d.nick?.trim()) return toast('Ник не может быть пустым')
    setBusy(true)
    const patch = cleanBlogger(d)
    delete patch.status
    const err = await patchBlogger(blogger.id, patch)
    setBusy(false)
    toast(err ? (err.includes('bloggers_platform_nick') ? 'Блогер с таким ником уже есть' : err) : 'Изменения сохранены')
  }

  return (
    <div className="pb-16">
      <BloggerFields d={d} set={(k, v) => setD((x) => ({ ...x, [k]: v }))} />
      <div className={cx('sticky bottom-0 -mx-6 mt-6 flex justify-end gap-2 border-t border-line bg-surface px-6 py-3', !dirty && 'hidden')}>
        <Button variant="ghost" onClick={() => setD(blogger)}>
          Отменить
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Сохранить изменения
        </Button>
      </div>
    </div>
  )
}

function IntegrationsTab({ blogger, onCount }: { blogger: Blogger; onCount: (n: number) => void }) {
  const { campaigns, pulse } = useData()
  const [items, setItems] = useState<Integration[] | null>(null)
  const [editing, setEditing] = useState<Integration | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('integrations').select('*').eq('blogger_id', blogger.id).order('publish_date', { ascending: false, nullsFirst: true })
    setItems((data as Integration[]) ?? [])
    onCount(data?.length ?? 0)
  }, [blogger.id, onCount])

  useEffect(() => {
    load()
  }, [load, pulse])

  async function setStatus(i: Integration, s: Status) {
    setItems((list) => list?.map((x) => (x.id === i.id ? { ...x, status: s } : x)) ?? null)
    const { error } = await supabase.from('integrations').update({ status: s }).eq('id', i.id)
    toast(error ? error.message : `Интеграция: ${statusInfo(s).label}`)
  }

  const total = (items ?? []).reduce((a, i) => a + (i.price ?? 0), 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{items?.length ? `Всего выходов: ${items.length}, на сумму ${money(total)}` : ''}</p>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Новая интеграция
        </Button>
      </div>
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="Интеграций пока нет">Добавьте выход, когда договоритесь о формате и цене.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => {
            const camp = campaigns.find((c) => c.id === i.campaign_id)
            const f = cpm(i.price, i.fact_reach)
            return (
              <li key={i.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(i)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditing(i)}
                  className="cursor-pointer rounded-xl p-3.5 ring-1 ring-line hover:bg-base/60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{date(i.publish_date)}</span>
                    <span className="text-sm text-muted">{camp?.name ?? 'Без кампании'}</span>
                    <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect value={i.status} onChange={(s) => setStatus(i, s)} />
                    </span>
                  </div>
                  <div className="num mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
                    <span>
                      Цена <b className="text-ink">{money(i.price)}</b>
                    </span>
                    <span>Гарант {count(i.guaranteed_reach)}</span>
                    <span>Факт {count(i.fact_reach)}</span>
                    {f && <span>CPM {money(f)}</span>}
                    {i.promo_code && <span>Промо {i.promo_code}</span>}
                    {['agreed', 'paid', 'published', 'done'].includes(i.status) && !i.erid ? (
                      <span className="text-amber-700">Нет erid</span>
                    ) : i.erid ? (
                      <span>erid есть</span>
                    ) : null}
                  </div>
                  {i.format && <div className="mt-1 text-xs text-faint">{i.format}</div>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <IntegrationFormModal open={adding} onClose={() => setAdding(false)} bloggerId={blogger.id} onSaved={load} />
      <IntegrationFormModal open={!!editing} onClose={() => setEditing(null)} initial={editing} bloggerId={blogger.id} onSaved={load} />
    </div>
  )
}
