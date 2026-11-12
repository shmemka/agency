import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { isActive } from '../lib/rules'
import { date } from '../lib/format'
import type { Profile } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Card, Chip, Field, Input, Modal, PageHeader, Select, Table } from '../components/ui'

export function Team() {
  const { team, profile, isAdmin, reloadTeam, reloadProfile } = useAuth()
  const { bloggers, integrations, reload } = useData()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState<Profile | null>(null)
  const [heir, setHeir] = useState('')
  const pending = team.filter((t) => !t.is_active)
  const active = team.filter((t) => t.is_active)
  const count = (pid: string) => bloggers.filter((b) => b.owner_id === pid).length

  async function update(p: Profile, patch: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) return toast(error.message)
    await reloadTeam()
    toast('Сохранено')
  }

  async function close() {
    if (!closing) return
    if (heir) {
      const a = await supabase.from('bloggers').update({ owner_id: heir }).eq('owner_id', closing.id)
      const b = await supabase.from('integrations').update({ owner_id: heir }).eq('owner_id', closing.id)
      if (a.error || b.error) return toast((a.error ?? b.error)!.message)
    }
    await update(closing, { is_active: false })
    await reload('bloggers', 'integrations')
    setClosing(null)
  }

  return (
    <>
      <PageHeader title="Команда" sub={isAdmin ? 'Учредители видят всё. Специалисты видят своих блогеров и свои кампании' : 'Вы видите своих блогеров и кампании, в которые вас добавили'} />

      {isAdmin && pending.length > 0 && (
        <Card className="mb-3">
          <h2 className="text-base">Ждут доступа</h2>
          <ul className="mt-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0">
                <Avatar name={p.full_name || p.email || ''} />
                <div className="min-w-0 flex-1">
                  <div>{p.full_name}</div>
                  <div className="text-xs text-muted">
                    {p.email}, с {date(p.created_at)}
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => update(p, { is_active: true })}>
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
                  <Avatar name={p.full_name || p.email || ''} />
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
                  <Chip tone={p.role === 'admin' ? 'dark' : undefined}>{p.role === 'admin' ? 'Учредитель' : 'Специалист'}</Chip>
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

      <Card className="mt-3 max-w-md">
        <h2 className="mb-3 text-base">Мой профиль</h2>
        <Field label="Имя, которое видят коллеги">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          className="mt-3"
          variant="primary"
          loading={saving}
          disabled={!name.trim() || name === profile?.full_name}
          onClick={async () => {
            if (!profile) return
            setSaving(true)
            const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id)
            setSaving(false)
            if (error) return toast(error.message)
            await Promise.all([reloadProfile(), reloadTeam()])
            toast('Имя обновлено')
          }}
        >
          Сохранить имя
        </Button>
        <p className="mt-4 text-[13px] text-muted">{isAdmin ? 'Чтобы добавить человека, отправьте ему адрес сайта. Он зарегистрируется, а вы откроете доступ здесь' : 'Новых людей подключают учредители'}</p>
      </Card>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title={`Закрыть доступ: ${closing?.full_name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={close}>
              Закрыть доступ
            </Button>
          </>
        }
      >
        <p className="mb-4 text-muted">Человек больше не войдёт в кабинет. Его данные останутся</p>
        {closing && count(closing.id) > 0 && (
          <Field label={`Кому передать его блогеров: ${count(closing.id)}`}>
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
