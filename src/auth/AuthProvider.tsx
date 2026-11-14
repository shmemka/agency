import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { siteUrl, supabase } from '../lib/supabase'
import type { Profile, Workspace } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  team: Profile[]
  loading: boolean
  /** профиль не загрузился (нет связи, VPN, Supabase недоступен) — это не то же самое, что «нет доступа» */
  profileError: string | null
  /** пришли по ссылке «Забыли пароль?» — нужно задать новый */
  recovery: boolean
  endRecovery: () => void
  isAdmin: boolean
  /** все мои кабинеты и тот, в котором я сейчас */
  workspaces: Workspace[]
  workspace: Workspace | null
  /** переключиться, создать или войти по приглашению; возвращает текст ошибки */
  switchWorkspace: (id: string) => Promise<string | null>
  createWorkspace: (name: string) => Promise<string | null>
  joinWorkspace: (token: string) => Promise<string | null>
  reloadTeam: () => Promise<void>
  reloadProfile: () => Promise<boolean>
  signOut: () => Promise<void>
  personName: (id: string | null | undefined) => string
  personAvatar: (id: string | null | undefined) => string | null
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      // тот же пользователь — не трогаем состояние, чтобы сайт не перерисовывался целиком
      setSession((prev) => (prev && s && prev.user.id === s.user.id && prev.access_token === s.access_token ? prev : s))
      if (!s) {
        setProfile(null)
        setWorkspaces([])
        setTeam([])
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  /** Профиль и кабинеты. true — если сами выбрали кабинет (команду тогда нужно загрузить заново) */
  const reloadProfile = useCallback(async (): Promise<boolean> => {
    const uid = session?.user.id
    if (!uid) return false
    try {
      // не ждём бесконечно: при плохой связи через 8 секунд показываем «Нет связи», а не крутим загрузку
      const [pr, wr] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, avatar_url, created_at, current_workspace_id').eq('id', uid).abortSignal(AbortSignal.timeout(8000)).maybeSingle(),
        supabase.rpc('my_workspaces').abortSignal(AbortSignal.timeout(8000)),
      ])
      const error = pr.error ?? wr.error
      if (error) throw new Error(/abort|timeout/i.test(error.message) ? 'База не ответила за 8 секунд' : error.message)
      const ws = (wr.data ?? []) as Workspace[]
      let p = pr.data as (Omit<Profile, 'role' | 'is_active'> & { current_workspace_id: string | null }) | null
      let switched = false
      // кабинет не выбран (например, закрыли доступ в прошлом), а другие есть — заходим в первый открытый
      if (p && !ws.some((w) => w.id === p!.current_workspace_id) && ws.length) {
        const next = ws.find((w) => w.is_active) ?? ws[0]
        const { error: e } = await supabase.rpc('switch_workspace', { p_ws: next.id })
        if (!e) {
          p = { ...p, current_workspace_id: next.id }
          switched = true
        }
      }
      const cur = ws.find((w) => w.id === p?.current_workspace_id)
      setWorkspaces(ws)
      setProfile(p ? { ...p, role: cur?.role ?? 'manager', is_active: !!cur?.is_active, deactivated_at: cur?.deactivated_at ?? null } : null)
      setProfileError(null)
      return switched
    } catch (e) {
      // профиль, который уже был, не стираем: при обрыве связи сайт продолжает работать
      setProfileError((e as Error).message || 'Нет связи с базой')
      return false
    }
  }, [session?.user.id])

  const reloadTeam = useCallback(async () => {
    // команда текущего кабинета: люди с ролью и доступом именно в нём
    const { data } = await supabase.from('team').select('*').order('created_at').abortSignal(AbortSignal.timeout(8000))
    setTeam((data as Profile[]) ?? [])
  }, [])

  // Supabase присылает новую сессию при каждом возврате на вкладку и обновлении токена.
  // Перезагружаем профиль только когда сменился сам пользователь, иначе весь сайт пересобирался и терял черновики
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const [switched] = await Promise.all([reloadProfile(), reloadTeam()])
      if (switched) await reloadTeam()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [uid, reloadProfile, reloadTeam])

  // Кабинет переключили в другой вкладке: эта показывает старый, а сохраняла бы уже в новый. Перезагружаем её
  const wsId = profile?.current_workspace_id ?? null
  useEffect(() => {
    if (!uid || !wsId) return
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.from('profiles').select('current_workspace_id').eq('id', uid).maybeSingle()
      if (data && data.current_workspace_id !== wsId) window.location.replace(siteUrl())
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [uid, wsId])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      team,
      loading,
      profileError,
      recovery,
      endRecovery: () => setRecovery(false),
      isAdmin: profile?.role === 'admin' && profile.is_active,
      workspaces,
      workspace: workspaces.find((w) => w.id === profile?.current_workspace_id) ?? null,
      // после смены кабинета начинаем с чистого листа: все данные, подписки и открытые карточки — из нового кабинета
      switchWorkspace: async (id) => {
        const { error } = await supabase.rpc('switch_workspace', { p_ws: id })
        if (error) return error.message
        window.location.replace(siteUrl())
        return null
      },
      createWorkspace: async (name) => {
        const { error } = await supabase.rpc('create_workspace', { p_name: name })
        if (error) return error.message
        window.location.replace(siteUrl())
        return null
      },
      joinWorkspace: async (token) => {
        const { error } = await supabase.rpc('join_workspace', { p_token: token })
        if (error) return error.message
        window.location.replace(siteUrl())
        return null
      },
      reloadTeam,
      reloadProfile,
      signOut: async () => {
        await supabase.auth.signOut()
      },
      personName: (id) => {
        if (!id) return '—'
        const p = team.find((t) => t.id === id)
        return p?.full_name || p?.email || '—'
      },
      personAvatar: (id) => (id ? (team.find((t) => t.id === id)?.avatar_url ?? null) : null),
    }),
    [session, profile, workspaces, team, loading, profileError, recovery, reloadTeam, reloadProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
