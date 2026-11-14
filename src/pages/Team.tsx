import { Lock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { isActive } from '../lib/rules'
import { date } from '../lib/format'
import type { Profile } from '../lib/types'
import { toast } from '../lib/toast'
import { inviteUrl } from '../lib/invite'
import { confirmDialog, promptDialog } from '../components/dialogs'
import { Avatar, Button, Card, CopyIcon, Field, Modal, PageHeader, Select, Table, useCopy } from '../components/ui'

export function Team() {
  const { team, profile, isAdmin, reloadTeam, workspace } = useAuth()
  const { bloggers, integrations, reload } = useData()
  const [closing, setClosing] = useState<Profile | null>(null)
  const [heir, setHeir] = useState('')
  // закрытый доступ отличается от новой регистрации отметкой deactivated_at
  const pending = team.filter((t) => !t.is_active && !t.deactivated_at)
  const closed = team.filter((t) => !t.is_active && t.deactivated_at)
  const active = team.filter((t) => t.is_active)
  const count = (pid: string) => bloggers.filter((b) => b.owner_id === pid).length

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

  return (
    <>
      <PageHeader title="Команда" sub={isAdmin ? 'Учредители видят всё. Специалисты видят своих блогеров и свои кампании' : 'Вы видите своих блогеров и кампании, в которые вас добавили'} />

      {isAdmin && <InviteCard />}

      {isAdmin && pending.length > 0 && (
        <Card className="mb-3">
          <h2 className="text-base">Ждут доступа</h2>
          <ul className="mt-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0">
                <Avatar name={p.full_name || p.email || ''} src={p.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div>{p.full_name}</div>
                  <div className="text-xs text-muted">
                    {p.email}, с {date(p.created_at)}
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => update(p, { is_active: true, deactivated_at: null })}>
                  Открыть доступ
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Table
        min={560}
        head={
          <tr>
            <th>Человек</th>
            <th>Роль</th>
            <th className="text-right">Блогеров</th>
            <th className="text-right">Интеграций в работе</th>
            {isAdmin && <th />}
          </tr>
        }
      >
        {active.map((p) => {
          const self = p.id === profile?.id
          return (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-3">
                  <Avatar name={p.full_name || p.email || ''} src={p.avatar_url} />
                  <div>
                    <div>
                      {p.full_name}
                      {self && <span className="ml-2 text-xs text-muted">это вы</span>}
                    </div>
                    <div className="text-xs text-muted">{p.email}</div>
                  </div>
                </div>
              </td>
              <td>
                {isAdmin && !self ? (
                  <Select value={p.role} onChange={(e) => update(p, { role: e.target.value as Profile['role'] })} className="w-40" aria-label="Роль">
                    <option value="manager">Специалист</option>
                    <option value="admin">Учредитель</option>
                  </Select>
                ) : (
                  <span className="flex h-10 w-40 items-center gap-2 rounded-2xl bg-soft pr-3 pl-4 text-sm" title={self ? 'Свою роль поменять нельзя' : 'Роль меняют учредители'}>
                    <span className="min-w-0 flex-1 truncate">{p.role === 'admin' ? 'Учредитель' : 'Специалист'}</span>
                    <Lock className="size-4 shrink-0 text-faint" strokeWidth={1.5} />
                  </span>
                )}
              </td>
              <td className="num text-right">{isAdmin || self ? count(p.id) : '—'}</td>
              <td className="num text-right">{isAdmin || self ? integrations.filter((i) => i.owner_id === p.id && isActive(i)).length : '—'}</td>
              {isAdmin && (
                <td className="text-right">
                  {!self && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setHeir('')
                        setClosing(p)
                      }}
                    >
                      Закрыть доступ
                    </Button>
                  )}
                </td>
              )}
            </tr>
          )
        })}
      </Table>

      {isAdmin && closed.length > 0 && (
        <Card className="mt-3">
          <h2 className="text-base">Доступ закрыт</h2>
          <ul className="mt-2">
            {closed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0">
                <Avatar name={p.full_name || p.email || ''} src={p.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div>{p.full_name}</div>
                  <div className="text-xs text-muted">
                    {p.email}, закрыт {date(p.deactivated_at!)}
                  </div>
                </div>
                <Button size="sm" onClick={() => update(p, { is_active: true, deactivated_at: null })}>
                  Вернуть доступ
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-4 px-1 text-[13px] text-muted">{isAdmin ? 'Закрытый доступ не удаляет человека из «Сверки»: он остаётся в своих других кабинетах' : 'Новых людей приглашают учредители'}</p>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title={`Закрыть доступ: ${closing?.full_name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={close}>
              Закрыть доступ
            </Button>
          </>
        }
      >
        <p className="mb-4 text-muted">Человек больше не войдёт в кабинет. Его данные останутся</p>
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

/** Ссылка-приглашение в кабинет: по ней человек регистрируется и сразу попадает в команду */
function InviteCard() {
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
  return (
    <Card className="mb-3">
      <h2 className="text-base">Пригласить в команду</h2>
      <p className="mt-1 mb-4 text-muted">Отправьте ссылку коллеге. Он зарегистрируется и сразу попадёт в кабинет специалистом. Роль можно поменять ниже</p>
      <div className="flex items-center gap-2 rounded-2xl bg-soft py-1 pr-1 pl-4">
        <span className="min-w-0 flex-1 truncate py-2 text-[13px]">{url || 'Загружаем…'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!url}
          onClick={async () => {
            try {
              await copy(url)
            } catch {
              await promptDialog({ title: 'Скопируйте ссылку', body: 'Браузер не дал скопировать автоматически. Ссылка уже выделена', value: url, readOnly: true })
            }
          }}
        >
          <CopyIcon copied={copied} />
          {copied ? 'Скопировано' : 'Скопировать ссылку'}
        </Button>
        <Button size="sm" loading={busy} disabled={!url} onClick={reset}>
          {!busy && <RefreshCw className="size-3.5" strokeWidth={1.5} />}
          Сделать новую
        </Button>
      </div>
    </Card>
  )
}
