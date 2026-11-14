import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, Check, ChevronsUpDown, Clapperboard, Ellipsis, Plus, FileText, LayoutGrid, ListTodo, LogOut, Megaphone, Settings, UserRound, Users, UsersRound, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { APP } from '../lib/constants'
import { toast } from '../lib/toast'
import { promptDialog } from './dialogs'
import { preloadRichEditor } from './RichEditor'
import { attention, taskOwner, type Attention } from '../lib/rules'
import { dateTime } from '../lib/format'
import { Avatar, IconButton, ITEM, ITEM_DESKTOP, Loading, Modal, POPOVER, Skel, cx } from './ui'
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

async function newWorkspace(create: (name: string) => Promise<string | null>) {
  const name = await promptDialog({
    title: 'Новый кабинет',
    body: 'Отдельное агентство со своими блогерами, кампаниями и командой. Вы будете в нём учредителем',
    label: 'Название агентства',
    ok: 'Создать',
    required: true,
  })
  if (!name?.trim()) return
  const err = await create(name.trim())
  if (err) toast(err)
}

/** Название кабинета в сайдбаре: по клику — мои кабинеты и «Создать кабинет», как в Notion */
function WorkspaceMenu({ name }: { name: string }) {
  const { workspaces, workspace, switchWorkspace, createWorkspace } = useAuth()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

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
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx('group flex w-full min-w-0 items-center gap-1 rounded-xl py-1 pr-1 pl-1 text-left hover:bg-ink/5', open && 'bg-ink/5')}
        title="Кабинеты"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] leading-5 font-medium">{name}</span>
        {/* стрелка — только при наведении: в узком сайдбаре место нужно названию */}
        <ChevronsUpDown className={cx('size-3.5 shrink-0 text-faint group-hover:block group-focus-visible:block', open ? 'block' : 'hidden')} strokeWidth={1.5} />
      </button>
      {open && (
        <div role="menu" aria-label="Кабинеты" className={cx('fade absolute top-full left-0 z-40 mt-1.5 w-64', POPOVER)}>
          {workspaces.map((w) => (
            <button
              key={w.id}
              role="menuitem"
              className={cx(ITEM, ITEM_DESKTOP, 'gap-2.5 hover:bg-soft', !w.is_active && 'text-muted')}
              onClick={async () => {
                setOpen(false)
                if (w.id === workspace?.id) return
                const err = await switchWorkspace(w.id)
                if (err) toast(err)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {!w.is_active && <span className="shrink-0 text-xs text-faint">{w.deactivated_at ? 'закрыт' : 'ждёт доступа'}</span>}
              {w.id === workspace?.id && <Check className="size-4 shrink-0" strokeWidth={1.5} />}
            </button>
          ))}
          <div className="mx-2.5 my-1 h-px bg-line" />
          <button
            role="menuitem"
            className={cx(ITEM, ITEM_DESKTOP, 'gap-2.5 text-muted hover:bg-soft hover:text-ink')}
            onClick={() => {
              setOpen(false)
              newWorkspace(createWorkspace)
            }}
          >
            <Plus className="size-4 shrink-0" strokeWidth={1.5} />
            Создать кабинет
          </button>
        </div>
      )}
    </div>
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
        {/* новое уведомление — счётчик подпрыгивает */}
        {n > 0 && (
          <span key={n} className="bump num absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[11px] text-white">
            {n}
          </span>
        )}
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
  const { profile, signOut, isAdmin, team, workspace, workspaces, switchWorkspace, createWorkspace } = useAuth()
  const { tasks } = useData()
  const agency = workspace?.name ?? APP
  // во вкладке браузера — агентство и сайт
  useEffect(() => preloadRichEditor(), [])
  useEffect(() => {
    document.title = `${agency} — ${APP}`
  }, [agency])
  const { openId, open } = useIntegrationPanel()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const nav = NAV.filter((n) => !n.admin || isAdmin)
  const current = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))
  const name = profile?.full_name || profile?.email || ''
  const myTasks = tasks.filter((t) => !t.done_at && taskOwner(t) === profile?.id).length
  const pending = isAdmin ? team.filter((t) => !t.is_active && !t.deactivated_at).length : 0
  const badge = (to: string) => (to === '/tasks' ? myTasks : to === '/team' ? pending : 0)
  const seg = loc.pathname.split('/').filter(Boolean)
  const pageKey = seg[0] === 'campaigns' && seg[1] ? `campaigns/${seg[1]}` : (seg[0] ?? '')

  const navBox = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ y: number; animate: boolean } | null>(null)
  useLayoutEffect(() => {
    const a = navBox.current?.querySelector<HTMLElement>('a[aria-current="page"]')
    setPill((p) => (a ? { y: a.offsetTop, animate: !!p } : null))
  }, [loc.pathname, nav.length])

  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col p-4 md:flex">
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-6">
          <Mark />
          <WorkspaceMenu name={agency} />
          <BellButton />
        </div>
        <nav ref={navBox} className="relative flex-1 space-y-0.5" aria-label="Разделы">
          {/* белая подложка переезжает к выбранному разделу */}
          {pill && <span aria-hidden className={cx('absolute inset-x-0 top-0 h-9 rounded-full bg-surface', pill.animate && 'transition-transform duration-300 ease-[var(--ease-out)]')} style={{ transform: `translateY(${pill.y}px)` }} />}
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('relative flex h-9 items-center gap-2.5 rounded-full px-3 transition-colors duration-150', isActive ? cx('text-ink', !pill && 'bg-surface') : 'text-muted hover:bg-ink/5 hover:text-ink')}
            >
              <n.icon className="size-[18px]" strokeWidth={1.5} />
              <span className="flex-1">{n.label}</span>
              {badge(n.to) > 0 && (
                <span key={badge(n.to)} className="appear num text-xs text-faint">
                  {badge(n.to)}
                </span>
              )}
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
          {/* новая страница чуть всплывает; карточки блогера и задачи открываются поверх и страницу не перерисовывают */}
          <div key={pageKey} className="page-in">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden" aria-label="Разделы">
        {nav
          .filter((n) => n.phone)
          .map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-[color,transform] duration-150 active:scale-95', isActive ? 'text-ink' : 'text-faint')}>
              <n.icon className="size-5" strokeWidth={1.5} />
              {n.label}
            </NavLink>
          ))}
        <button onClick={() => setMore(true)} className={cx('flex h-14 flex-1 flex-col transition-[color,transform] duration-150 active:scale-95 items-center justify-center gap-0.5 text-[11px]', current && !current.phone ? 'text-ink' : 'text-faint')}>
          <Ellipsis className="size-5" strokeWidth={1.5} />
          Ещё
        </button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title={name}>
        <div className="-mx-3">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={async () => {
                if (w.id === workspace?.id) return setMore(false)
                const err = await switchWorkspace(w.id)
                if (err) toast(err)
              }}
              className={cx('flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] hover:bg-soft', !w.is_active && 'text-muted')}
            >
              <span className="flex size-5 items-center justify-center">{w.id === workspace?.id && <Check className="size-5" strokeWidth={1.5} />}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {!w.is_active && <span className="text-[13px] text-faint">{w.deactivated_at ? 'закрыт' : 'ждёт доступа'}</span>}
            </button>
          ))}
          <button
            onClick={() => {
              setMore(false)
              newWorkspace(createWorkspace)
            }}
            className="flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-[15px] text-muted hover:bg-soft"
          >
            <Plus className="size-5" strokeWidth={1.5} />
            Создать кабинет
          </button>
          <div className="mx-3 my-2 h-px bg-line" />
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

/** Каркас кабинета, пока проверяем вход: боковое меню и место под страницу */
export function ShellSkeleton() {
  return (
    <Loading className="flex min-h-full" label="Открываем кабинет">
      <aside className="hidden h-screen w-60 shrink-0 flex-col p-4 md:flex">
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-6">
          <Mark />
          <Skel className="ml-1 h-3.5 w-24" />
        </div>
        <div className="space-y-0.5">
          {[64, 72, 88, 76, 60, 80, 84, 68].map((w, i) => (
            <div key={i} className="flex h-9 items-center gap-2.5 px-3">
              <Skel className="size-[18px] rounded-md" />
              <Skel className="h-3" style={{ width: w }} />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex-1 px-4 pt-16 md:px-6 md:pt-8">
        <Skel className="h-8 w-56" />
        <Skel className="mt-3 h-3.5 w-72 max-w-full" />
      </div>
    </Loading>
  )
}
