import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FileText, LayoutGrid, LogOut, Megaphone, Menu, PlaySquare, Users, UsersRound, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { Avatar, cx } from './ui'

const NAV = [
  { to: '/', label: 'Обзор', icon: LayoutGrid, end: true },
  { to: '/bloggers', label: 'Блогеры', icon: Users },
  { to: '/integrations', label: 'Интеграции', icon: PlaySquare },
  { to: '/campaigns', label: 'Клиенты и кампании', icon: Megaphone },
  { to: '/documents', label: 'Документы', icon: FileText },
  { to: '/team', label: 'Команда', icon: UsersRound },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#2f3770" />
        <rect x="8" y="9" width="5" height="14" rx="2.5" fill="#E4387B" />
        <rect x="15" y="9" width="5" height="9" rx="2.5" fill="#fff" />
        <rect x="22" y="9" width="3" height="5" rx="1.5" fill="#fff" opacity=".55" />
      </svg>
      <div className="leading-tight">
        <div className="font-display text-[13px] font-semibold tracking-tight text-white">Агентство</div>
        <div className="text-[11px] text-white/50">работа с блогерами</div>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut, team, isAdmin } = useAuth()
  const { bloggers } = useData()
  const pending = isAdmin ? team.filter((t) => !t.is_active).length : 0
  const name = profile?.full_name || profile?.email || ''

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Разделы">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors',
                isActive ? 'bg-white/[0.12] font-medium text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <n.icon className={cx('size-[17px]', isActive ? 'text-accent' : 'text-white/45 group-hover:text-white/70')} />
                <span className="flex-1">{n.label}</span>
                {n.to === '/bloggers' && bloggers.length > 0 && <span className="num text-[11px] text-white/40">{bloggers.length}</span>}
                {n.to === '/team' && pending > 0 && (
                  <span className="num rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white" title="Ждут подтверждения">
                    {pending}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-2.5">
        <Avatar name={name} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-white">{name}</div>
          <div className="text-[11px] text-white/45">{profile?.role === 'admin' ? 'Админ' : 'Специалист'}</div>
        </div>
        <button onClick={signOut} className="rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Выйти" title="Выйти">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))

  return (
    <div className="flex h-full">
      <aside className="hidden w-[244px] shrink-0 bg-night lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-night/40" onClick={() => setOpen(false)} />
          <aside className="drawer-in absolute top-0 left-0 h-full w-[260px] bg-night">
            <button className="absolute top-4 right-3 rounded-md p-1.5 text-white/60 hover:text-white" onClick={() => setOpen(false)} aria-label="Закрыть меню">
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-base" aria-label="Открыть меню">
            <Menu className="size-5" />
          </button>
          <span className="font-medium">{current?.label}</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
