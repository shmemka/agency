import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { date } from '../lib/format'
import type { Profile } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Field, Input, PageHeader, Select, cx } from '../components/ui'

export function Team() {
  const { team, profile, isAdmin, reloadTeam, reloadProfile } = useAuth()
  const { bloggers } = useData()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)

  async function update(p: Profile, patch: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) return toast(error.message)
    await reloadTeam()
    toast('Сохранено')
  }

  async function saveName() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id)
    setSaving(false)
    if (error) return toast(error.message)
    await Promise.all([reloadProfile(), reloadTeam()])
    toast('Имя обновлено')
  }

  const pending = team.filter((t) => !t.is_active)
  const active = team.filter((t) => t.is_active)

  return (
    <>
      <PageHeader title="Команда" sub="Кто работает в кабинете и за кого отвечает" />

      {isAdmin && pending.length > 0 && (
        <section className="mb-6 rounded-2xl bg-accent-soft p-5 ring-1 ring-pink-200">
          <h2 className="font-medium">Ждут доступа</h2>
          <p className="text-[13px] text-muted">Зарегистрировались, но пока не видят данные агентства.</p>
          <ul className="mt-3 space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3">
                <Avatar name={p.full_name || p.email || ''} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.full_name}</div>
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
        </section>
      )}

      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line bg-base/60 text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Специалист</th>
              <th className="px-4 py-2.5 font-medium">Роль</th>
              <th className="px-4 py-2.5 text-right font-medium">Блогеров в работе</th>
              <th className="px-4 py-2.5 font-medium">В команде с</th>
              {isAdmin && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {active.map((p) => {
              const n = bloggers.filter((b) => b.owner_id === p.id && !['done', 'declined', 'blacklist'].includes(b.status)).length
              const self = p.id === profile?.id
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name || p.email || ''} />
                      <div>
                        <div className="font-medium">
                          {p.full_name}
                          {self && <span className="ml-1.5 text-xs font-normal text-muted">это вы</span>}
                        </div>
                        <div className="text-xs text-muted">{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && !self ? (
                      <Select value={p.role} onChange={(e) => update(p, { role: e.target.value as Profile['role'] })} className="h-8 w-36" aria-label="Роль">
                        <option value="manager">Специалист</option>
                        <option value="admin">Админ</option>
                      </Select>
                    ) : (
                      <span className={cx('rounded-md px-2 py-1 text-xs font-medium', p.role === 'admin' ? 'bg-night text-white' : 'bg-base text-muted')}>
                        {p.role === 'admin' ? 'Админ' : 'Специалист'}
                      </span>
                    )}
                  </td>
                  <td className="num px-4 py-3 text-right">{n}</td>
                  <td className="px-4 py-3 text-muted">{date(p.created_at)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {!self && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Закрыть доступ для ${p.full_name || p.email}? Данные останутся.`)) update(p, { is_active: false })
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
          </tbody>
        </table>
      </div>

      <section className="mt-8 max-w-md rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h2 className="mb-3 font-medium">Мой профиль</h2>
        <Field label="Имя, которое видят коллеги">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button className="mt-3" variant="primary" loading={saving} disabled={!name.trim() || name === profile?.full_name} onClick={saveName}>
          Сохранить имя
        </Button>
        {!isAdmin && <p className="mt-4 text-xs text-muted">Новых специалистов подключает админ: коллега регистрируется на странице входа, а админ открывает доступ здесь.</p>}
        {isAdmin && <p className="mt-4 text-xs text-muted">Чтобы добавить специалиста, отправьте ему ссылку на сайт: он зарегистрируется и появится выше в «Ждут доступа».</p>}
      </section>
    </>
  )
}
