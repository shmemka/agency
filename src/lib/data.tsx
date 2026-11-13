import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAll, supabase } from './supabase'
import { useAuth } from '../auth/AuthProvider'
import { statusInfo, type Status } from './constants'
import { transitionWarnings, type DocLite } from './rules'
import { toast } from './toast'
import type { Blogger, BloggerList, BloggerListItem, Campaign, Client, Integration, Notice, Settings, ShareLink, Task, TaskSection } from './types'
import { confirmDialog } from '../components/dialogs'

type TableName = 'bloggers' | 'blogger_lists' | 'blogger_list_items' | 'integrations' | 'campaigns' | 'clients' | 'tasks' | 'task_sections' | 'notifications' | 'documents' | 'campaign_members' | 'share_links' | 'campaign_money' | 'settings'

interface DataState {
  bloggers: Blogger[]
  integrations: Integration[]
  campaigns: Campaign[]
  clients: Client[]
  tasks: Task[]
  sections: TaskSection[]
  lists: BloggerList[]
  listItems: BloggerListItem[]
  notices: Notice[]
  docs: DocLite[]
  members: { campaign_id: string; profile_id: string }[]
  links: ShareLink[]
  budgets: Record<string, number | null>
  settings: Settings | null
  loading: boolean
  error: string | null
  /** меняется при любом событии в ленте — карточки перечитывают историю */
  pulse: number
  reload: (...t: TableName[]) => Promise<void>
  patchBlogger: (id: string, patch: Partial<Blogger>) => Promise<string | null>
  patchIntegration: (id: string, patch: Partial<Integration>) => Promise<string | null>
  /** смена этапа с проверкой правил; false — пользователь передумал */
  moveIntegration: (i: Integration, to: Status) => Promise<boolean>
  blogger: (id: string | null | undefined) => Blogger | undefined
  campaign: (id: string | null | undefined) => Campaign | undefined
}

