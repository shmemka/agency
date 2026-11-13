import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Check, FileCheck2, Handshake, Repeat, Target, TrendingUp, UserRound, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AGENCY } from '../lib/constants'
import type { Platform } from '../lib/types'
import { Avatar, Field, Input, Spinner, Textarea, cx } from '../components/ui'

interface Data {
  agency: string | null
  nick: string
  platform: Platform
  avatar_url: string | null
  manager: string | null
  manager_avatar: string | null
  replied: boolean
  error?: string
}

/** Слова под площадку: в TikTok и YouTube — ролики, во VK и Telegram — посты */
const words = (p: Platform) => (p === 'tiktok' || p === 'youtube' ? { one: 'ролик', make: 'снять ролик' } : { one: 'пост', make: 'выложить пост' })

// Только то, что агентство действительно выполняет на старте: блогеру платит бренд, сроки фиксируются в договоре
const STATS = [
  ['0 ₽', 'комиссия для блогера'],
  ['100%', 'выходов с маркировкой через ОРД'],
  ['1', 'менеджер на все вопросы'],
  ['1 день', 'на ответ менеджера'],
]

const PERKS = [
  { icon: Target, title: 'Бренды под твою аудиторию', text: 'Предлагаем только тех рекламодателей, которые зайдут твоим зрителям. Не нравится бренд — просто отказываешься' },
  { icon: Zap, title: 'ТЗ без воды', text: 'Короткий бриф: что сказать, что показать и к какому сроку. Подачу придумываешь ты, это твой стиль' },
  { icon: FileCheck2, title: 'Маркировка на нас', text: 'Регистрируем креатив в ОРД и выдаём erid. Помогаем с договором и актом, чтобы не было штрафов' },
  { icon: UserRound, title: 'Личный менеджер', text: 'Один человек ведёт тебя от первого сообщения до отчёта и отвечает в течение рабочего дня' },
  { icon: Repeat, title: 'Новые бренды после удачного выхода', text: 'Если интеграция зашла, возвращаемся с новыми предложениями, когда появляется подходящий рекламодатель' },
  { icon: TrendingUp, title: 'Цена растёт вместе с тобой', text: 'Показываем брендам твою статистику и прошлые выходы, чтобы ставка поднималась' },
]

const TERMS = [
  ['Твоя цена', 'Называешь сам, мы её не урезаем. Нашу комиссию платит бренд'],
  ['Оплата', 'Бренд платит тебе по договору. Сумму, предоплату и сроки фиксируем до старта, а не после выхода'],
  ['Эксклюзив', 'Не нужен. Работай с кем хочешь, без абонентской платы'],
  ['Оформление', 'Самозанятость или ИП. Нет самозанятости — поможем оформить, это делается в приложении «Мой налог»'],
  ['Отчёт', 'Скрин статистики через 3 дня после выхода, и всё'],
]

function Logo({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-full bg-ink">
        <span className="bar-lime size-2.5 rounded-full" />
      </span>
      <span className="text-[15px] font-medium">{name}</span>
    </span>
  )
}

