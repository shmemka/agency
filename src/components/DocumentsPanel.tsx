import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, EyeOff, Link2, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { DOC_KINDS, docKindLabel } from '../lib/constants'
import { date, fileSize } from '../lib/format'
import type { Doc, DocKind, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Chip, IconButton, Input, Select, Spinner, cx } from './ui'
import { confirmDialog } from './dialogs'

const BUCKET = 'documents'
const isImage = (d: Doc) => Boolean(d.storage_path && (d.mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(d.name)))

function safeName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

export async function signedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error || !data) {
    toast(`Файл не открылся: ${error?.message ?? 'нет доступа'}`)
    return null
  }
  return data.signedUrl
}

/** Просмотр картинки поверх страницы, без скачивания */
export function ImageViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fade fixed inset-0 z-[90] flex items-center justify-center bg-ink/80 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <img src={url} alt={name} className="max-h-full max-w-full rounded-2xl" onClick={(e) => e.stopPropagation()} />
      <IconButton label="Закрыть" onClick={onClose} className="absolute top-4 right-4 bg-surface">
        <X className="size-[18px]" strokeWidth={1.5} />
      </IconButton>
    </div>,
    document.body,
  )
}

export function DocRow({ d, extra, onChanged }: { d: Doc; extra?: ReactNode; onChanged: () => void }) {
  const { isAdmin, personName } = useAuth()
  const [view, setView] = useState<string | null>(null)

  async function open() {
    if (d.external_url) return void window.open(d.external_url, '_blank', 'noopener')
    if (!d.storage_path) return
    if (isImage(d)) {
      const u = await signedUrl(d.storage_path)
      if (u) setView(u)
    } else {
      const u = await signedUrl(d.storage_path, d.name)
      if (u) window.open(u, '_blank', 'noopener')
    }
  }

  async function remove() {
    if (!(await confirmDialog({ title: 'Удалить документ?', body: `«${d.name}» удалится без возможности восстановить`, ok: 'Удалить', danger: true }))) return
    if (d.storage_path) await supabase.storage.from(BUCKET).remove([d.storage_path])
    const { error } = await supabase.from('documents').delete().eq('id', d.id)
    if (error) return toast(error.message)
    toast('Документ удалён')
    onChanged()
  }

  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-line py-2 first:border-0">
      <Chip className="w-24 shrink-0 justify-center">{docKindLabel(d.kind)}</Chip>
      <div className="min-w-0 flex-1">
        <button className="block max-w-full truncate text-left hover:underline" onClick={open}>
          {d.name}
        </button>
        <div className="truncate text-xs text-muted">
          {extra}
          {extra ? ', ' : ''}
          {[d.external_url ? 'ссылка' : fileSize(d.size), d.uploaded_by ? personName(d.uploaded_by).split(' ')[0] : '', date(d.created_at)].filter(Boolean).join(', ')}
        </div>
      </div>
      {d.kind === 'stats' && (
        <IconButton
          label={d.hide_from_client ? 'Скрыт от клиента. Показать в отчёте' : 'Виден клиенту в отчёте. Скрыть'}
          className={cx('size-9', d.hide_from_client && 'bg-ink text-white hover:bg-ink/85 hover:text-white')}
          onClick={async () => {
            await supabase.from('documents').update({ hide_from_client: !d.hide_from_client }).eq('id', d.id)
            onChanged()
          }}
        >
          <EyeOff className="size-4" strokeWidth={1.5} />
        </IconButton>
      )}
      <IconButton label={d.external_url ? 'Открыть ссылку' : 'Открыть файл'} className="size-9" onClick={open}>
        {d.external_url ? <ExternalLink className="size-4" strokeWidth={1.5} /> : <Download className="size-4" strokeWidth={1.5} />}
      </IconButton>
      {isAdmin && (
        <IconButton label="Удалить" className="size-9 hover:text-bad" onClick={remove}>
          <Trash2 className="size-4" strokeWidth={1.5} />
        </IconButton>
      )}
      {view && <ImageViewer url={view} name={d.name} onClose={() => setView(null)} />}
    </li>
  )
}

/**
 * Документы блогера, интеграции или кампании.
 * В карточке блогера `choices` — его интеграции: при загрузке выбираем, к какой относится файл.
 */
