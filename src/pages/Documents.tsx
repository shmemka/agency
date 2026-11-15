import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { fetchAll, supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { DOC_KINDS } from '../lib/constants'
import type { Doc } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Empty, Input, PageHeader, Select, SkelList } from '../components/ui'
import { DocRow } from '../components/DocumentsPanel'

export function Documents() {
  const { blogger, campaign, reload } = useData()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [kind, setKind] = useState('')
  const [limit, setLimit] = useState(100)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      setDocs(await fetchAll<Doc>((f, t) => supabase.from('documents').select('*').order('created_at', { ascending: false }).range(f, t)))
    } catch (e) {
      toast((e as Error).message)
      setDocs([])
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (docs ?? []).filter((d) => (!kind || d.kind === kind) && (!n || [d.name, blogger(d.blogger_id)?.nick, campaign(d.campaign_id)?.name].join(' ').toLowerCase().includes(n)))
  }, [docs, kind, q, blogger, campaign])

  return (
    <>
      <PageHeader title="Документы" sub="Договоры, акты, чеки и скрины со всех карточек. Загружают их в интеграции, карточке блогера или кампании" />
      <div className="mb-4 flex gap-2 md:flex-wrap">
        <div className="relative min-w-0 flex-1 md:min-w-52 md:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" strokeWidth={1.5} />
          <Input className="rounded-full! bg-surface pl-10" placeholder="Название или ник" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} tone="surface" className="w-36 shrink-0 md:w-44" aria-label="Тип">
          <option value="">Все типы</option>
          {DOC_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
      </div>
      {docs === null ? (
        <Card className="py-2">
          <SkelList rows={8} />
        </Card>
      ) : rows.length === 0 ? (
        <Empty title={docs.length ? 'Ничего не нашли' : 'Документов пока нет'}>{docs.length ? 'Измените поиск или тип' : 'Откройте интеграцию и загрузите договор или чек на вкладке «Документы»'}</Empty>
      ) : (
        <Card className="appear py-2">
          <ul>
            {rows.slice(0, limit).map((d) => {
              const b = blogger(d.blogger_id)
              return (
                <DocRow
                  key={d.id}
                  d={d}
                  gallery={rows}
                  extra={
                    b ? (
                      <Link to={`/bloggers/${b.id}`} className="text-ink hover:underline">
                        {b.nick}
                      </Link>
                    ) : (
                      campaign(d.campaign_id)?.name
                    )
                  }
                  onChanged={() => {
                    load()
                    reload('documents')
                  }}
                />
              )
            })}
          </ul>
          {rows.length > limit && (
            <div className="pt-2 pb-1 text-center">
              <Button onClick={() => setLimit((l) => l + 200)}>Показать ещё {Math.min(200, rows.length - limit)}</Button>
            </div>
          )}
        </Card>
      )}
    </>
  )
}
