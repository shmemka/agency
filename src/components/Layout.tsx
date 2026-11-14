import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, Clapperboard, Ellipsis, FileText, LayoutGrid, ListTodo, LogOut, Megaphone, Settings, UserRound, Users, UsersRound, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { AGENCY } from '../lib/constants'
import { rememberAgency } from '../lib/agency'
import { preloadRichEditor } from './RichEditor'
import { attention, taskOwner, type Attention } from '../lib/rules'
import { dateTime } from '../lib/format'
import { Avatar, IconButton, ITEM, ITEM_DESKTOP, Modal, POPOVER, cx } from './ui'
import { useIntegrationPanel } from './bits'
import { IntegrationPanel } from './IntegrationPanel'

const NAV = [
  { to: '/', label: 'Обзор', icon: LayoutGrid, end: true, phone: true },
  { to: '/bloggers', label: 'Блогеры', icon: Users, phone: true },
  { to: '/integrations', label: 'Интеграции', icon: Clapperboard },
  { to: '/campaigns', label: 'Кампании', icon: Megaphone },
  { to: '/tasks', label: 'Задачи', icon: ListTodo, phone: true },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays, phone: true },
  { to: '/documents', label: 'Документы', icon: FileText },
  { to: '/finance', label: 'Финансы', icon: Wallet, admin: true },
  { to: '/team', label: 'Команда', icon: UsersRound },
]

export function useAttention(): Attention[] {
  const { profile, isAdmin } = useAuth()
  const d = useData()
  return useMemo(
    () => (profile ? attention({ me: profile.id, isAdmin, integrations: d.integrations, bloggers: d.bloggers, campaigns: d.campaigns, tasks: d.tasks, settings: d.settings }) : []),
    [profile, isAdmin, d.integrations, d.bloggers, d.campaigns, d.tasks, d.settings],
  )
}

function Mark() {
  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink" aria-hidden>
      <span className="bar-lime size-2.5 rounded-full" />
    </span>
  )
}

function BellButton() {
  const { notices, reload } = useData()
  const items = useAttention()
  const { open: openIntegration } = useIntegrationPanel()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const unread = notices.filter((n) => !n.read_at)
  const n = items.length + unread.length

  const go = (link: string | null) => {
    setOpen(false)
    if (!link) return
    if (link.startsWith('?i=')) openIntegration(link.slice(3))
    else nav(link)
  }

  async function readAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    reload('notifications')
  }

  return (
    <>
      <IconButton label={n ? `Уведомления: ${n}` : 'Уведомления'} onClick={() => setOpen(true)} className="relative bg-surface">
        <Bell className="size-[18px]" strokeWidth={1.5} />
        {n > 0 && <span className="num absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[11px] text-white">{n}</span>}
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Уведомления">
        {items.length === 0 && notices.length === 0 && <p className="text-muted">Пока тихо. Здесь появятся сроки, решения клиентов и новые задачи</p>}
        {items.length > 0 && (
          <section>
            <h3 className="mb-1 text-[13px] text-muted">Требует внимания</h3>
            <ul>
              {items.map((a) => (
                <li key={a.key}>
                  <button onClick={() => go(a.link)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-soft">
                    <span className={cx('size-2 shrink-0 rounded-full', a.tone === 'bad' ? 'bg-bad' : 'bg-amber-400')} />
                    {a.text}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {notices.length > 0 && (
          <section className={cx(items.length > 0 && 'mt-4')}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[13px] text-muted">События</h3>
              {unread.length > 0 && (
                <button onClick={readAll} className="text-[13px] text-muted hover:text-ink">
                  Прочитать все
                </button>
              )}
            </div>
            <ul>
              {notices.map((x) => (
                <li key={x.id}>
                  <button
                    onClick={async () => {
                      go(x.link)
                      if (!x.read_at) {
                        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', x.id)
                        reload('notifications')
                      }
                    }}
                    className={cx('flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-soft', x.read_at && 'text-muted')}
                  >
                    <span className={cx('size-2 shrink-0 rounded-full', x.read_at ? 'bg-transparent' : 'bg-leaf')} />
                    <span className="flex-1">{x.title}</span>
                    <span className="shrink-0 text-xs text-faint">{dateTime(x.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Modal>
    </>
  )
}

export function Layout() {
  const { profile, signOut, isAdmin, team } = useAuth()
  const { tasks, settings } = useData()
  const agency = settings?.agency_name?.trim() || AGENCY
  // название агентства — во вкладке браузера и на странице входа (запоминаем для следующего раза)
  useEffect(() => preloadRichEditor(), [])
  useEffect(() => {
    document.title = agency
    rememberAgency(agency)
  }, [agency])
  const { openId, open } = useIntegrationPanel()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const nav = NAV.filter((n) => !n.admin || isAdmin)
  const current = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))
  const name = profile?.full_name || profile?.email || ''
  const myTasks = tasks.filter((t) => !t.done_at && taskOwner(t) === profile?.id).length
  const pending = isAdmin ? team.filter((t) => !t.is_active).length : 0
  const badge = (to: string) => (to === '/tasks' ? myTasks : to === '/team' ? pending : 0)

  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col p-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 pt-1 pb-6">
          <Mark />
          <span className="flex-1 text-[15px] leading-5 font-medium">{agency}</span>
          <BellButton />
        </div>
        <nav className="flex-1 space-y-0.5" aria-label="Разделы">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex h-9 items-center gap-2.5 rounded-full px-3 transition-colors duration-150', isActive ? 'bg-surface text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink')}
            >
              <n.icon className="size-[18px]" strokeWidth={1.5} />
              <span className="flex-1">{n.label}</span>
              {badge(n.to) > 0 && <span className="num text-xs text-faint">{badge(n.to)}</span>}
            </NavLink>
          ))}
        </nav>
        <UserCard name={name} avatar={profile?.avatar_url} role={isAdmin ? 'Учредитель' : 'Специалист'} onSignOut={signOut} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2.5 bg-canvas/90 px-4 backdrop-blur md:hidden">
          <Mark />
          <span className="flex-1 text-[15px] font-medium">{current?.label ?? (loc.pathname.startsWith('/profile') ? 'Мой профиль' : loc.pathname.startsWith('/settings') ? 'Настройки' : agency)}</span>
          <BellButton />
        </header>
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pt-2 pb-28 md:px-6 md:pt-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden" aria-label="Разделы">
        {nav
          .filter((n) => n.phone)
          .map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'text-ink' : 'text-faint')}>
              <n.icon className="size-5" strokeWidth={1.5} />
              {n.label}
            </NavLink>
          ))}
        <button onClick={() => setMore(true)} className={cx('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', current && !current.phone ? 'text-ink' : 'text-faint')}>
          <Ellipsis className="size-5" strokeWidth={1.5} />
          Ещё
        </button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title={name}>
        <div className="-mx-3">
          {nav
            .filter((n) => !n.phone)
            .map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] hover:bg-soft">
                <n.icon className="size-5 text-muted" strokeWidth={1.5} />
                <span className="flex-1">{n.label}</span>
                {badge(n.to) > 0 && <span className="num text-[13px] text-faint">{badge(n.to)}</span>}
              </NavLink>
            ))}
          <div className="mx-3 my-2 h-px bg-line" />
          {accountFor(isAdmin).map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] hover:bg-soft">
              <n.icon className="size-5 text-muted" strokeWidth={1.5} />
              <span className="flex-1">{n.label}</span>
            </NavLink>
          ))}
          <button onClick={signOut} className="flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-[15px] text-muted hover:bg-soft">
            <LogOut className="size-5" strokeWidth={1.5} />
            Выйти
          </button>
        </div>
      </Modal>

      {openId && <IntegrationPanel id={openId} onClose={() => open(null)} />}
    </div>
  )
}

