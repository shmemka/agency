import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Copy, MessageSquareText, Send, Sparkles } from 'lucide-react'
import { siteUrl, supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { AGENCY } from '../lib/constants'
import { dateTime, plural } from '../lib/format'
import type { Blogger, Offer } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, IconButton, Spinner, cx } from './ui'
import { promptDialog } from './dialogs'

export const offerUrl = (token: string) => siteUrl(`/o/${token}`)

const message = (url: string) =>
  `Привет! Это ${AGENCY}, агентство рекламы у блогеров. Посмотрели твой контент и хотим предложить сотрудничество. Собрали условия на одной странице, там же можно сразу ответить: ${url}`

/** Ник в Telegram из поля «Контакт»: @nick, nick, t.me/nick, «tg: @nick, звонить вечером» */
export function tgUsername(contact: string | null | undefined) {
  const s = contact?.trim()
  if (!s) return null
  const m =
    s.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,32})/i) ??
    s.match(/(?:^|[\s,;:(])@([A-Za-z0-9_]{4,32})\b/) ??
    s.match(/^@?([A-Za-z][A-Za-z0-9_]{3,31})$/)
  return m?.[1] ?? null
}

/** Чат с человеком, сообщение уже вставлено в поле ввода */
const tgLink = (user: string, text: string) => `https://t.me/${user}?text=${encodeURIComponent(text)}`

async function latestOffer(bloggerId: string) {
  const { data } = await supabase.from('offers').select('*').eq('blogger_id', bloggerId).order('created_at', { ascending: false }).limit(1)
  return ((data ?? [])[0] as Offer) ?? null
}

async function createOffer(bloggerId: string): Promise<Offer | string> {
  const { data, error } = await supabase.from('offers').insert({ blogger_id: bloggerId }).select('*').single()
  if (error) return error.message.includes('offers') ? 'Не получилось: сначала запустите миграцию 006_offers.sql в Supabase' : error.message
  return data as Offer
}

/**
 * Отправка в Telegram в один клик: находит или создаёт предложение и открывает чат с готовым сообщением.
 * Вкладку открываем сразу, до запросов к базе, иначе браузер на телефоне посчитает её всплывающим окном и заблокирует
 */
export function useSendOffer() {
  const { patchBlogger } = useData()
  return async (b: Blogger, known?: Offer | null): Promise<Offer | null> => {
    const user = tgUsername(b.contact)
    if (!user) return null
    let o = known ?? null
    const w = o ? null : window.open('about:blank', '_blank')
    if (!o) {
      const res = (await latestOffer(b.id)) ?? (await createOffer(b.id))
      if (typeof res === 'string') {
        w?.close()
        toast(res)
        return null
      }
      o = res
    }
    const url = tgLink(user, message(offerUrl(o.token)))
    if (w) {
      w.opener = null
      w.location.href = url
    } else if (!window.open(url, '_blank', 'noopener')) window.location.href = url
    if (b.status === 'in_base') {
      const err = await patchBlogger(b.id, { status: 'offer_sent' })
      toast(err ?? 'Чат открыт, осталось нажать «Отправить». Статус: Отправили предложение')
    } else toast('Чат открыт, осталось нажать «Отправить»')
    return o
  }
}

/** Кнопка в строке таблицы: видна при наведении, только если у блогера есть Telegram и предложение ещё актуально */
export function SendOfferButton({ b, className }: { b: Blogger; className?: string }) {
  const send = useSendOffer()
  const user = tgUsername(b.contact)
  if (!user || (b.status !== 'in_base' && b.status !== 'offer_sent')) return null
  return (
    <IconButton
      label={`Отправить предложение в Telegram @${user}`}
      onClick={(e) => {
        e.stopPropagation()
        send(b)
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cx('size-8!', className)}
    >
      <Send className="size-4" strokeWidth={1.5} />
    </IconButton>
  )
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    await promptDialog({ title: 'Скопируйте текст', body: 'Браузер не дал скопировать автоматически. Текст уже выделен', value: text, readOnly: true, multiline: text.length > 80 })
  }
}

