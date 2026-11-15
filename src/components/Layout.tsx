import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, ChevronDown, Ellipsis, Plus, FileText, LayoutGrid, Handshake, ListTodo, LogOut, Settings, UserRound, Users, UsersRound, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { APP } from '../lib/constants'
import { toast } from '../lib/toast'
import { promptDialog } from './dialogs'
import { preloadRichEditor } from './RichEditor'
import { attention, taskOwner, type Attention } from '../lib/rules'
import { dateTime, plural } from '../lib/format'
import { Avatar, IconButton, ITEM, ITEM_DESKTOP, Loading, Modal, POPOVER, Skel, cx } from './ui'
import { useIntegrationPanel } from './bits'
import { UpgradeButton, WorkspaceTile } from './Workspace'
import { applyBrand } from '../lib/brand'
import { IntegrationPanel } from './IntegrationPanel'
import { isSettings, useSettingsBackground } from '../lib/settingsNav'

const NAV = [
  { to: '/', label: 'Обзор', icon: LayoutGrid, end: true, phone: true },
  { to: '/bloggers', label: 'Блогеры', icon: Users, phone: true },
  // «Работа» - сделки с клиентами и доска интеграций по этапам
  { to: '/work', label: 'Работа', icon: Handshake, phone: true },
  { to: '/tasks', label: 'Задачи', icon: ListTodo, phone: true },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
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

/** Логотип агентства из настроек кабинета: по высоте значка, длинный - до ширины меню */
export function BrandLogo({ src, name, className }: { src: string; name: string; className?: string }) {
  return <img src={src} alt={name} title={name} className={cx('h-8 w-auto max-w-36 min-w-0 object-contain object-left', className)} />
}

/** Значок кабинета рядом с названием: аватарка кабинета, а без неё - знак «Сверки» */
export function Mark({ src }: { src?: string | null }) {
  if (src) return <img src={src} alt="" aria-hidden className="size-8 shrink-0 rounded-full object-cover" />
  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink" aria-hidden>
      <span className="bar-lime size-2.5 rounded-full" />
    </span>
  )
}

