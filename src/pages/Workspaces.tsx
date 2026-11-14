import { useState, type FormEvent } from 'react'
import { ChevronLeft, Plus, UsersRound } from 'lucide-react'
import art from '../assets/onboarding.svg'
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

/*
 * Первый экран после регистрации. Иллюстрация — фон во весь экран: фигура сверху по центру,
 * ленты уходят за края. Блок с выбором стоит под фигурой при любом размере окна:
 * картинка растягивается по большей стороне, а отступ блока считается от её высоты.
 */
const ART_H = 'max(100vw * 906 / 1677, 100dvh)'

export function Onboarding() {
  const { signOut } = useAuth()
  const [step, setStep] = useState<'choose' | 'create' | 'join'>('choose')
  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas">
      <img
        src={art}
        alt=""
        aria-hidden
        draggable={false}
        className="onboard-art pointer-events-none absolute top-0 left-1/2 max-w-none -translate-x-1/2 select-none"
        style={{ width: 'max(100vw, 100dvh * 1677 / 906)', aspectRatio: '1677 / 906' }}
      />
      <button onClick={signOut} className="absolute top-4 right-4 z-10 rounded-full px-4 py-2 text-[13px] text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink md:top-6 md:right-6">
        Выйти
      </button>
      <main className="relative flex flex-col items-center px-4 pb-12 text-center" style={{ paddingTop: `calc(${ART_H} * 0.5)` }}>
        <div key={step} className="rise flex w-full flex-col items-center">
          {step === 'choose' && (
            <>
              <h1 className="text-[26px] leading-8 tracking-tight md:text-[34px] md:leading-10">Привет! С чего начнём?</h1>
              <p className="mt-3 max-w-lg text-muted">Кабинет — это пространство агентства: блогеры, кампании, задачи и команда</p>
              <div className="mt-8 flex w-full max-w-sm flex-col gap-3 md:mt-10 md:w-auto md:max-w-none md:flex-row md:gap-4">
                <Choice icon={<Plus className="size-5" strokeWidth={1.5} />} onClick={() => setStep('create')}>
                  Создать свой кабинет
                </Choice>
                <Choice icon={<UsersRound className="size-5" strokeWidth={1.5} />} onClick={() => setStep('join')}>
                  Присоединиться к команде
                </Choice>
              </div>
            </>
          )}
          {step === 'create' && (
            <Step title="Как называется агентство?" sub="Название увидят коллеги и клиенты на подборках. Поменять его можно в настройках" onBack={() => setStep('choose')}>
              <CreateInline />
            </Step>
          )}
          {step === 'join' && (
            <Step title="Вставьте ссылку-приглашение" sub="Её присылает учредитель кабинета из раздела «Команда»" onBack={() => setStep('choose')}>
              <JoinInline />
            </Step>
          )}
        </div>
      </main>
    </div>
  )
}

/** Большая белая кнопка выбора */
function Choice({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-14 items-center justify-center gap-3 rounded-full bg-surface px-7 text-[17px] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(21,23,28,0.08)] active:translate-y-0 active:scale-[0.98] md:h-16 md:px-8 md:text-[19px]"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  )
}

function Step({ title, sub, onBack, children }: { title: string; sub: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-[26px] leading-8 tracking-tight md:text-[34px] md:leading-10">{title}</h1>
      <p className="mt-3 max-w-md text-muted">{sub}</p>
      <div className="mt-8 w-full max-w-xl md:mt-10">{children}</div>
      <button onClick={onBack} className="mt-4 inline-flex items-center gap-1 rounded-full px-4 py-2 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink">
        <ChevronLeft className="size-4" strokeWidth={1.5} />
        Назад
      </button>
    </>
  )
}

/** Поле и кнопка в одну строку, как пара больших кнопок на первом шаге; на телефоне — друг под другом */
function InlineForm({ value, onChange, placeholder, label, action, busy, error, onSubmit, maxLength }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; action: string; busy: boolean; error: string | null; onSubmit: () => void; maxLength?: number }) {
  return (
    <form
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          autoFocus
          aria-label={label}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-14 w-full min-w-0 shrink-0 rounded-full bg-surface px-6 text-[17px] text-ink ring-1 ring-transparent transition-shadow duration-150 placeholder:text-faint focus:ring-ink/25 focus:outline-none md:h-16 md:flex-1"
        />
        <Button variant="primary" type="submit" loading={busy} className="h-14! px-8! text-[17px]! md:h-16!">
          {action}
        </Button>
      </div>
      {error && <p className="fade mt-3 text-bad">{error}</p>}
    </form>
  )
}

function CreateInline() {
  const { createWorkspace } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <InlineForm
      label="Название агентства"
      placeholder="Например, shft agency"
      action="Создать кабинет"
      value={name}
      maxLength={80}
      onChange={(v) => {
        setName(v)
        setError(null)
      }}
      busy={busy}
      error={error}
      onSubmit={async () => {
        if (!name.trim()) return setError('Укажите название агентства')
        setBusy(true)
        setError(await createWorkspace(name.trim()))
        setBusy(false)
      }}
    />
  )
}

function JoinInline() {
  const { joinWorkspace } = useAuth()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <InlineForm
      label="Ссылка-приглашение"
      placeholder="https://…/join/?t=…"
      action="Присоединиться"
      value={text}
      onChange={(v) => {
        setText(v)
        setError(null)
      }}
      busy={busy}
      error={error}
      onSubmit={async () => {
        const token = parseInvite(text)
        if (!token) return setError('Вставьте ссылку целиком: она начинается с https:// и заканчивается кодом после «t=»')
        setBusy(true)
        setError(await joinWorkspace(token))
        setBusy(false)
      }}
    />
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