const ACCOUNT = [
  { to: '/profile', label: 'Мой профиль', icon: UserRound },
  // настройки агентства меняют только учредители: специалисту там нечего делать
  { to: '/settings', label: 'Настройки', icon: Settings, admin: true },
]
const accountFor = (isAdmin: boolean) => ACCOUNT.filter((a) => !a.admin || isAdmin)

/** Карточка пользователя внизу сайдбара: при наведении или по клику открывает меню аккаунта */
function UserCard({ name, avatar, role, onSignOut }: { name: string; avatar?: string | null; role: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  const { isAdmin } = useAuth()
  const here = ACCOUNT.some((a) => loc.pathname.startsWith(a.to))

  const show = () => {
    window.clearTimeout(timer.current)
    setOpen(true)
  }
  const hide = (delay = 160) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), delay)
  }

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', out)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', out)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div
      ref={box}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={() => hide()}
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && hide(0)}
    >
      {open && (
        // pb-1.5 — невидимый мостик: курсор доходит до меню, не покидая блок
        <div className="absolute inset-x-0 bottom-full pb-1.5">
          <div role="menu" aria-label="Аккаунт" className={cx('fade', POPOVER)}>
            {accountFor(isAdmin).map((a) => (
              <NavLink key={a.to} to={a.to} role="menuitem" className={({ isActive }) => cx(ITEM, ITEM_DESKTOP, 'gap-2.5 transition-colors duration-150 hover:bg-soft', isActive && 'bg-soft')}>
                <a.icon className="size-4 shrink-0 text-muted" strokeWidth={1.5} />
                {a.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <div className={cx('flex items-center gap-2.5 rounded-inner bg-surface p-2 transition-shadow duration-150', (open || here) && 'ring-1 ring-ink/10')}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : show())}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl text-left focus-visible:outline-offset-4"
        >
          <Avatar name={name} src={avatar} />
          <span className="min-w-0 flex-1 leading-4">
            <span className="block truncate text-[13px]">{name}</span>
            <span className="block text-xs text-faint">{role}</span>
          </span>
        </button>
        <IconButton label="Выйти" onClick={onSignOut} className="size-8">
          <LogOut className="size-4" strokeWidth={1.5} />
        </IconButton>
      </div>
    </div>
  )
}
