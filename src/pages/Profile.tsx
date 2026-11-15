import { useRef, useState } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Avatar, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { siteUrl, supabase } from '../lib/supabase'
import { removeAvatar, uploadAvatar } from '../lib/avatars'
import { toast } from '../lib/toast'
import { confirmDialog } from '../components/dialogs'

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
            className={`-m-3 flex flex-col items-start gap-5 rounded-inner p-3 sm:flex-row sm:items-center ${drag ? 'dropzone is-over' : ''}`}
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
          </div>
          <Button className="mt-4" variant="primary" loading={saving} disabled={!name.trim() || name.trim() === profile.full_name} onClick={saveName}>
            Сохранить
          </Button>
        </Card>

        <EmailCard current={profile.email ?? ''} onChanged={async () => {
          await reloadProfile()
          await reloadTeam()
        }} />
        <PasswordCard />
        <LeaveCard />
      </div>
    </>
  )
}

/** Выйти из кабинета самому: например, из агентства, с которым закончили работать */
function LeaveCard() {
  const { workspace, workspaces, team, profile, isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!workspace || !profile) return null
  const other = workspaces.find((w) => w.id !== workspace.id && w.is_active)
  // кабинет не должен остаться без учредителя
  const lastAdmin = isAdmin && !team.some((m) => m.id !== profile.id && m.role === 'admin' && m.is_active)
  if (lastAdmin)
    return (
      <Card>
        <h2 className="text-base">Кабинет «{workspace.name}»</h2>
        <p className="mt-1 text-muted">Вы единственный учредитель, поэтому покинуть кабинет нельзя. Чтобы уйти, сначала назначьте учредителем кого-то из команды</p>
      </Card>
    )
  return (
    <Card>
      <h2 className="text-base">Кабинет «{workspace.name}»</h2>
      <p className="mt-1 mb-4 text-muted">
        {other ? `После выхода откроется «${other.name}».` : 'Это ваш единственный кабинет: после выхода можно будет создать свой или войти в команду по ссылке.'} Блогеры, задачи и документы останутся в кабинете
      </p>
      <Button
        variant="danger"
        className="bg-bad/8"
        loading={busy}
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Покинуть «${workspace.name}»?`,
            body: 'Вернуться можно будет только по новой ссылке-приглашению от учредителя',
            ok: 'Покинуть',
            danger: true,
          })
          if (!ok) return
          setBusy(true)
          const { error } = await supabase.rpc('leave_workspace')
          setBusy(false)
          if (error) return toast(error.message)
          window.location.replace(siteUrl())
        }}
      >
        Покинуть кабинет
      </Button>
    </Card>
  )
}

const EMAIL_ERRORS: [RegExp, string][] = [
  [/already (been )?registered|already exists/i, 'Эта почта уже занята другим кабинетом'],
  [/rate limit|too many|security purposes/i, 'Слишком много писем подряд. Попробуйте через час'],
  [/invalid/i, 'Похоже, в адресе опечатка'],
]

/** Смена почты: Supabase присылает письмо со ссылкой; после перехода по ней входить нужно с новой почтой */
function EmailCard({ current, onChanged }: { current: string; onChanged: () => Promise<void> }) {
  const [email, setEmail] = useState(current)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const next = email.trim().toLowerCase()
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) && next !== current.toLowerCase()
  async function save() {
    if (!valid) return
    setBusy(true)
    const { data, error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: siteUrl('profile') })
    setBusy(false)
    if (error) return toast(EMAIL_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? error.message)
    if (data.user?.email?.toLowerCase() === next) {
      // подтверждение почты в проекте выключено — адрес сменился сразу
      await onChanged()
      toast('Почта изменена')
    } else setSent(next)
  }
  return (
    <Card>
      <h2 className="mb-4 text-base">Почта для входа</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Почта" hint={sent ? undefined : 'Пришлём письмо со ссылкой для подтверждения'}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && save()} />
        </Field>
      </div>
      {sent && (
        <p className="mt-3 max-w-xl text-[13px] text-muted">
          Отправили письмо на {sent}. Откройте его и перейдите по ссылке, после этого входите с новой почтой. Если письмо пришло и на старый адрес, подтвердите и там. Пока не подтвердите, вход по старой почте
        </p>
      )}
      <Button className="mt-4" variant="primary" loading={busy} disabled={!valid} onClick={save}>
        Сменить почту
      </Button>
    </Card>
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