/** Приглашение к сотрудничеству: персональная страница для блогера и её статистика */
export function OfferCard({ b }: { b: Blogger }) {
  const { patchBlogger } = useData()
  const send = useSendOffer()
  const user = tgUsername(b.contact)
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => setOffer(await latestOffer(b.id)), [b.id])

  useEffect(() => {
    load()
  }, [load])

  async function generate() {
    setBusy(true)
    const o = await createOffer(b.id)
    setBusy(false)
    if (typeof o === 'string') return toast(o)
    setOffer(o)
    if (b.status === 'in_base') await patchBlogger(b.id, { status: 'offer_sent' })
    try {
      await navigator.clipboard.writeText(message(offerUrl(o.token)))
      toast(b.status === 'in_base' ? 'Сообщение со ссылкой скопировано, статус: Отправили предложение' : 'Сообщение со ссылкой скопировано')
    } catch {
      toast('Предложение готово')
    }
  }

  const url = offer ? offerUrl(offer.token) : ''

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base">Предложение о сотрудничестве</h3>
        {offer === undefined && <Spinner />}
      </div>

      {offer === null && (
        <>
          <p className="mb-4 text-muted">
            Персональная страница для {b.nick}: кто мы, условия и почему с нами выгодно. На ней блогер сразу может откликнуться.{' '}
            {user ? `Кнопка откроет чат с @${user}, сообщение со ссылкой уже будет вставлено` : 'Чтобы отправлять в Telegram в один клик, укажите ник блогера в поле «Контакт» на вкладке «Данные»'}
          </p>
          <div className="flex flex-wrap gap-2">
            {user && (
              <Button variant="primary" onClick={async () => setOffer((await send(b)) ?? null)}>
                <Send className="size-4" strokeWidth={1.5} />
                Отправить в Telegram
              </Button>
            )}
            <Button variant={user ? 'secondary' : 'primary'} loading={busy} onClick={generate}>
              {!busy && <Sparkles className="size-4" strokeWidth={1.5} />}
              {user ? 'Только сгенерировать' : 'Сгенерировать предложение'}
            </Button>
          </div>
        </>
      )}

      {offer && (
        <>
          <p className="mb-4 text-muted">
            Создано {dateTime(offer.created_at)}.{' '}
            {offer.views ? `Блогер открыл ${offer.views} ${plural(offer.views, 'раз', 'раза', 'раз')}, последний раз ${dateTime(offer.last_seen_at!)}` : 'Блогер ещё не открывал'}
          </p>

          {offer.replied_at && (
            <div className="mb-4 rounded-inner bg-lime/30 px-4 py-3">
              <p className="text-xs text-muted">Откликнулся {dateTime(offer.replied_at)}</p>
              <p className="mt-1 font-medium break-words">{offer.reply_contact}</p>
              {offer.reply_text && <p className="mt-1 whitespace-pre-line break-words">{offer.reply_text}</p>}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-2xl bg-soft py-1 pr-1 pl-4">
            <span className="min-w-0 flex-1 truncate text-[13px]">{url}</span>
            <a href={url} target="_blank" rel="noreferrer" title="Открыть страницу" className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-ink/5">
              <ArrowUpRight className="size-4" strokeWidth={1.5} />
            </a>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {user && (
              <Button size="sm" variant="primary" onClick={() => send(b, offer)}>
                <Send className="size-3.5" strokeWidth={1.5} />
                Написать в Telegram
              </Button>
            )}
            <Button size="sm" variant={user ? 'secondary' : 'primary'} onClick={() => copy(message(url), 'Сообщение со ссылкой скопировано')}>
              <MessageSquareText className="size-3.5" strokeWidth={1.5} />
              Скопировать сообщение
            </Button>
            <Button size="sm" onClick={() => copy(url, 'Ссылка скопирована')}>
              <Copy className="size-3.5" strokeWidth={1.5} />
              Только ссылку
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