async function newWorkspace(create: (name: string) => Promise<string | null>) {
  const name = await promptDialog({
    title: 'Новый кабинет',
    body: 'Отдельное агентство со своими блогерами, сделками и командой. Вы будете в нём учредителем',
    label: 'Название агентства',
    ok: 'Создать',
    required: true,
  })
  if (!name?.trim()) return
  const err = await create(name.trim())
  if (err) toast(err)
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
  const logo = workspace?.logo_url || null
  // брендовый цвет кабинета вместо зелёного; страницы для клиентов остаются в цветах «Сверки»
  useEffect(() => {
    applyBrand(workspace?.brand_color)
    return () => applyBrand(null)
  }, [workspace?.brand_color])
  // во вкладке браузера — агентство и сайт
  useEffect(() => preloadRichEditor(), [])
  useEffect(() => {
    document.title = `${agency} - ${APP}`
  }, [agency])
  const { openId, open } = useIntegrationPanel()
  // под окном настроек показывается прежняя страница: меню и прокрутка - как у неё
  const real = useLocation()
  const loc = useSettingsBackground() ?? real
  const [more, setMore] = useState(false)
  const nav = NAV.filter((n) => !n.admin || isAdmin)
  const current = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))
  const name = profile?.full_name || profile?.email || ''
  const myTasks = tasks.filter((t) => !t.done_at && taskOwner(t) === profile?.id).length
  const pending = isAdmin ? team.filter((t) => !t.is_active && !t.deactivated_at).length : 0
  const badge = (to: string) => (to === '/tasks' ? myTasks : to === '/team' ? pending : 0)
  const seg = loc.pathname.split('/').filter(Boolean)
  const pageKey = seg[0] === 'campaigns' && seg[1] ? `campaigns/${seg[1]}` : (seg[0] ?? '')

  // новая страница открывается с начала, а не с того места, где листали прошлую
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pageKey])

  // шапка на телефоне: наверху — название агентства, после прокрутки — название страницы, как в iOS
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 56)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const pageLabel = current?.label ?? (loc.pathname.startsWith('/profile') ? 'Мой профиль' : loc.pathname.startsWith('/settings') ? 'Настройки кабинета' : agency)

  const navBox = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ y: number; animate: boolean } | null>(null)
  useLayoutEffect(() => {
    const a = navBox.current?.querySelector<HTMLElement>('a[aria-current="page"]')
    setPill((p) => (a ? { y: a.offsetTop, animate: !!p } : null))
  }, [loc.pathname, nav.length])

  return (
    <div className="flex min-h-full">
      {/* z-30: липкий сайдбар - отдельный слой, и без него меню кабинетов уходило под поиск страницы.
          Выше содержимого, но ниже панелей (z-50), окон (z-60) и плашки массовых действий (z-40) */}
      <aside className="no-print sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col p-4 md:flex">
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-6">
          {/* кабинеты переключаются в меню профиля внизу сайдбара */}
          {logo ? (
            <span className="flex min-w-0 flex-1">
              <BrandLogo src={logo} name={agency} />
            </span>
          ) : (
            <>
              <Mark src={workspace?.avatar_url} />
              <span className="min-w-0 flex-1 truncate pl-1 text-[15px] leading-5 font-medium" title={agency}>
                {agency}
              </span>
            </>
          )}
          <BellButton />
        </div>
        <nav ref={navBox} className="relative flex-1 space-y-0.5" aria-label="Разделы">
          {/* белая подложка переезжает к выбранному разделу */}
          {pill && <span aria-hidden className={cx('absolute inset-x-0 top-0 h-9 rounded-full bg-surface', pill.animate && 'transition-transform duration-450 ease-[var(--ease-out)]')} style={{ transform: `translateY(${pill.y}px)` }} />}
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
        <UserCard name={name} email={profile?.email ?? ''} avatar={profile?.avatar_url} role={isAdmin ? 'Учредитель' : 'Специалист'} onSignOut={signOut} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cx('no-print sticky top-0 z-30 flex h-14 items-center gap-2.5 bg-canvas/85 px-4 backdrop-blur-md transition-shadow duration-300 md:hidden', scrolled && 'shadow-[0_1px_0_var(--color-line)]')}>
          {!logo && <Mark src={workspace?.avatar_url} />}
          <span className={cx('relative min-w-0 flex-1 text-[15px] leading-5 font-medium', logo ? 'h-8' : 'h-5')}>
            <span className={cx('absolute inset-0 truncate transition-[opacity,transform] duration-300', logo && 'flex', scrolled ? '-translate-y-1 opacity-0' : 'opacity-100')}>{logo ? <BrandLogo src={logo} name={agency} /> : agency}</span>
            <span aria-hidden={!scrolled} className={cx('absolute inset-0 truncate transition-[opacity,transform] duration-300', logo && 'leading-8', scrolled ? 'opacity-100' : 'translate-y-1 opacity-0')}>
              {pageLabel}
            </span>
          </span>
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

      <Modal open={more} onClose={() => setMore(false)} title="Ещё">
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
          {/* текущий кабинет, другие кабинеты, аккаунт - как в меню профиля на компьютере */}
          {workspace && (
            <div className="mx-1 rounded-inner bg-soft p-3">
              <div className="flex items-center gap-3">
                <WorkspaceTile id={workspace.id} name={workspace.name} src={workspace.avatar_url} className="size-10 rounded-xl text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{workspace.name}</div>
                  <div className="text-[13px] text-muted">{membersLabel(team.filter((t) => t.is_active).length)}</div>
                </div>
                {isAdmin && <UpgradeButton />}
              </div>
              <NavLink to="/settings" onClick={() => setMore(false)} className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-surface text-[15px]">
                <Settings className="size-4 text-muted" strokeWidth={1.5} />
                Настройки кабинета
              </NavLink>
            </div>
          )}
          <div className="h-2" />
          {workspaces
            .filter((w) => w.id !== workspace?.id)
            .map((w) => (
              <button
                key={w.id}
                onClick={async () => {
                  const err = await switchWorkspace(w.id)
                  if (err) toast(err)
                }}
                className="flex h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-soft"
              >
                <WorkspaceTile id={w.id} name={w.name} src={w.avatar_url} muted={!w.is_active} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate text-[15px]', !w.is_active && 'text-muted')}>{w.name}</span>
                  <span className="block text-[13px] text-faint">{!w.is_active ? (w.deactivated_at ? 'доступ закрыт' : 'ждёт подтверждения') : w.role === 'admin' ? 'Учредитель' : 'Специалист'}</span>
                </span>
              </button>
            ))}
          <button
            onClick={() => {
              setMore(false)
              newWorkspace(createWorkspace)
            }}
            className="flex h-14 w-full items-center gap-3 rounded-2xl px-3 text-[15px] text-muted hover:bg-soft"
          >
            <span className="flex size-8 items-center justify-center rounded-[10px] border border-dashed border-ink/25">
              <Plus className="size-4" strokeWidth={1.5} />
            </span>
            Новый кабинет
          </button>
          <div className="mx-3 my-2 h-px bg-line" />
          <NavLink to="/profile" onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] hover:bg-soft">
            <UserRound className="size-5 text-muted" strokeWidth={1.5} />
            <span className="flex-1">Мой профиль</span>
          </NavLink>
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

/** Страницы из меню профиля: пока открыта одна из них, капсула профиля подсвечена */
const MENU_PAGES = ['/profile', '/settings']

const membersLabel = (n: number) => `${n} ${plural(n, 'участник', 'участника', 'участников')}`

/**
 * Профиль внизу сайдбара: при наведении или по клику открывает меню из трёх частей.
 * 1. Текущий кабинет - карточка: настройки, приглашение, тариф.
 * 2. Остальные кабинеты - переключение в один клик и «Новый кабинет».
 * 3. Аккаунт - профиль и выход
 */
