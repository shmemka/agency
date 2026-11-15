import { useEffect, useState, type FormEvent } from 'react'
import { siteUrl, supabase } from '../lib/supabase'

import { inviteUrl, readInvite } from '../lib/invite'
import { humanError } from '../lib/toast'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Segmented, cx } from '../components/ui'
import { ArtScreen, ArtTitle, BIG_FIELD } from '../components/ArtScreen'

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Почта или пароль не подходят',
  'Email not confirmed': 'Почта не подтверждена. Откройте письмо и перейдите по ссылке',
  'User already registered': 'Эта почта уже зарегистрирована. Войдите',
}

/** Служебные экраны до входа в кабинет: та же иллюстрация, что на входе и при выборе кабинета */
export function Shell({ children, corner }: { children: React.ReactNode; corner?: React.ReactNode }) {
  return (
    <ArtScreen corner={corner}>
      {/* заголовки и кнопки внутри — того же размера, что на входе и выборе кабинета */}
      <div className="rise flex w-full max-w-lg flex-col items-center [&_button[data-variant]]:h-14 [&_button[data-variant]]:min-w-64 [&_button[data-variant]]:text-[16px] [&_h1]:text-[26px] [&_h1]:leading-8 [&_h1]:text-balance md:[&_h1]:text-[34px] md:[&_h1]:leading-10">
        {children}
      </div>
    </ArtScreen>
  )
}

/** Название кабинета по ссылке-приглашению, пока человек ещё не вошёл */
export function useInviteName(token: string | null) {
  const [name, setName] = useState<string | null | undefined>(token ? undefined : null)
  useEffect(() => {
    if (!token) return
    let alive = true
    supabase.rpc('invite_info', { p_token: token }).then(({ data }) => alive && setName((data as { name?: string } | null)?.name ?? null))
    return () => {
      alive = false
    }
  }, [token])
  return name
}

export function Login() {
  const invite = readInvite()
  const inviteName = useInviteName(invite)
  // по приглашению чаще приходят новые люди: сразу показываем регистрацию
  const [mode, setMode] = useState<'in' | 'up'>(invite ? 'up' : 'in')
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
      if (error) setError(ERRORS[error.message] ?? humanError(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name }, emailRedirectTo: invite ? inviteUrl(invite) : siteUrl() } })
      if (error) setError(ERRORS[error.message] ?? humanError(error.message))
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
    if (error) setError(ERRORS[error.message] ?? humanError(error.message))
    else setInfo('Отправили письмо со ссылкой. Откройте её, и сайт предложит задать новый пароль')
  }

  const switchMode = (m: 'in' | 'up') => {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  return (
    <ArtScreen>
      <div className="rise flex w-full max-w-sm flex-col items-center">
        <ArtTitle
          title={mode === 'in' ? 'С возвращением!' : 'Добро пожаловать!'}
          sub={
            inviteName
              ? `Вас пригласили в команду «${inviteName}». ${mode === 'in' ? 'Войдите' : 'Зарегистрируйтесь'}, и вы сразу попадёте в кабинет`
              : mode === 'in'
                ? 'Сверка - кабинет агентства для работы с блогерами'
                : 'Потом создадите кабинет или присоединитесь к команде'
          }
        />
        <Segmented
          size="lg"
          className="mt-7 w-full"
          value={mode}
          onChange={switchMode}
          options={[
            { id: 'in', label: 'Вход' },
            { id: 'up', label: 'Регистрация' },
          ]}
        />
        <form onSubmit={submit} noValidate className="mt-3 flex w-full flex-col gap-3">
          {mode === 'up' && <input key="name" className={cx('rise', BIG_FIELD)} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Имя и фамилия" aria-label="Имя и фамилия" />}
          <input className={BIG_FIELD} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="Почта" aria-label="Почта" />
          <PasswordField value={password} onChange={setPassword} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder={mode === 'in' ? 'Пароль' : 'Пароль, не короче 6 символов'} />
          {error && <p className="fade rounded-3xl bg-orange-100 px-5 py-3 text-bad">{error}</p>}
          {info && <p className="fade rounded-3xl bg-surface px-5 py-3">{info}</p>}
          <Button variant="primary" type="submit" loading={busy} className="mt-1 h-14! w-full text-[16px]!">
            {mode === 'in' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
          {mode === 'in' && (
            <button type="button" onClick={forgot} className="mx-auto rounded-full px-4 py-2 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink">
              Забыли пароль?
            </button>
          )}
        </form>
      </div>
    </ArtScreen>
  )
}

/** Пароль с кнопкой «показать»: глаз меняется плавно */
function PasswordField({ value, onChange, autoComplete, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder: string; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative w-full">
      <input className={cx(BIG_FIELD, 'pr-14')} type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} aria-label="Пароль" autoFocus={autoFocus} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
        title={shown ? 'Скрыть пароль' : 'Показать пароль'}
        className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-faint transition-[color,background-color,transform] duration-150 hover:bg-ink/5 hover:text-ink active:scale-90"
      >
        {shown ? <EyeOff className="fade size-[18px]" strokeWidth={1.5} /> : <Eye className="fade size-[18px]" strokeWidth={1.5} />}
      </button>
    </div>
  )
}

/** Старые ссылки на персональные предложения блогерам: страниц больше нет */
export function OfferGone() {
  return (
    <Shell>
      <h1 className="text-2xl tracking-tight">Ссылка больше не действует</h1>
      <p className="mt-2 text-muted">Если вы блогер и получили эту ссылку, просто ответьте менеджеру в том чате, где он вам написал</p>
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
    if (error) return setError(humanError(error.message))
    onDone()
  }

  return (
    <ArtScreen>
      <div className="rise flex w-full max-w-sm flex-col items-center">
        <ArtTitle title="Новый пароль" sub="Придумайте пароль, с ним вы будете входить дальше" />
        <form onSubmit={submit} noValidate className="mt-7 flex w-full flex-col gap-3">
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" placeholder="Не короче 6 символов" autoFocus />
          {error && <p className="fade rounded-3xl bg-orange-100 px-5 py-3 text-bad">{error}</p>}
          <Button variant="primary" type="submit" loading={busy} className="mt-1 h-14! w-full text-[16px]!">
            Сохранить пароль
          </Button>
        </form>
      </div>
    </ArtScreen>
  )
}
