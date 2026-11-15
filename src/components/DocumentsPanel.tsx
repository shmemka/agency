import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { DOC_KINDS, docKindLabel } from '../lib/constants'
import { date, fileSize } from '../lib/format'
import type { Doc, DocKind, Integration } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Input, Select, Spinner, cx, submitOnEnter } from './ui'
import { confirmDialog } from './dialogs'
import { FileMenu, FileThumb, UploadRow, downloadFrom } from './Files'
import { uploadFile, useUploads } from '../lib/upload'
import { openViewer, type ViewItem } from '../lib/viewer'

const BUCKET = 'documents'

function safeName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

/** Документы как вложения для просмотра: ссылки на чужие сайты открываются в новой вкладке, их тут нет */
export const viewItems = (docs: Doc[]): ViewItem[] => docs.filter((d) => d.storage_path).map((d) => ({ name: d.name, mime: d.mime, size: d.size, bucket: BUCKET, path: d.storage_path }))

/** gallery - соседние документы списка: в просмотре между ними можно листать */
export function DocRow({ d, extra, onChanged, gallery }: { d: Doc; extra?: ReactNode; onChanged: () => void; gallery?: Doc[] }) {
  const { isAdmin, personName, profile } = useAuth()
  const canDelete = isAdmin || d.uploaded_by === profile?.id

  function open() {
    if (d.external_url) return void window.open(d.external_url, '_blank', 'noopener')
    if (!d.storage_path) return
    const list = gallery?.some((g) => g.id === d.id) ? gallery.filter((g) => g.storage_path) : [d]
    openViewer(viewItems(list), list.findIndex((g) => g.id === d.id))
  }

  async function remove() {
    if (!(await confirmDialog({ title: 'Удалить документ?', body: `«${d.name}» удалится без возможности восстановить`, ok: 'Удалить', danger: true }))) return
    // сначала запись, потом файл: если запись не удалилась, файл остаётся на месте
    const { error } = await supabase.from('documents').delete().eq('id', d.id)
    if (error) return toast(error.message)
    if (d.storage_path) await supabase.storage.from(BUCKET).remove([d.storage_path])
    toast('Документ удалён')
    onChanged()
  }

  async function toggleClient() {
    const { error } = await supabase.from('documents').update({ hide_from_client: !d.hide_from_client }).eq('id', d.id)
    if (error) toast(`Не сохранилось: ${error.message}`)
    onChanged()
  }

  return (
    <li className="flex min-h-14 items-center gap-3 border-t border-line py-2.5 first:border-0">
      <button onClick={open} aria-label={`Открыть ${d.name}`} className="shrink-0">
        <FileThumb name={d.name} mime={d.mime} bucket={BUCKET} path={d.storage_path} link={!!d.external_url} uploader={d.uploaded_by} />
      </button>
      <div className="min-w-0 flex-1">
        <button className="block max-w-full truncate text-left hover:underline" onClick={open}>
          {d.name}
        </button>
        <div className="truncate text-xs text-muted">
          {docKindLabel(d.kind)}
          {extra ? ', ' : ''}
          {extra}
          {', '}
          {[d.external_url ? 'ссылка' : fileSize(d.size), d.uploaded_by ? personName(d.uploaded_by).split(' ')[0] : '', date(d.created_at)].filter(Boolean).join(', ')}
          {d.kind === 'stats' && d.hide_from_client && <span className="ml-1.5 rounded-full bg-soft px-1.5 py-px text-[11px] text-muted">скрыт от клиента</span>}
        </div>
      </div>
      <FileMenu
        name={d.name}
        actions={[
          d.external_url
            ? { id: 'open', label: 'Открыть ссылку', run: open }
            : {
                id: 'download',
                label: 'Скачать',
                run: async () => {
                  if (d.storage_path && !(await downloadFrom(BUCKET, d.storage_path, d.name))) toast('Файл не скачался, попробуйте ещё раз')
                },
              },
          ...(d.kind === 'stats' ? [{ id: 'client', label: d.hide_from_client ? 'Показать клиенту в отчёте' : 'Скрыть от клиента', run: toggleClient }] : []),
          ...(canDelete ? [{ id: 'delete', label: 'Удалить', danger: true, run: remove }] : []),
        ]}
      />
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
  const uploads = useUploads()
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
    if (input.current) input.current.value = ''
    if (!list.length) return
    // строки с прогрессом появляются сразу, файлы грузятся по очереди
    const ids = uploads.add(list)
    let ok = 0
    for (const [n, f] of list.entries()) {
      const id = ids[n]
      uploads.set(id, 0)
      const path = `${bloggerId ? `bloggers/${bloggerId}` : `campaigns/${campaignId}`}/${safeName(f.name)}`
      // 99%, пока не создана запись: полоска заполняется до конца, когда файл уже в списке документов
      const up = await uploadFile(BUCKET, path, f, (part) => uploads.set(id, Math.min(part, 0.99)))
      if (up.error) {
        toast(`«${f.name}» не загрузился: ${up.error}`)
        uploads.clear([id])
        continue
      }
      const { error } = await supabase.from('documents').insert({ ...base(), name: f.name, storage_path: path, size: f.size, mime: f.type })
      if (error) {
        toast(`«${f.name}»: ${error.message}`)
        uploads.clear([id])
        // запись не создалась — убираем файл, чтобы он не висел в хранилище без документа
        await supabase.storage.from(BUCKET).remove([path])
      } else {
        ok++
        // полоска на миг заполняется зелёным, и строка сменяется готовым документом
        uploads.set(id, 1)
        await load()
        uploads.clear([id])
      }
    }
    if (ok) toast(ok === 1 ? 'Файл загружен' : `Загружено файлов: ${ok}`)
    await load()
    reload('documents')
    uploads.clear(ids)
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
        className={cx('dropzone rounded-inner p-3', hover && 'is-over')}
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
          <Button variant="primary" onClick={() => input.current?.click()}>
            <Upload className="size-4" strokeWidth={1.5} />
            Загрузить
          </Button>
          <Button onClick={() => setLinkMode((v) => !v)}>
            <Link2 className="size-4" strokeWidth={1.5} />
            Ссылка
          </Button>
        </div>
        {linkMode && (
          <div className="mt-2 flex flex-wrap gap-2" onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
            <Input placeholder="Название" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} className="min-w-40 flex-1 bg-surface" />
            <Input placeholder="https://disk.yandex.ru/…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} className="min-w-40 flex-1 bg-surface" />
            <Button variant="primary" data-save onClick={addLink}>
              Сохранить
            </Button>
          </div>
        )}
      </div>
      {docs === null ? (
        <Spinner className="mt-4" />
      ) : docs.length === 0 && uploads.items.length === 0 ? (
        <p className="mt-4 text-muted">Документов пока нет. Перетащите сюда договор, чек или скрин статистики</p>
      ) : (
        <ul className="mt-2">
          {uploads.items.map((u) => (
            <UploadRow key={u.id} item={u} className="border-t border-line py-2.5 first:border-0" />
          ))}
          {docs.map((d) => {
            const i = !integrationId && d.integration_id ? choices?.find((x) => x.id === d.integration_id) : undefined
            return <DocRow key={d.id} d={d} extra={i ? targetLabel(i) : undefined} onChanged={changed} gallery={docs} />
          })}
        </ul>
      )}
    </div>
  )
}
