import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, Input } from '../components/ui'

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Неверная почта или пароль.',
  'Email not confirmed': 'Почта не подтверждена. Откройте письмо от Supabase и перейдите по ссылке.',
  'User already registered': 'Такая почта уже зарегистрирована — войдите.',
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
    setBusy(true)
    setError(null)
    setInfo(null)
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(ERRORS[error.message] ?? error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
      })
      if (error) setError(ERRORS[error.message] ?? error.message)
      else if (!data.session) setInfo('Мы отправили письмо для подтверждения почты. После подтверждения войдите здесь.')
    }
    setBusy(false)
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_520px]">
      <div className="relative hidden overflow-hidden bg-night p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="font-display text-sm font-semibold">Агентство</div>
        <div>
          <p className="font-display max-w-lg text-[40px] leading-[1.1] font-semibold tracking-tight">
            Блогеры, договоры и выходы — в одном месте для всей команды.
          </p>
          <div className="mt-10 flex max-w-md gap-1.5" aria-hidden>
            {['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-teal-500', 'bg-emerald-600'].map((c, i) => (
              <div key={c} className="flex-1">
                <div className={`h-1.5 rounded-full ${c}`} style={{ opacity: 1 - i * 0.12 }} />
                <div className="mt-2 text-[11px] text-white/50">{['Поиск', 'Переговоры', 'Документы', 'Оплата', 'Выход'][i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-white/40">Доступ только для команды агентства</div>
      </div>

      <div className="flex items-center justify-center bg-surface p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="mb-2">
            <h1 className="font-display text-xl font-semibold tracking-tight">{mode === 'in' ? 'Вход' : 'Регистрация специалиста'}</h1>
            <p className="mt-1 text-sm text-muted">
              {mode === 'in' ? 'Войдите в личный кабинет.' : 'После регистрации админ откроет вам доступ в разделе «Команда».'}
            </p>
          </div>
          {mode === 'up' && (
            <Field label="Имя и фамилия">
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          <Field label="Почта">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Пароль" hint={mode === 'up' ? 'Не короче 6 символов' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
          </Field>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          {info && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{info}</p>}
          <Button variant="primary" type="submit" loading={busy} className="w-full">
            {mode === 'in' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
          <p className="text-center text-sm text-muted">
            {mode === 'in' ? 'Нет кабинета?' : 'Уже есть кабинет?'}{' '}
            <button
              type="button"
              className="font-medium text-night underline-offset-2 hover:underline"
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
      </div>
    </div>
  )
}

export function Pending() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-surface p-8 text-center shadow-sm ring-1 ring-line">
        <h1 className="font-display text-lg font-semibold">Кабинет создан</h1>
        <p className="mt-2 text-sm text-muted">
          Попросите админа открыть вам доступ: раздел «Команда» → «Открыть доступ». После этого обновите страницу.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Обновить</Button>
          <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  )
}

export function NotConfigured() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-line">
        <h1 className="font-display text-lg font-semibold">Подключите Supabase</h1>
        <p className="mt-2 text-sm text-muted">Сайту не хватает адреса и ключа базы. Добавьте две переменные окружения и пересоберите сайт:</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-base p-3 text-xs">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</pre>
        <p className="mt-3 text-sm text-muted">Где их взять: Supabase → Project Settings → API. Подробная инструкция — в README репозитория.</p>
      </div>
    </div>
  )
}