export function DocumentsPanel({ bloggerId, integrationId, campaignId, choices }: { bloggerId?: string; integrationId?: string; campaignId?: string; choices?: Integration[] }) {
  const { reload, campaign } = useData()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [kind, setKind] = useState<DocKind>(campaignId ? 'invoice' : 'contract')
  const [target, setTarget] = useState(integrationId ?? '')
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [link, setLink] = useState({ name: '', url: '' })
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (integrationId) q = q.eq('integration_id', integrationId)
    else if (bloggerId) q = q.eq('blogger_id', bloggerId)
    else if (campaignId) q = q.eq('campaign_id', campaignId).is('integration_id', null)
    const { data } = await q
    setDocs((data as Doc[]) ?? [])
  }, [bloggerId, integrationId, campaignId])

  useEffect(() => {
    load()
  }, [load])

  const changed = () => {
    load()
    reload('documents')
  }
  const base = () => ({ blogger_id: bloggerId ?? null, integration_id: target || null, campaign_id: bloggerId ? null : (campaignId ?? null), kind })

  async function upload(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(true)
    let ok = 0
    for (const f of list) {
      const path = `${bloggerId ? `bloggers/${bloggerId}` : `campaigns/${campaignId}`}/${safeName(f.name)}`
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
      if (up.error) {
        toast(`«${f.name}» не загрузился: ${up.error.message}`)
        continue
      }
      const { error } = await supabase.from('documents').insert({ ...base(), name: f.name, storage_path: path, size: f.size, mime: f.type })
      if (error) toast(`«${f.name}»: ${error.message}`)
      else ok++
    }
    setBusy(false)
    if (ok) toast(ok === 1 ? 'Файл загружен' : `Загружено файлов: ${ok}`)
    if (input.current) input.current.value = ''
    changed()
  }

  async function addLink() {
    if (!link.url.trim()) return
    const { error } = await supabase.from('documents').insert({ ...base(), name: link.name.trim() || link.url.trim(), external_url: link.url.trim() })
    if (error) return toast(error.message)
    setLink({ name: '', url: '' })
    setLinkMode(false)
    toast('Ссылка добавлена')
    changed()
  }

  const targetLabel = (i: Integration) => `${date(i.publish_date) === '—' ? 'без даты' : date(i.publish_date)}, ${campaign(i.campaign_id)?.name ?? 'без кампании'}`

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
        className={cx('rounded-inner p-3 transition-colors duration-150', hover ? 'bg-lime/40' : 'hatch')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} aria-label="Тип документа" tone="surface" className="w-36">
            {DOC_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
          {choices && choices.length > 0 && (
            <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="К чему относится" tone="surface" className="w-56">
              <option value="">К блогеру в целом</option>
              {choices.map((i) => (
                <option key={i.id} value={i.id}>
                  {targetLabel(i)}
                </option>
              ))}
            </Select>
          )}
          <input ref={input} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          <Button variant="primary" loading={busy} onClick={() => input.current?.click()}>
            <Upload className="size-4" strokeWidth={1.5} />
            Загрузить
          </Button>
          <Button onClick={() => setLinkMode((v) => !v)}>
            <Link2 className="size-4" strokeWidth={1.5} />
            Ссылка
          </Button>
        </div>
        {linkMode && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Input placeholder="Название" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} className="min-w-40 flex-1 bg-surface" />
            <Input placeholder="https://disk.yandex.ru/…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} className="min-w-40 flex-1 bg-surface" />
            <Button variant="primary" onClick={addLink}>
              Сохранить
            </Button>
          </div>
        )}
      </div>
      {docs === null ? (
        <Spinner className="mt-4" />
      ) : docs.length === 0 ? (
        <p className="mt-4 text-muted">Документов пока нет. Перетащите сюда договор, чек или скрин статистики</p>
      ) : (
        <ul className="mt-2">
          {docs.map((d) => {
            const i = !integrationId && d.integration_id ? choices?.find((x) => x.id === d.integration_id) : undefined
            return <DocRow key={d.id} d={d} extra={i ? targetLabel(i) : undefined} onChanged={changed} />
          })}
        </ul>
      )}
    </div>
  )
}
