import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { clearInvite, parseInvite } from '../lib/invite'
import { Button, Field, Input } from '../components/ui'
import { Shell, useInviteName } from './Login'

/** Форма «Создать кабинет»: название агентства → кабинет, где вы учредитель */
function CreateForm({ autoFocus }: { autoFocus?: boolean }) {
  const { createWorkspace } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Укажите название агентства')
    setBusy(true)
    setError(await createWorkspace(name.trim()))
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field label="Название агентства" hint="Его увидят коллеги и клиенты на подборках. Поменять можно в настройках">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus={autoFocus} />
      </Field>
      {error && <p className="rounded-2xl bg-orange-100 px-4 py-3 text-bad">{error}</p>}
      <Button variant="primary" type="submit" loading={busy} className="w-full">
        Создать кабинет
      </Button>
    </form>
  )
}

/** Вставить ссылку-приглашение, если её прислали в мессенджер, а открыли сайт отдельно */
function JoinForm() {
  const { joinWorkspace } = useAuth()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const token = parseInvite(text)
    if (!token) return setError('Вставьте ссылку целиком: она начинается с https:// и заканчивается кодом после «t=»')
    setBusy(true)
    setError(await joinWorkspace(token))
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field label="Ссылка-приглашение" hint="Её присылает учредитель из раздела «Команда»">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/join/?t=…" />
      </Field>
      {error && <p className="rounded-2xl bg-orange-100 px-4 py-3 text-bad">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">
        Присоединиться
      </Button>
    </form>
  )
}

function Or() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-faint">
      <span className="h-px flex-1 bg-line" />
      или
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/** Человек вошёл, но ни в одном кабинете не состоит */
export function Onboarding() {
  const { signOut } = useAuth()
  return (
    <Shell>
      <h1 className="text-2xl tracking-tight">Кабинет агентства</h1>
      <p className="mt-2 mb-6 text-muted">Здесь будут ваши блогеры, кампании и задачи. Коллег позовёте ссылкой-приглашением</p>
      <CreateForm autoFocus />
      <Or />
      <p className="mb-3 text-muted">Вас позвали в команду?</p>
      <JoinForm />
      <Button variant="ghost" className="mt-6 w-full" onClick={signOut}>
        Выйти
      </Button>
    </Shell>
  )
}

/** В текущий кабинет доступа нет: ещё не открыли или уже закрыли */
export function WsPending() {
  const { workspace, workspaces, switchWorkspace, signOut } = useAuth()
  const [creating, setCreating] = useState(false)
  const others = workspaces.filter((w) => w.id !== workspace?.id && w.is_active)
  const closed = !!workspace?.deactivated_at

  if (creating)
    return (
      <Shell>
        <h1 className="mb-6 text-2xl tracking-tight">Новый кабинет</h1>
        <CreateForm autoFocus />
        <Button variant="ghost" className="mt-3 w-full" onClick={() => setCreating(false)}>
          Назад
        </Button>
      </Shell>
    )

  return (
    <Shell>
      <h1 className="text-2xl tracking-tight">{closed ? `Доступ в «${workspace?.name}» закрыт` : `Ждём доступа в «${workspace?.name}»`}</h1>
      <p className="mt-2 text-muted">
        {closed ? 'Учредитель кабинета закрыл вам доступ. Если это ошибка, напишите ему: вернуть доступ можно в разделе «Команда»' : 'Учредители уже получили уведомление. Когда вам откроют доступ, обновите страницу'}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {others.map((w) => (
          <Button key={w.id} variant="primary" onClick={() => switchWorkspace(w.id)}>
            Перейти в «{w.name}»
          </Button>
        ))}
        {!closed && (
          <Button variant={others.length ? 'secondary' : 'primary'} onClick={() => window.location.reload()}>
            Обновить
          </Button>
        )}
        <Button onClick={() => setCreating(true)}>Создать свой кабинет</Button>
        <Button variant="ghost" onClick={signOut}>
          Выйти
        </Button>
      </div>
    </Shell>
  )
}

/** Вошли с приглашением в браузере: спрашиваем, присоединиться ли */
export function JoinInvite({ token, onSkip }: { token: string; onSkip: () => void }) {
  const { joinWorkspace, workspaces } = useAuth()
  const name = useInviteName(token)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const skip = () => {
    clearInvite()
    onSkip()
  }
  const already = workspaces.find((w) => w.name === name && w.is_active)

  return (
    <Shell>
      {name === undefined ? (
        <p className="text-muted">Проверяем приглашение…</p>
      ) : name === null ? (
        <>
          <h1 className="text-2xl tracking-tight">Ссылка не действует</h1>
          <p className="mt-2 text-muted">Учредитель мог сделать новую ссылку. Попросите её ещё раз</p>
          <Button variant="primary" className="mt-6 w-full" onClick={skip}>
            Продолжить
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-2xl tracking-tight">Приглашение в «{name}»</h1>
          <p className="mt-2 text-muted">{already ? 'Вы уже в этой команде. Откроем её кабинет' : 'Вы попадёте в команду специалистом. Учредители увидят вас в разделе «Команда»'}</p>
          {error && <p className="mt-4 rounded-2xl bg-orange-100 px-4 py-3 text-bad">{error}</p>}
          <div className="mt-6 flex flex-col gap-2">
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                const err = await joinWorkspace(token)
                setBusy(false)
                if (err) setError(err)
                else clearInvite()
              }}
            >
              {already ? 'Открыть кабинет' : 'Присоединиться'}
            </Button>
            <Button variant="ghost" onClick={skip}>
              Не сейчас
            </Button>
          </div>
        </>
      )}
    </Shell>
  )
}