function UserCard({ name, email, avatar, role, onSignOut }: { name: string; email: string; avatar?: string | null; role: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  const { isAdmin, team, workspaces, workspace, switchWorkspace, createWorkspace } = useAuth()
  const here = MENU_PAGES.some((p) => loc.pathname.startsWith(p))
  const others = workspaces.filter((w) => w.id !== workspace?.id)
  const members = team.filter((t) => t.is_active).length

  const show = () => {
    window.clearTimeout(timer.current)
    setOpen(true)
  }
  const hide = (delay = 160) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), delay)
  }

  useEffect(() => setOpen(false), [loc.pathname, loc.search])
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

  const item = cx(ITEM, ITEM_DESKTOP, 'gap-2.5 transition-colors duration-150 hover:bg-soft')
  const action = 'flex h-8 items-center justify-center gap-1.5 rounded-full bg-surface text-[13px] transition-colors duration-150 hover:bg-white/60'
  const label = 'px-2.5 pt-2 pb-1 text-xs text-faint'

  return (
    <div
      ref={box}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={() => hide()}
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && hide(0)}
    >
      {open && (
        // pb-1.5 — невидимый мостик: курсор доходит до меню, не покидая блок. Меню шире сайдбара
        <div className="absolute bottom-full left-0 w-72 pb-1.5">
          <div role="menu" aria-label="Кабинет и аккаунт" className={cx('fade max-h-[calc(100vh-96px)] overflow-y-auto', POPOVER)}>
            {/* 1. текущий кабинет */}
            {workspace && (
              <div className="rounded-[14px] bg-soft p-3">
                <div className="flex items-center gap-3">
                  <WorkspaceTile id={workspace.id} name={workspace.name} src={workspace.avatar_url} className="size-10 rounded-xl text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] leading-5 font-medium">{workspace.name}</div>
                    <div className="truncate text-xs text-muted">{membersLabel(members)}</div>
                  </div>
                </div>
                <div className={cx('mt-3 grid gap-1.5', isAdmin ? 'grid-cols-2' : 'grid-cols-1')}>
                  <NavLink to="/settings" state={{ bg: isSettings(loc.pathname) ? undefined : loc, back: true }} role="menuitem" className={action}>
                    <Settings className="size-3.5 text-muted" strokeWidth={1.5} />
                    Настройки
                  </NavLink>
                  {isAdmin && <UpgradeButton size="fill" />}
                </div>
              </div>
            )}

            {/* 2. другие кабинеты: сразу под карточкой текущего, без подзаголовка */}
            <div className="h-1.5" />
            {others.map((w) => (
              <button
                key={w.id}
                role="menuitem"
                className={cx(ITEM, 'h-11 gap-2.5 text-[13px] transition-colors duration-150 hover:bg-soft')}
                onClick={async () => {
                  setOpen(false)
                  const err = await switchWorkspace(w.id)
                  if (err) toast(err)
                }}
              >
                <WorkspaceTile id={w.id} name={w.name} src={w.avatar_url} muted={!w.is_active} className="size-7 text-[11px]" />
                <span className="min-w-0 flex-1 leading-4">
                  <span className={cx('block truncate', !w.is_active && 'text-muted')}>{w.name}</span>
                  <span className="block truncate text-xs text-faint">{!w.is_active ? (w.deactivated_at ? 'доступ закрыт' : 'ждёт подтверждения') : w.role === 'admin' ? 'Учредитель' : 'Специалист'}</span>
                </span>
              </button>
            ))}
            <button
              role="menuitem"
              className={cx(ITEM, 'h-11 gap-2.5 text-[13px] text-muted transition-colors duration-150 hover:bg-soft hover:text-ink')}
              onClick={() => {
                setOpen(false)
                newWorkspace(createWorkspace)
              }}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-ink/25">
                <Plus className="size-3.5" strokeWidth={1.5} />
              </span>
              Новый кабинет
            </button>

            {/* 3. аккаунт */}
            <div className="mx-2.5 my-1.5 h-px bg-line" />
            <p className={cx(label, 'truncate pt-1')} title={email}>
              {email}
            </p>
            <NavLink to="/profile" role="menuitem" className={({ isActive }) => cx(item, isActive && 'bg-soft')}>
              <UserRound className="size-4 shrink-0 text-muted" strokeWidth={1.5} />
              Мой профиль
            </NavLink>
            <button role="menuitem" className={cx(item, 'text-muted hover:text-ink')} onClick={onSignOut}>
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
              Выйти
            </button>
          </div>
        </div>
      )}
      {/* капсула: аватарка на равных отступах сверху, снизу и слева (p-1.5), справа стрелка меню */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className={cx('flex w-full items-center gap-2.5 rounded-full bg-surface p-1.5 pr-3 text-left transition-shadow duration-150', (open || here) && 'ring-1 ring-ink/10')}
      >
        <Avatar name={name} src={avatar} />
        <span className="min-w-0 flex-1 leading-4">
          <span className="block truncate text-[13px]">{name}</span>
          <span className="block text-xs text-faint">{role}</span>
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-faint transition-transform duration-200', open && 'rotate-180')} strokeWidth={1.5} />
      </button>
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
