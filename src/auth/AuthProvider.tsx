import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  team: Profile[]
  loading: boolean
  isAdmin: boolean
  reloadTeam: () => Promise<void>
  reloadProfile: () => Promise<void>
  signOut: () => Promise<void>
  personName: (id: string | null | undefined) => string
  personAvatar: (id: string | null | undefined) => string | null
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [team, setTeam] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setTeam([])
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const reloadProfile = useCallback(async () => {
    const uid = session?.user.id
    if (!uid) return
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile((data as Profile) ?? null)
  }, [session?.user.id])

  const reloadTeam = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setTeam((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    ;(async () => {
      setLoading(true)
      await reloadProfile()
      await reloadTeam()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [session, reloadProfile, reloadTeam])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      team,
      loading,
      isAdmin: profile?.role === 'admin' && profile.is_active,
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
    [session, profile, team, loading, reloadTeam, reloadProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
