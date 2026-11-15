import { Link2, RefreshCw, UserPlus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { isActive } from '../lib/rules'
import { date, plural } from '../lib/format'
import type { Profile } from '../lib/types'
import { toast } from '../lib/toast'
import { inviteUrl } from '../lib/invite'
import { confirmDialog, promptDialog } from '../components/dialogs'
import { Avatar, Button, Card, CopyIcon, Field, Modal, PageHeader, Select, cx, useCopy } from '../components/ui'

const ROLE = { admin: 'Учредитель', manager: 'Специалист' } as const

/** Сетка строки команды на компьютере: человек, роль, блогеры, в работе, действие. Шапка списка стоит по той же сетке */
const GRID_ADMIN = 'md:grid md:grid-cols-[minmax(0,1fr)_9.5rem_4.5rem_9rem_8.5rem] md:items-center md:gap-4'
const GRID_SPEC = 'md:grid md:grid-cols-[minmax(0,1fr)_9.5rem] md:items-center md:gap-4'

/**
 * Команда кабинета. Один вид строки во всех трёх списках: ждут доступа, в команде, доступ закрыт.
 * Яркое место страницы - нагрузка у учредителя (полоска «в работе» относительно самого загруженного),
 * лаймовая точка - только у заявок, которые ждут решения
 */
export function Team() {
  const { team, profile, isAdmin, reloadTeam, workspace } = useAuth()
  const { bloggers, integrations, reload } = useData()
  const [closing, setClosing] = useState<Profile | null>(null)
  const [heir, setHeir] = useState('')
  // закрытый доступ отличается от новой регистрации отметкой deactivated_at
  const pending = team.filter((t) => !t.is_active && !t.deactivated_at)
  const closed = team.filter((t) => !t.is_active && t.deactivated_at)
  const active = team.filter((t) => t.is_active)
  const admins = active.filter((t) => t.role === 'admin').length
  const count = (pid: string) => bloggers.filter((b) => b.owner_id === pid).length
  const working = (pid: string) => integrations.filter((i) => i.owner_id === pid && isActive(i)).length
  const maxWorking = Math.max(1, ...active.map((p) => working(p.id)))

  async function update(p: Profile, patch: Partial<Profile>) {
    // роль и доступ — у участника кабинета, а не у человека: в другом кабинете у него могут быть свои
    const { error } = await supabase.from('workspace_members').update(patch).eq('workspace_id', workspace!.id).eq('profile_id', p.id)
    if (error) return toast(error.message)
    await reloadTeam()
    toast('Сохранено')
  }

  async function close() {
    if (!closing) return
    // передаём всё, что вёл человек: блогеров, интеграции, кампании и открытые задачи. Без наследника — снимаем ответственного
    const to = heir || null
    const res = await Promise.all([
      supabase.from('bloggers').update({ owner_id: to }).eq('owner_id', closing.id),
      supabase.from('integrations').update({ owner_id: to }).eq('owner_id', closing.id),
      supabase.from('campaigns').update({ owner_id: to }).eq('owner_id', closing.id),
      supabase.from('tasks').update({ assignee_id: to }).eq('assignee_id', closing.id).is('done_at', null),
      // задачи без исполнителя, которые он поставил, иначе никому не напомнят о себе: отдаём наследнику, а без него — тому, кто закрывает доступ
      supabase.from('tasks').update({ assignee_id: to ?? profile?.id ?? null }).is('assignee_id', null).eq('created_by', closing.id).is('done_at', null),
    ])
    const err = res.find((r) => r.error)?.error
    if (err) return toast(err.message)
    await update(closing, { is_active: false, deactivated_at: new Date().toISOString() })
    await reload('bloggers', 'integrations', 'campaigns', 'tasks')
    setClosing(null)
  }

  const askClose = (p: Profile) => {
    setHeir('')
    setClosing(p)
  }

  const role = (p: Profile, self: boolean) =>
    isAdmin && !self ? (
      <Select tone="quiet" value={p.role} onChange={(e) => update(p, { role: e.target.value as Profile['role'] })} className="-ml-3 w-36" aria-label="Роль">
        <option value="manager">{ROLE.manager}</option>
        <option value="admin">{ROLE.admin}</option>
      </Select>
    ) : (
      <span className="text-[13px] text-muted" title={self ? 'Свою роль поменять нельзя' : 'Роль меняют учредители'}>
        {ROLE[p.role]}
      </span>
    )

  return (
    <>
      <PageHeader
        title="Команда"
        sub={isAdmin ? `${active.length} ${plural(active.length, 'человек', 'человека', 'человек')}, из них ${admins} ${plural(admins, 'учредитель', 'учредителя', 'учредителей')}` : 'Новых людей приглашают учредители'}
        actions={isAdmin && <InviteButton />}
      />

      <div className="grid gap-3">
        {isAdmin && pending.length > 0 && (
          <Card>
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2 rounded-full bg-lime ring-1 ring-ink/10" />
              <h2 className="text-base">Ждут доступа</h2>
              <span className="num text-sm text-muted">{pending.length}</span>
            </div>
            <ul className="mt-2">
              {pending.map((p) => (
                <Row key={p.id}>
                  <Person p={p} meta={[p.email, `просится с ${date(p.created_at)}`]} />
                  <Button variant="primary" size="sm" onClick={() => update(p, { is_active: true, deactivated_at: null })}>
                    Открыть доступ
                  </Button>
                </Row>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          {/* шапка колонок - только на компьютере и по той же сетке, что строки */}
          <div className={cx('hidden pb-2 text-xs text-faint', isAdmin ? GRID_ADMIN : GRID_SPEC)}>
            <span />
            <span>Роль</span>
            {isAdmin && (
              <>
                <span className="text-right">Блогеры</span>
                <span>В работе</span>
                <span />
              </>
            )}
          </div>
          <ul>
            {active.map((p) => {
              const self = p.id === profile?.id
              // свои числа специалист видит строкой у себя, чужих - не видит вовсе
              const mine = !isAdmin && self ? [`${count(p.id)} ${plural(count(p.id), 'блогер', 'блогера', 'блогеров')}`, `${working(p.id)} в работе`] : []
              const closeBtn = isAdmin && !self && (
                <button
                  type="button"
                  onClick={() => askClose(p)}
                  className="-mr-3 h-8 shrink-0 justify-self-end rounded-full px-3 text-[13px] text-muted transition-colors duration-200 hover:bg-bad/8 hover:text-bad"
                >
                  Закрыть доступ
                </button>
              )
              return (
                <li key={p.id} className={cx('border-t border-line py-3 first:border-0', isAdmin ? GRID_ADMIN : GRID_SPEC)}>
                  <Person p={p} self={self} meta={[p.email, ...mine]} phoneMeta={isAdmin ? [`${count(p.id)} ${plural(count(p.id), 'блогер', 'блогера', 'блогеров')}`, `${working(p.id)} в работе`] : undefined} />
                  {/* телефон: роль и действие строкой под человеком */}
                  <div className="mt-1 flex items-center justify-between gap-2 pl-12 md:contents">
                    <div className="md:col-start-2">{role(p, self)}</div>
                    {isAdmin && (
                      <>
                        <span className="num hidden text-right text-sm md:block">{count(p.id)}</span>
                        <Load n={working(p.id)} max={maxWorking} />
                      </>
                    )}
                    {isAdmin && <div className="md:col-start-5 md:justify-self-end">{closeBtn}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 space-y-1 border-t border-line pt-4 text-[13px] text-muted">
            <p>
              <span className="text-ink">Учредители</span> видят всё и управляют кабинетом
            </p>
            <p>
              <span className="text-ink">Специалисты</span> - своих блогеров и кампании, в которые их добавили
            </p>
          </div>
        </Card>

        {isAdmin && closed.length > 0 && (
          <Card>
            <h2 className="text-base">Доступ закрыт</h2>
            <p className="mt-1 text-[13px] text-muted">Человек остаётся в «Сверке» и в своих других кабинетах</p>
            <ul className="mt-2">
              {closed.map((p) => (
                <Row key={p.id}>
                  <Person p={p} meta={[p.email, `закрыт ${date(p.deactivated_at!)}`]} />
                  <Button size="sm" onClick={() => update(p, { is_active: true, deactivated_at: null })}>
                    Вернуть доступ
                  </Button>
                </Row>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title={`Закрыть доступ: ${closing?.full_name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Отмена
            </Button>
            <Button variant="danger" className="bg-bad/8" onClick={close}>
              Закрыть доступ
            </Button>
          </>
        }
      >
        <p className="mb-4 text-muted">
          Человек больше не войдёт в <span className="whitespace-nowrap">«{workspace?.name}»</span>, а его данные останутся. Сам он останется в «Сверке» и в своих других кабинетах
        </p>
        {closing && (
          <Field label={`Кому передать блогеров (${count(closing.id)}), интеграции, кампании и открытые задачи`}>
            <Select value={heir} onChange={(e) => setHeir(e.target.value)}>
              <option value="">Оставить без ответственного (видны только учредителям)</option>
              {active
                .filter((p) => p.id !== closing.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
            </Select>
          </Field>
        )}
      </Modal>
    </>
  )
}

/** Строка списка заявок и закрытых: человек слева, действие справа */
function Row({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-3 border-t border-line py-3 first:border-0">{children}</li>
}

/**
 * Человек: аватар, имя с пометкой «вы» и строка меты. Части меты переносятся целиком, а не посреди фразы.
 * phoneMeta - вторая строка только на телефоне (там нет колонок с числами)
 */
function Person({ p, self, meta, phoneMeta }: { p: Profile; self?: boolean; meta: (string | null)[]; phoneMeta?: string[] }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar name={p.full_name || p.email || ''} src={p.avatar_url} className="size-9" />
      <div className="min-w-0">
        <div className="truncate text-sm">
          {p.full_name || p.email}
          {self && <span className="ml-2 text-xs text-muted">вы</span>}
        </div>
        <Meta parts={meta} />
        {phoneMeta && <Meta parts={phoneMeta} className="num md:hidden" />}
      </div>
    </div>
  )
}

function Meta({ parts, className }: { parts: (string | null)[]; className?: string }) {
  const list = parts.filter(Boolean)
  return (
    <div className={cx('flex flex-wrap gap-x-1.5 text-xs text-muted', className)}>
      {list.map((t, i) => (
        <span key={i} className="min-w-0 truncate">
          {t}
          {i < list.length - 1 && <span className="text-faint"> ·</span>}
        </span>
      ))}
    </div>
  )
}

/** Нагрузка: интеграции в работе числом и полоской относительно самого загруженного в команде */
function Load({ n, max }: { n: number; max: number }) {
  return (
    <div className="hidden items-center gap-3 md:flex" title={`${n} в работе`}>
      <span className="num w-6 text-right text-sm">{n}</span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/6">
        <span className="grow block h-full rounded-full bg-ink/70" style={{ width: `${(n / max) * 100}%` }} />
      </span>
    </div>
  )
}

/** Кнопка «Пригласить» в шапке: по ней окно со ссылкой-приглашением и кнопкой «Скопировать» */
function InviteButton() {
  const { workspace } = useAuth()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const { copied, copy } = useCopy()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('workspace_invites')
      .select('token')
      .maybeSingle()
      .then(({ data }) => setToken(data?.token ?? null))
  }, [])

  async function reset() {
    const ok = await confirmDialog({
      title: 'Сделать новую ссылку?',
      body: 'Старая перестанет работать. Те, кто уже вошёл по ней, останутся в команде',
      ok: 'Сделать новую',
    })
    if (!ok) return
    setBusy(true)
    const { data, error } = await supabase.rpc('reset_invite')
    setBusy(false)
    if (error) return toast(error.message)
    setToken(data as string)
    toast('Новая ссылка готова, старая больше не работает')
  }

  if (token === null) return null
  const url = token ? inviteUrl(token) : ''

  async function copyLink() {
    try {
      await copy(url)
    } catch {
      await promptDialog({ title: 'Скопируйте ссылку', body: 'Браузер не дал скопировать автоматически. Ссылка уже выделена', value: url, readOnly: true })
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} disabled={!url}>
        <UserPlus className="size-4" strokeWidth={1.5} />
        Пригласить
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Пригласить в команду">
        <p className="text-muted">
          По этой ссылке коллега зарегистрируется и сразу попадёт в <span className="whitespace-nowrap">«{workspace?.name}»</span> специалистом. Роль можно поменять в списке команды
        </p>

        {/* ссылка целиком, а не обрезанная: видно, что отправляешь. Касание выделяет её всю */}
        <div className="mt-5 rounded-inner bg-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[12px] text-faint">
            <Link2 className="size-3.5" strokeWidth={1.5} />
            Ссылка-приглашение
          </div>
          <div className="mt-1 text-[15px] leading-snug break-all select-all">{url.replace(/^https?:\/\//, '')}</div>
        </div>

        <Button variant="primary" onClick={copyLink} className={cx('mt-3 h-12 w-full text-[15px]', copied && 'bg-leaf! text-ink! hover:bg-leaf!')}>
          <CopyIcon copied={copied} />
          {copied ? 'Скопировано' : 'Скопировать ссылку'}
        </Button>

        <p className="mt-5 text-center text-[13px] text-faint">
          Ссылка попала не к тому человеку?{' '}
          <button onClick={reset} disabled={busy} className="inline-flex items-center gap-1 font-medium text-muted underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline disabled:opacity-40">
            {busy && <RefreshCw className="size-3 animate-spin" strokeWidth={1.5} />}
            Сделать новую
          </button>
        </p>
      </Modal>
    </>
  )
}
