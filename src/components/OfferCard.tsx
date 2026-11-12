import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Copy, MessageSquareText, Sparkles } from 'lucide-react'
import { siteUrl, supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { AGENCY } from '../lib/constants'
import { dateTime, plural } from '../lib/format'
import type { Blogger, Offer } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Spinner } from './ui'
import { promptDialog } from './dialogs'

export const offerUrl = (token: string) => siteUrl(`/o/${token}`)

const message = (url: string) =>
  `Привет! Это ${AGENCY}, агентство рекламы у блогеров. Посмотрели твой контент и хотим предложить сотрудничество. Собрали условия на одной странице, там же можно сразу ответить: ${url}`

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
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('offers').select('*').eq('blogger_id', b.id).order('created_at', { ascending: false }).limit(1)
    setOffer(((data ?? [])[0] as Offer) ?? null)
  }, [b.id])

  useEffect(() => {
    load()
  }, [load])

  async function generate() {
    setBusy(true)
    const { data, error } = await supabase.from('offers').insert({ blogger_id: b.id }).select('*').single()
    setBusy(false)
    if (error) return toast(error.message.includes('offers') ? 'Не получилось: сначала запустите миграцию 006_offers.sql в Supabase' : error.message)
    const o = data as Offer
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
          <p className="mb-4 text-muted">Персональная страница для {b.nick}: кто мы, условия и почему с нами выгодно. На ней блогер сразу может откликнуться</p>
          <Button variant="primary" loading={busy} onClick={generate}>
            {!busy && <Sparkles className="size-4" strokeWidth={1.5} />}
            Сгенерировать предложение
          </Button>
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
            <Button size="sm" variant="primary" onClick={() => copy(message(url), 'Сообщение со ссылкой скопировано')}>
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
