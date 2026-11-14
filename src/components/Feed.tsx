import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { BLOGGER_STATUSES, STATUSES } from '../lib/constants'
import { dateTime } from '../lib/format'
import type { Activity } from '../lib/types'
import { toast } from '../lib/toast'
import { Avatar, Button, Spinner } from './ui'
import { RichEditor } from './RichEditor'
import { RichText } from './RichText'
import { confirmDialog } from './dialogs'

const label = (s: string | null) => STATUSES.find((x) => x.id === s)?.label ?? BLOGGER_STATUSES.find((x) => x.id === s)?.label ?? s ?? ''

/** Комментарии и история: по блогеру целиком или по одной интеграции */
export function Feed({ bloggerId, integrationId }: { bloggerId: string; integrationId?: string }) {
  const { personName, personAvatar, profile, isAdmin } = useAuth()
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
      <RichEditor value={text} onChange={setText} onSubmit={send} compact placeholder="Что произошло: написали, ответил, прислал реквизиты" label="Комментарий" className="min-h-16" />
      <div className="mt-2 flex items-center justify-end gap-3">
        <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={send}>
          Добавить комментарий
        </Button>
      </div>
      {items === null ? (
        <Spinner className="mt-4" />
      ) : (
        <ol className="mt-2">
          {items.map((a) => {
            // без автора: «создан» — это импорт, а смена статуса — автоматика (например, отклик блогера)
            const who = a.actor_id ? personName(a.actor_id) : a.kind === 'created' ? 'Импорт' : 'Автоматически'
            const where = !integrationId && a.integration_id ? campaign(integrations.find((i) => i.id === a.integration_id)?.campaign_id)?.name : null
            return (
              <li key={a.id} className="group flex gap-3 border-t border-line py-3 first:border-0">
                <Avatar name={who} src={personAvatar(a.actor_id)} className="size-7 text-[10px]" />
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
                          if (!(await confirmDialog({ title: 'Удалить комментарий?', ok: 'Удалить', danger: true }))) return
                          const { error } = await supabase.from('activity').delete().eq('id', a.id)
                          if (error) toast(`Комментарий не удалился: ${error.message}`)
                          load()
                        }}
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                  {a.kind === 'comment' && <RichText value={a.body} className="mt-0.5" />}
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
