import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { BLOGGER_STATUSES, STATUSES } from '../lib/constants'
import { dateTime } from '../lib/format'
import type { Activity } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Spinner, Textarea } from './ui'

const label = (s: string | null) => STATUSES.find((x) => x.id === s)?.label ?? BLOGGER_STATUSES.find((x) => x.id === s)?.label ?? s ?? ''

/** Комментарии и история: по блогеру целиком или по одной интеграции */
export function Feed({ bloggerId, integrationId }: { bloggerId: string; integrationId?: string }) {
  const { personName, profile, isAdmin } = useAuth()
  const { pulse, campaign, integrations } = useData()
  const [items, setItems] = useState<Activity[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    let q = supabase.from('activity').select('*').eq('blogger_id', bloggerId).order('created_at', { ascending: false }).limit(150)
    if (integrationId) q = q.eq('integration_id', integrationId)
    const { data } = await q
    setItems((data as Activity[]) ?? [])
  }, [bloggerId, integrationId])

  useEffect(() => {
    load()
  }, [load, pulse])

  async function send() {
    if (!text.trim()) return
    setBusy(true)
    const { error } = await supabase.from('activity').insert({ blogger_id: bloggerId, integration_id: integrationId ?? null, kind: 'comment', body: text.trim(), actor_id: profile?.id })
    setBusy(false)
    if (error) return toast(`Комментарий не сохранился: ${error.message}`)
    setText('')
    load()
  }

  return (
    <div>
      <Textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()}
        placeholder="Что произошло: написали, ответил, прислал реквизиты"
        aria-label="Комментарий"
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={send}>
          Добавить комментарий
        </Button>
      </div>
      {items === null ? (
        <Spinner className="mt-4" />
      ) : (
        <ol className="mt-2">
          {items.map((a) => {
            const who = a.actor_id ? personName(a.actor_id) : 'Импорт'
            const where = !integrationId && a.integration_id ? campaign(integrations.find((i) => i.id === a.integration_id)?.campaign_id)?.name : null
            return (
              <li key={a.id} className="group flex gap-3 border-t border-line py-3 first:border-0">
                <Avatar name={who} className="size-7 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="text-ink">{who}</span>
                    {dateTime(a.created_at)}
                    {where && <span className="truncate">{where}</span>}
                    {a.kind === 'comment' && (a.actor_id === profile?.id || isAdmin) && (
                      <button
                        className="ml-auto text-faint opacity-0 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100"
                        aria-label="Удалить комментарий"
                        onClick={async () => {
                          if (!window.confirm('Удалить комментарий?')) return
                          await supabase.from('activity').delete().eq('id', a.id)
                          load()
                        }}
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                  {a.kind === 'comment' && <p className="mt-0.5 whitespace-pre-line">{a.body}</p>}
                  {a.kind === 'status' && (
                    <p className="mt-0.5 text-muted">
                      {label(a.from_status)} → <span className="text-ink">{label(a.to_status)}</span>
                    </p>
                  )}
                  {a.kind === 'document' && <p className="mt-0.5 text-muted">Добавлен документ «{a.body}»</p>}
                  {a.kind === 'created' && <p className="mt-0.5 text-muted">Блогер добавлен в базу</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