const Ctx = createContext<DataState | null>(null)
const q = <T,>(table: string, order: string, asc = false, cols = '*') =>
  fetchAll<T>((f, t) => supabase.from(table).select(cols).order(order, { ascending: asc }).range(f, t) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>)

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  const [s, setS] = useState({
    bloggers: [] as Blogger[],
    integrations: [] as Integration[],
    campaigns: [] as Campaign[],
    clients: [] as Client[],
    tasks: [] as Task[],
    sections: [] as TaskSection[],
    lists: [] as BloggerList[],
    listItems: [] as BloggerListItem[],
    notices: [] as Notice[],
    docs: [] as DocLite[],
    members: [] as { campaign_id: string; profile_id: string }[],
    links: [] as ShareLink[],
    budgets: {} as Record<string, number | null>,
    settings: null as Settings | null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)
  const timers = useRef<Record<string, number>>({})

  const loadOne = useCallback(
    async (t: TableName) => {
      switch (t) {
        case 'bloggers':
          return { bloggers: await q<Blogger>('bloggers', 'updated_at') }
        case 'integrations':
          return { integrations: await q<Integration>('integrations', 'updated_at') }
        case 'campaigns':
          return { campaigns: await q<Campaign>('campaigns', 'created_at') }
        case 'clients':
          return { clients: await q<Client>('clients', 'name', true) }
        case 'tasks':
          return { tasks: await q<Task>('tasks', 'created_at') }
        // до миграции 010 таблиц нет: тогда списков просто не видно
        case 'blogger_lists': {
          const { data } = await supabase.from('blogger_lists').select('*').order('position')
          return { lists: (data ?? []) as BloggerList[] }
        }
        case 'blogger_list_items': {
          try {
            return { listItems: await q<BloggerListItem>('blogger_list_items', 'added_at', false, 'list_id,blogger_id') }
          } catch {
            return { listItems: [] as BloggerListItem[] }
          }
        }
        case 'task_sections': {
          // до миграции 008 таблицы нет: доска покажет подсказку, остальной сайт работает
          const { data } = await supabase.from('task_sections').select('*').order('position')
          return { sections: (data ?? []) as TaskSection[] }
        }
        case 'notifications':
          return { notices: ((await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)).data ?? []) as Notice[] }
        case 'documents':
          return { docs: await q<DocLite>('documents', 'created_at', false, 'id,integration_id,blogger_id,campaign_id,kind') }
        case 'campaign_members':
          return { members: ((await supabase.from('campaign_members').select('campaign_id,profile_id')).data ?? []) as { campaign_id: string; profile_id: string }[] }
        case 'share_links':
          return { links: ((await supabase.from('share_links').select('*').order('created_at', { ascending: false })).data ?? []) as ShareLink[] }
        case 'campaign_money': {
          if (!isAdmin) return {}
          const rows = ((await supabase.from('campaign_money').select('*')).data ?? []) as { campaign_id: string; budget: number | null }[]
          return { budgets: Object.fromEntries(rows.map((r) => [r.campaign_id, r.budget])) }
        }
        case 'settings':
          return { settings: ((await supabase.from('settings').select('*').maybeSingle()).data ?? null) as Settings | null }
      }
    },
    [isAdmin],
  )

  const reload = useCallback(
    async (...tables: TableName[]) => {
      try {
        const parts = await Promise.all(tables.map(loadOne))
        setS((prev) => Object.assign({}, prev, ...parts))
        setError(null)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [loadOne],
  )

  // сначала то, без чего не нарисовать экран; документы, ссылки, уведомления и деньги догружаются следом и не держат загрузку
  useEffect(() => {
    reload('bloggers', 'blogger_lists', 'blogger_list_items', 'integrations', 'campaigns', 'clients', 'tasks', 'task_sections', 'settings').then(() => {
      setLoading(false)
      reload('notifications', 'documents', 'campaign_members', 'share_links', 'campaign_money')
    })
  }, [reload])

  // вкладка долго была в фоне — живые обновления могли потеряться (сон ноутбука, VPN): перечитываем всё один раз
  useEffect(() => {
    let hiddenAt = 0
    const on = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) reload('bloggers', 'blogger_lists', 'blogger_list_items', 'integrations', 'campaigns', 'tasks', 'task_sections', 'notifications', 'documents', 'share_links')
    }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [reload])

  // живые обновления: изменения коллег и клиента приходят сами
  useEffect(() => {
    const later = (t: TableName) => () => {
      window.clearTimeout(timers.current[t])
      timers.current[t] = window.setTimeout(() => reload(t), 500)
    }
    // большие таблицы не перекачиваем целиком на каждую правку коллеги: меняем одну строку из события
    const patchRow =
      (key: 'bloggers' | 'integrations' | 'tasks') =>
      (e: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setS((prev) => {
          const list = prev[key] as { id: string }[]
          if (e.eventType === 'DELETE') return { ...prev, [key]: list.filter((r) => r.id !== e.old.id) }
          const row = e.new as { id: string }
          if (!row?.id) return prev
          const at = list.findIndex((r) => r.id === row.id)
          return { ...prev, [key]: at < 0 ? [row, ...list] : list.map((r, k) => (k === at ? row : r)) }
        })
      }
    let ch = supabase.channel('crm-live')
    for (const key of ['bloggers', 'integrations', 'tasks'] as const) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: key }, patchRow(key))
    }
    for (const t of ['blogger_lists', 'blogger_list_items', 'campaigns', 'task_sections', 'notifications', 'documents'] as TableName[]) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, later(t))
    }
    ch = ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, () => setPulse((p) => p + 1))
    ch.subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [reload])

  const patchBlogger = useCallback(
    async (id: string, patch: Partial<Blogger>) => {
      setS((p) => ({ ...p, bloggers: p.bloggers.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
      const { data, error } = await supabase.from('bloggers').update(patch).eq('id', id).select().single()
      if (error) {
        await reload('bloggers')
        return error.message
      }
      setS((p) => ({ ...p, bloggers: p.bloggers.map((b) => (b.id === id ? (data as Blogger) : b)) }))
      setPulse((p) => p + 1)
      return null
    },
    [reload],
  )

  const patchIntegration = useCallback(
    async (id: string, patch: Partial<Integration>) => {
      setS((p) => ({ ...p, integrations: p.integrations.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
      const { data, error } = await supabase.from('integrations').update(patch).eq('id', id).select().single()
      if (error) {
        await reload('integrations')
        return error.message
      }
      setS((p) => ({ ...p, integrations: p.integrations.map((i) => (i.id === id ? (data as Integration) : i)) }))
      setPulse((p) => p + 1)
      if (patch.status === 'published' || patch.status === 'done') reload('bloggers')
      // статус кампании база пересчитывает сама по решениям клиента и статусам интеграций
      if (patch.status || patch.client_decision || 'campaign_id' in patch) reload('campaigns')
      return null
    },
    [reload],
  )

  const moveIntegration = useCallback(
    async (i: Integration, to: Status) => {
      if (i.status === to) return false
      const b = s.bloggers.find((x) => x.id === i.blogger_id)
      const warns = transitionWarnings(i, b, s.docs, to)
      if (warns.length && !(await confirmDialog({ title: `Перевести в «${statusInfo(to).label}»?`, body: 'Не всё готово для этого этапа', items: warns, ok: 'Всё равно перевести' }))) return false
      const err = await patchIntegration(i.id, { status: to })
      toast(err ? `Не удалось сменить этап: ${err}` : `${b?.nick ?? 'Интеграция'}: ${statusInfo(to).label}`)
      return !err
    },
    [s.bloggers, s.docs, patchIntegration],
  )

  const value = useMemo<DataState>(
    () => ({
      ...s,
      loading,
      error,
      pulse,
      reload,
      patchBlogger,
      patchIntegration,
      moveIntegration,
      blogger: (id) => (id ? s.bloggers.find((b) => b.id === id) : undefined),
      campaign: (id) => (id ? s.campaigns.find((c) => c.id === id) : undefined),
    }),
    [s, loading, error, pulse, reload, patchBlogger, patchIntegration, moveIntegration],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}
