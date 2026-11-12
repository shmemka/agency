import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAll, supabase } from './supabase'
import type { Blogger, Campaign, Client } from './types'

interface DataState {
  bloggers: Blogger[]
  campaigns: Campaign[]
  clients: Client[]
  loading: boolean
  error: string | null
  /** Счётчик — меняется при любых изменениях интеграций/ленты у коллег */
  pulse: number
  reloadBloggers: () => Promise<void>
  reloadCampaigns: () => Promise<void>
  patchBlogger: (id: string, patch: Partial<Blogger>) => Promise<string | null>
  bloggerById: (id: string | null | undefined) => Blogger | undefined
}

const Ctx = createContext<DataState | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [bloggers, setBloggers] = useState<Blogger[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  const reloadBloggers = useCallback(async () => {
    try {
      const rows = await fetchAll<Blogger>((from, to) =>
        supabase.from('bloggers').select('*').order('updated_at', { ascending: false }).range(from, to),
      )
      setBloggers(rows)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const reloadCampaigns = useCallback(async () => {
    const [c, cl] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
    ])
    setCampaigns((c.data as Campaign[]) ?? [])
    setClients((cl.data as Client[]) ?? [])
  }, [])

  useEffect(() => {
    ;(async () => {
      await Promise.all([reloadBloggers(), reloadCampaigns()])
      setLoading(false)
    })()
  }, [reloadBloggers, reloadCampaigns])

  // Живые обновления: если коллега поменял статус — список обновится сам
  useEffect(() => {
    const ch = supabase
      .channel('crm-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bloggers' }, () => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => reloadBloggers(), 400)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integrations' }, () => setPulse((p) => p + 1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, () => setPulse((p) => p + 1))
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [reloadBloggers])

  const patchBlogger = useCallback(async (id: string, patch: Partial<Blogger>) => {
    setBloggers((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    const { data, error } = await supabase.from('bloggers').update(patch).eq('id', id).select().single()
    if (error) {
      await reloadBloggers()
      return error.message
    }
    setBloggers((list) => list.map((b) => (b.id === id ? (data as Blogger) : b)))
    setPulse((p) => p + 1)
    return null
  }, [reloadBloggers])

  const value = useMemo<DataState>(
    () => ({
      bloggers,
      campaigns,
      clients,
      loading,
      error,
      pulse,
      reloadBloggers,
      reloadCampaigns,
      patchBlogger,
      bloggerById: (id) => (id ? bloggers.find((b) => b.id === id) : undefined),
    }),
    [bloggers, campaigns, clients, loading, error, pulse, reloadBloggers, reloadCampaigns, patchBlogger],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}
