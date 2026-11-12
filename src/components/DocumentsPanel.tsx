import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, ExternalLink, FileUp, Link2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DOC_KINDS, docKindLabel } from '../lib/constants'
import { dateTime, fileSize } from '../lib/format'
import type { Doc, DocKind } from '../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { toast } from '../lib/toast'
import { Button, Empty, Input, Select, Spinner, cx } from './ui'

const BUCKET = 'documents'

function safeName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

export async function openDoc(d: Doc) {
  if (d.external_url) {
    window.open(d.external_url, '_blank', 'noopener')
    return
  }
  if (!d.storage_path) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 120, { download: d.name })
  if (error || !data) toast(`Не удалось открыть файл: ${error?.message}`)
  else window.open(data.signedUrl, '_blank', 'noopener')
}

export async function deleteDoc(d: Doc) {
  if (d.storage_path) await supabase.storage.from(BUCKET).remove([d.storage_path])
  const { error } = await supabase.from('documents').delete().eq('id', d.id)
  return error?.message ?? null
}

export function DocRow({ d, onDelete, extra }: { d: Doc; onDelete: () => void; extra?: ReactNode }) {
  const { personName } = useAuth()
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="inline-flex h-6 min-w-[86px] items-center justify-center rounded-md bg-base px-2 text-[11px] font-medium text-muted ring-1 ring-line">{docKindLabel(d.kind)}</span>
      <div className="min-w-0 flex-1">
        <button className="block max-w-full truncate text-left text-[13px] font-medium hover:text-accent" onClick={() => openDoc(d)}>
          {d.name}
        </button>
        <div className="truncate text-xs text-muted">
          {extra}
          {extra ? ', ' : ''}
          {d.external_url ? 'ссылка' : fileSize(d.size)}
          {d.uploaded_by ? `, ${personName(d.uploaded_by)}` : ''}, {dateTime(d.created_at)}
        </div>
      </div>
      <button className="rounded-md p-1.5 text-faint hover:bg-base hover:text-ink" onClick={() => openDoc(d)} aria-label={d.external_url ? 'Открыть ссылку' : 'Скачать'}>
        {d.external_url ? <ExternalLink className="size-4" /> : <Download className="size-4" />}
      </button>
      <button
        className="rounded-md p-1.5 text-faint hover:bg-rose-50 hover:text-rose-700"
        onClick={() => {
          if (confirm(`Удалить «${d.name}»?`)) onDelete()
        }}
        aria-label="Удалить"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}

export function DocumentsPanel({ bloggerId, integrationId, campaignId, onCount }: { bloggerId?: string; integrationId?: string; campaignId?: string; onCount?: (n: number) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [kind, setKind] = useState<DocKind>('contract')
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [link, setLink] = useState({ name: '', url: '' })
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (bloggerId) q = q.eq('blogger_id', bloggerId)
    if (integrationId) q = q.eq('integration_id', integrationId)
    if (campaignId) q = q.eq('campaign_id', campaignId)
    const { data } = await q
    setDocs((data as Doc[]) ?? [])
    onCount?.(data?.length ?? 0)
  }, [bloggerId, integrationId, campaignId, onCount])

  useEffect(() => {
    load()
  }, [load])

  async function upload(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(true)
    let ok = 0
    for (const f of list) {
      const folder = bloggerId ? `bloggers/${bloggerId}` : campaignId ? `campaigns/${campaignId}` : 'misc'
      const path = `${folder}/${safeName(f.name)}`
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
      if (up.error) {
        toast(`«${f.name}» не загрузился: ${up.error.message}`)
        continue
      }
      const { error } = await supabase.from('documents').insert({
        blogger_id: bloggerId ?? null,
        integration_id: integrationId ?? null,
        campaign_id: campaignId ?? null,
        kind,
        name: f.name,
        storage_path: path,
        size: f.size,
        mime: f.type,
      })
      if (error) toast(`«${f.name}»: ${error.message}`)
      else ok++
    }
    setBusy(false)
    if (ok) toast(ok === 1 ? 'Файл загружен' : `Загружено файлов: ${ok}`)
    if (input.current) input.current.value = ''
    load()
  }

  async function addLink() {
    if (!link.url.trim()) return
    const { error } = await supabase.from('documents').insert({
      blogger_id: bloggerId ?? null,
      integration_id: integrationId ?? null,
      campaign_id: campaignId ?? null,
      kind,
      name: link.name.trim() || link.url.trim(),
      external_url: link.url.trim(),
    })
    if (error) return toast(error.message)
    setLink({ name: '', url: '' })
    setLinkMode(false)
    toast('Ссылка добавлена')
    load()
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setHover(true)
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault()
          setHover(false)
          upload(e.dataTransfer.files)
        }}
        className={cx('rounded-xl border border-dashed p-4 transition-colors', hover ? 'border-accent bg-accent-soft' : 'border-line bg-base/50')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} aria-label="Тип документа" className="w-40">
            {DOC_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          <Button variant="primary" loading={busy} onClick={() => input.current?.click()}>
            <FileUp className="size-4" />
            Загрузить файл
          </Button>
          <Button variant="ghost" onClick={() => setLinkMode((v) => !v)}>
            <Link2 className="size-4" />
            Добавить ссылку
          </Button>
          <span className="text-xs text-muted">или перетащите файлы сюда</span>
        </div>
        {linkMode && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input placeholder="Название, например «Договор подписанный»" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} className="min-w-[200px] flex-1" />
            <Input placeholder="https://disk.yandex.ru/…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} className="min-w-[200px] flex-1" />
            <Button onClick={addLink}>Сохранить ссылку</Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {docs === null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <Empty title="Документов пока нет">Загрузите договор, акт, чек или скрин статистики.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {docs.map((d) => (
              <DocRow
                key={d.id}
                d={d}
                onDelete={async () => {
                  const err = await deleteDoc(d)
                  if (err) toast(err)
                  else {
                    toast('Документ удалён')
                    load()
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
