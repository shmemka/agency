import { useRef, useState } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Avatar, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { supabase } from '../lib/supabase'
import { removeAvatar, uploadAvatar } from '../lib/avatars'
import { toast } from '../lib/toast'

export function Profile() {
  const { profile, isAdmin, reloadProfile, reloadTeam } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  if (!profile) return null
  const display = profile.full_name || profile.email || ''

  async function setAvatar(url: string | null) {
    const old = profile!.avatar_url
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile!.id)
    if (error) return toast(error.message)
    await removeAvatar(old)
    await Promise.all([reloadProfile(), reloadTeam()])
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      await setAvatar(await uploadAvatar(profile!.id, file))
      toast('Фото обновлено')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function saveName() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id)
    setSaving(false)
    if (error) return toast(error.message)
    await Promise.all([reloadProfile(), reloadTeam()])
    toast('Имя сохранено')
  }

  return (
    <>
      <PageHeader title="Мой профиль" sub={isAdmin ? 'Учредитель' : 'Специалист'} />
      <div className="grid max-w-3xl gap-3">
        <Card>
          <h2 className="mb-4 text-base">Фото</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              upload(e.dataTransfer.files[0])
            }}
            className={`-m-3 flex flex-col items-start gap-5 rounded-inner p-3 transition-colors duration-150 sm:flex-row sm:items-center ${drag ? 'bg-soft' : ''}`}
          >
            <Avatar name={display} src={profile.avatar_url} className="size-24 text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="text-muted">Коллеги увидят фото рядом с вашими задачами, блогерами и комментариями. Подойдёт квадратное или любое другое: обрежем по центру</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" loading={busy} onClick={() => input.current?.click()}>
                  <ImageUp className="size-4" strokeWidth={1.5} />
                  {profile.avatar_url ? 'Заменить фото' : 'Загрузить фото'}
                </Button>
                {profile.avatar_url && (
                  <Button variant="ghost" disabled={busy} onClick={() => setAvatar(null).then(() => toast('Фото удалено'))}>
                    <Trash2 className="size-4" strokeWidth={1.5} />
                    Удалить
                  </Button>
                )}
              </div>
            </div>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-base">Данные</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя, которое видят коллеги">
              <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && name !== profile.full_name && saveName()} />
            </Field>
            <Field label="Почта для входа">
              <Input value={profile.email ?? ''} readOnly className="text-muted focus:bg-soft focus:ring-transparent" />
            </Field>
          </div>
          <Button className="mt-4" variant="primary" loading={saving} disabled={!name.trim() || name.trim() === profile.full_name} onClick={saveName}>
            Сохранить
          </Button>
        </Card>

        <PasswordCard />
      </div>
    </>
  )
}

function PasswordCard() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (pw.length < 6) return toast('Пароль должен быть не короче 6 символов')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return toast(error.message)
    setPw('')
    toast('Пароль изменён')
  }
  return (
    <Card>
      <h2 className="mb-4 text-base">Пароль</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Новый пароль" hint="Не короче 6 символов">
          <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw.length >= 6 && save()} />
        </Field>
      </div>
      <Button className="mt-4" variant="primary" loading={busy} disabled={pw.length < 6} onClick={save}>
        Сменить пароль
      </Button>
    </Card>
  )
}