export function OfferPage() {
  const params = useParams()
  const [sp] = useSearchParams()
  const token = params.token ?? sp.get('t') ?? ''
  const [d, setD] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [contact, setContact] = useState('')
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const form = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.rpc('get_offer', { p_token: token }).then(({ data, error }) => {
      const res = data as Data | null
      if (error || !res || res.error) return setState('missing')
      setD(res)
      setSent(res.replied)
      setState('ok')
      document.title = `${res.nick} × ${res.agency || AGENCY}`
    })
  }, [token])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!contact.trim()) return setErr('Оставь Telegram или телефон, чтобы мы могли написать')
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.rpc('reply_offer', { p_token: token, p_contact: contact, p_text: text })
    setBusy(false)
    const code = (data as { error?: string })?.error
    if (code === 'too_often') return setErr('Отклик уже у нас. Отправить ещё раз можно через минуту')
    if (error || code) return setErr('Не получилось отправить. Попробуй ещё раз через минуту')
    setSent(true)
  }

  const toForm = () => form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (state === 'loading')
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )

  if (state === 'missing' || !d)
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pt-6 pb-16">
        <Logo name={AGENCY} />
        <div className="mt-16 rounded-card bg-surface p-6 text-center">
          <h1 className="text-xl">Страница не найдена</h1>
          <p className="mt-2 text-muted">Проверь, что ссылка скопирована целиком, или напиши менеджеру, который её прислал</p>
        </div>
      </div>
    )

  const agency = d.agency || AGENCY
  const w = words(d.platform)
  const manager = d.manager?.trim().split(/\s+/)[0] || 'менеджер'

  return (
    <div className="mx-auto min-h-full max-w-5xl px-3 pt-5 pb-16 sm:px-4 sm:pt-6">
      <header className="mb-5 flex items-center justify-between gap-3 px-1 sm:mb-6">
        <Logo name={agency} />
        <span className="truncate text-[13px] text-muted">Приглашение для {d.nick}</span>
      </header>

      {/* главный экран */}
      <section className="relative overflow-hidden rounded-card bg-ink px-6 pt-8 pb-7 text-white sm:px-12 sm:pt-14 sm:pb-12">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-32 size-[26rem] rounded-full bg-lime/25 blur-3xl" />
        <div className="relative">
          <div className="flex items-center">
            <Avatar name={d.nick} src={d.avatar_url} className="size-14 bg-white! text-base ring-4 ring-ink sm:size-16" />
            <span className="-ml-3 flex size-14 items-center justify-center rounded-full bg-lime text-ink ring-4 ring-ink sm:size-16">
              <Handshake className="size-6" strokeWidth={1.5} />
            </span>
            <Avatar name={d.manager || agency} src={d.manager_avatar} className="-ml-3 size-14 bg-white! text-base ring-4 ring-ink sm:size-16" />
          </div>
          <h1 className="mt-7 max-w-3xl text-[34px] leading-[1.05] font-medium tracking-[-0.03em] break-words sm:text-[60px]">
            {d.nick}, давай делать рекламу вместе
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-6 text-white/70 sm:text-[17px] sm:leading-7">
            Мы {agency}, агентство рекламы у блогеров. Приводим бренды, которым подходит твоя аудитория, и забираем рутину: переговоры, маркировку и документы. Тебе остаётся {w.make}.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <button onClick={toForm} className="h-12 rounded-full bg-lime px-6 text-[15px] font-medium text-ink transition-transform duration-150 hover:bg-lime/90 active:scale-[0.98]">
              Хочу сотрудничать
            </button>
            <a href="#terms" className="flex h-12 items-center rounded-full px-5 text-[15px] text-white/80 ring-1 ring-white/20 hover:bg-white/10">
              Посмотреть условия
            </a>
          </div>
        </div>
      </section>

      {/* цифры */}
      <section className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6 rounded-card bg-surface px-6 py-7 sm:grid-cols-4 sm:px-12">
        {STATS.map(([v, k]) => (
          <div key={k}>
            <p className="num text-[28px] leading-8 font-medium tracking-tight sm:text-[34px] sm:leading-10">{v}</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">{k}</p>
          </div>
        ))}
      </section>

      {/* почему мы */}
      <section className="mt-12 px-1 sm:mt-16">
        <h2 className="max-w-2xl text-[26px] leading-8 tracking-tight sm:text-[36px] sm:leading-10">Почему блогеры выбирают нас</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map(({ icon: I, title, text }) => (
            <div key={title} className="rounded-card bg-surface p-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-soft">
                <I className="size-5" strokeWidth={1.5} />
              </span>
              <h3 className="mt-5 text-[17px] leading-6 font-medium">{title}</h3>
              <p className="mt-2 leading-6 text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* условия */}
      <section id="terms" className="mt-12 scroll-mt-6 sm:mt-16">
        <h2 className="px-1 text-[26px] leading-8 tracking-tight sm:text-[36px] sm:leading-10">Условия</h2>
        <dl className="mt-6 rounded-card bg-surface px-6 py-2 sm:px-8">
          {TERMS.map(([k, v], i) => (
            <div key={k} className={cx('grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6', i > 0 && 'border-t border-line')}>
              <dt className="font-medium">{k}</dt>
              <dd className="leading-6 text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* шаги */}
      <section className="mt-12 sm:mt-16">
        <h2 className="px-1 text-[26px] leading-8 tracking-tight sm:text-[36px] sm:leading-10">Как начнём</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['Откликаешься', 'Оставляешь контакт внизу этой страницы. Это ни к чему не обязывает'],
            [`Пишет ${manager}`, 'В течение рабочего дня. Обсуждаем цену, форматы и темы, которые тебе интересны'],
            ['Первый бренд', `Присылаем рекламодателя с готовым ТЗ. Ты делаешь ${w.one}, бренд платит по договору`],
          ].map(([t, x], i) => (
            <li key={t} className="rounded-card bg-surface p-6">
              <span className="num flex size-8 items-center justify-center rounded-full bg-ink text-[13px] text-white">{i + 1}</span>
              <h3 className="mt-5 text-[17px] leading-6 font-medium">{t}</h3>
              <p className="mt-2 leading-6 text-muted">{x}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* отклик */}
      <section ref={form} className="mt-12 scroll-mt-6 sm:mt-16">
        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col rounded-card bg-ink p-6 text-white sm:p-8">
            <Avatar name={d.manager || agency} src={d.manager_avatar} className="size-16 bg-white! text-lg" />
            <p className="mt-6 text-[13px] text-white/60">Твой менеджер</p>
            <p className="mt-1 text-[22px] leading-7 font-medium">{d.manager || agency}</p>
            <p className="mt-4 leading-6 text-white/70">Отвечу на вопросы, расскажу про бренды и помогу с самозанятостью, если её ещё нет. Пиши как удобно</p>
          </div>

          <div className="rounded-card bg-surface p-6 sm:p-8">
            {sent ? (
              <div className="flex h-full flex-col justify-center py-6">
                <span className="flex size-12 items-center justify-center rounded-full bg-lime">
                  <Check className="size-6" strokeWidth={2} />
                </span>
                <h2 className="mt-5 text-[22px] leading-7 font-medium">Отклик у нас</h2>
                <p className="mt-2 leading-6 text-muted">
                  {manager === 'менеджер' ? 'Менеджер напишет' : `${manager} напишет`} тебе в течение дня. Если что-то забыл добавить, отправь ещё раз
                </p>
                <button onClick={() => setSent(false)} className="mt-6 self-start text-[13px] text-muted underline underline-offset-4 hover:text-ink">
                  Отправить ещё раз
                </button>
              </div>
            ) : (
              <form onSubmit={send} noValidate className="flex flex-col gap-4">
                <div>
                  <h2 className="text-[22px] leading-7 font-medium">Откликнуться</h2>
                  <p className="mt-1 leading-6 text-muted">Оставь контакт, и мы напишем в течение дня</p>
                </div>
                <Field label="Как с тобой связаться">
                  <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="@telegram или телефон" autoComplete="tel" className="h-12 text-[15px]" maxLength={200} />
                </Field>
                <Field label="Сообщение, если хочешь">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Цена за интеграцию, вопросы, удобное время для связи" className="text-[15px]" maxLength={2000} />
                </Field>
                {err && <p className="text-[13px] text-bad">{err}</p>}
                <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-white transition-transform duration-150 hover:bg-ink/85 active:scale-[0.98] disabled:opacity-50">
                  {busy && <Spinner />}
                  Отправить отклик
                </button>
                <p className="flex items-start gap-2 text-xs leading-5 text-faint">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                  Контакт увидит только твой менеджер. Никакой рассылки
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-12 px-1 text-[13px] text-faint">
        {agency}, {new Date().getFullYear()}
      </footer>
    </div>
  )
}
