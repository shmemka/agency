import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { fetchAll, supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { DOC_KINDS } from '../lib/constants'
import type { Doc } from '../lib/types'
import { toast } from '../lib/toast'
import { Empty, Input, PageHeader, Select, Spinner } from '../components/ui'
import { DocRow, deleteDoc } from '../components/DocumentsPanel'

export function Documents() {
  const { bloggerById, campaigns } = useData()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')

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
    return (docs ?? []).filter((d) => {
      if (kind && d.kind !== kind) return false
      if (source === 'files' && !d.storage_path) return false
      if (source === 'links' && !d.external_url) return false
      if (n) {
        const hay = [d.name, bloggerById(d.blogger_id)?.nick, campaigns.find((c) => c.id === d.campaign_id)?.name].join(' ').toLowerCase()
        if (!hay.includes(n)) return false
      }
      return true
    })
  }, [docs, kind, q, source, bloggerById, campaigns])

  return (
    <>
      <PageHeader title="Документы" sub="Договоры, акты, чеки и скрины со всех карточек. Загружать — в карточке блогера или кампании." />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Название или ник" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-44" aria-label="Тип">
          <option value="">Все типы</option>
          {DOC_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-44" aria-label="Источник">
          <option value="">Файлы и ссылки</option>
          <option value="files">Только файлы</option>
          <option value="links">Только ссылки</option>
        </Select>
      </div>
      {docs === null ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Empty title={docs.length ? 'Ничего не нашли' : 'Документов пока нет'}>
          {docs.length ? 'Измените фильтры.' : 'Откройте карточку блогера → вкладка «Документы» и загрузите договор или чек.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line rounded-xl bg-surface ring-1 ring-line">
          {rows.slice(0, 400).map((d) => {
            const b = bloggerById(d.blogger_id)
            const c = campaigns.find((x) => x.id === d.campaign_id)
            return (
              <DocRow
                key={d.id}
                d={d}
                extra={
                  b ? (
                    <Link to={`/bloggers/${b.id}`} className="font-medium text-ink hover:text-accent">
                      {b.nick}
                    </Link>
                  ) : (
                    c?.name
                  )
                }
                onDelete={async () => {
                  const err = await deleteDoc(d)
                  if (err) toast(err)
                  else load()
                }}
              />
            )
          })}
        </ul>
      )}
    </>
  )
}
