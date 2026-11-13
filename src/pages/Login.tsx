import { useState, type FormEvent } from 'react'
import { siteUrl, supabase } from '../lib/supabase'
import { PHASES } from '../lib/constants'
import { useAgencyName } from '../lib/agency'
import { Button, Field, Input, cx } from '../components/ui'

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Почта или пароль не подходят',
  'Email not confirmed': 'Почта не подтверждена. Откройте письмо и перейдите по ссылке',
  'User already registered': 'Эта почта уже зарегистрирована. Войдите',
}

function Shell({ children }: { children: React.ReactNode }) {
  const agency = useAgencyName()
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="rise grid w-full max-w-4xl overflow-hidden rounded-card bg-surface md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-soft p-8 md:flex">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-ink">
              <span className="bar-lime size-2.5 rounded-full" />
            </span>
            <span className="text-[15px] font-medium">{agency}</span>
          </div>
          <div>
            <p className="text-[32px] leading-9 tracking-tight">Блогеры, договоры и выходы в одном кабинете</p>
            <div className="mt-8 flex gap-1" aria-hidden>
              {PHASES.slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex-1">
                  <div className={cx('h-3 rounded-full', i < 3 ? 'bar-lime' : 'hatch')} />
                  <div className="mt-2 text-xs text-muted">{p.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const problem =
      mode === 'up' && !name.trim()
        ? 'Укажите имя и фамилию'
        : !/^\S+@\S+\.\S+$/.test(email.trim())
          ? 'Проверьте почту: нужен адрес вида name@mail.ru'
          : password.length < 6
            ? 'Пароль должен быть не короче 6 символов'
            : null
    if (problem) return setError(problem)
    setBusy(true)
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setError(ERRORS[error.message] ?? error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name }, emailRedirectTo: siteUrl() } })
      if (error) setError(ERRORS[error.message] ?? error.message)
      else if (!data.session) setInfo('Отправили письмо для подтверждения почты. После подтверждения войдите здесь')
    }
    setBusy(false)
  }

  async function forgot() {
    setError(null)
    setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Впишите почту, и мы пришлём ссылку для нового пароля')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() })
    setBusy(false)
    if (error) setError(ERRORS[error.message] ?? error.message)
    else setInfo('Отправили письмо со ссылкой. Откройте её, и сайт предложит задать новый пароль')
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <h1 className="text-2xl tracking-tight">{mode === 'in' ? 'Вход' : 'Регистрация'}</h1>
          <p className="mt-1 text-muted">{mode === 'in' ? 'Кабинет команды агентства' : 'После регистрации учредитель откроет вам доступ'}</p>
        </div>
        {mode === 'up' && (
          <Field label="Имя и фамилия">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
        )}
        <Field label="Почта">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field
          label="Пароль"
          hint={
            mode === 'up' ? (
              'Не короче 6 символов'
            ) : (
              <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={forgot}>
                Забыли пароль?
              </button>
            )
          }
        >
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </Field>
        {error && <p className="rounded-2xl bg-orange-100 px-4 py-3 text-bad">{error}</p>}
        {info && <p className="rounded-2xl bg-soft px-4 py-3">{info}</p>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">
          {mode === 'in' ? 'Войти' : 'Зарегистрироваться'}
        </Button>
        <p className="text-center text-muted">
          {mode === 'in' ? 'Нет кабинета?' : 'Уже есть кабинет?'}{' '}
          <button
            type="button"
            className="text-ink underline underline-offset-4"
            onClick={() => {
              setMode(mode === 'in' ? 'up' : 'in')
              setError(null)
              setInfo(null)
            }}
          >
            {mode === 'in' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </form>
    </Shell>
  )
}

export function Pending() {
  return (
    <Shell>
      <h1 className="text-2xl tracking-tight">Кабинет создан</h1>
      <p className="mt-2 text-muted">Учредители уже получили уведомление. Когда вам откроют доступ, обновите страницу</p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Обновить
        </Button>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
          Выйти
        </Button>
      </div>
    </Shell>
  )
}

/** Профиль не загрузился: связь, VPN или сама база. Доступ при этом может быть — не пугаем экраном для новичков */
export function Offline({ reason }: { reason: string }) {
  return (
    <Shell>
      <h1 className="text-2xl tracking-tight">Нет связи с базой</h1>
      <p className="mt-2 text-muted">Не получилось загрузить ваш профиль. Проверьте интернет или VPN и попробуйте ещё раз. Доступ к кабинету при этом никуда не делся</p>
      <p className="mt-3 text-xs break-words text-faint">{reason}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Попробовать снова
        </Button>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
          Выйти
        </Button>
      </div>
    </Shell>
  )
}

export function NotConfigured() {
  return (
    <Shell>
      <h1 className="text-2xl tracking-tight">Подключите Supabase</h1>
      <p className="mt-2 text-muted">Сайту нужны адрес и ключ базы. Впишите их в файл .env.production и опубликуйте сайт заново</p>
      <pre className="mt-4 overflow-x-auto rounded-2xl bg-soft p-4 text-xs">{`VITE_SUPABASE_URL=https://xxxx.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</pre>
      <p className="mt-3 text-muted">Они лежат в Supabase: Project Settings, раздел API. Подробности в README</p>
    </Shell>
  )
}

/** Пришли по ссылке из письма «Забыли пароль?»: задаём новый пароль */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('Пароль должен быть не короче 6 символов')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <h1 className="text-2xl tracking-tight">Новый пароль</h1>
          <p className="mt-1 text-muted">Придумайте пароль, с ним вы будете входить дальше</p>
        </div>
        <Field label="Пароль" hint="Не короче 6 символов">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        {error && <p className="rounded-2xl bg-orange-100 px-4 py-3 text-bad">{error}</p>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">
          Сохранить пароль
        </Button>
      </form>
    </Shell>
  )
}
