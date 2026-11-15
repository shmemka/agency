import { useEffect, useRef, useState } from 'react'
import { File, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo, Image as ImageIcon, Link2, MoreHorizontal, Presentation } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Avatar, Menu, cx } from './ui'

/*
 * Превью файла в списках: картинка — сама картинка в квадрате, остальное — цветная иконка по типу.
 * В правом нижнем углу — маленькая аватарка того, кто загрузил.
 */

export type Kind = 'image' | 'pdf' | 'word' | 'excel' | 'slides' | 'archive' | 'video' | 'audio' | 'link' | 'other'

export function fileKind(name: string, mime?: string | null, link?: boolean): Kind {
  if (link) return 'link'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const m = mime ?? ''
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'avif'].includes(ext)) return 'image'
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (/word|opendocument\.text|rtf/.test(m) || ['doc', 'docx', 'odt', 'rtf', 'pages'].includes(ext)) return 'word'
  if (/sheet|excel|csv/.test(m) || ['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return 'excel'
  if (/presentation|powerpoint/.test(m) || ['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'slides'
  if (/zip|rar|7z|tar|gzip/.test(m) || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (m.startsWith('video/') || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video'
  if (m.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio'
  return 'other'
}

// цвет иконки подсказывает тип ещё до того, как прочитали название: pdf — красный, Word — синий, Excel — зелёный
export const LOOK: Record<Kind, { icon: typeof File; cls: string }> = {
  image: { icon: ImageIcon, cls: 'bg-soft text-muted' },
  pdf: { icon: FileText, cls: 'bg-red-50 text-red-600' },
  word: { icon: FileText, cls: 'bg-blue-50 text-blue-600' },
  excel: { icon: FileSpreadsheet, cls: 'bg-emerald-50 text-emerald-600' },
  slides: { icon: Presentation, cls: 'bg-orange-50 text-orange-600' },
  archive: { icon: FileArchive, cls: 'bg-amber-50 text-amber-700' },
  video: { icon: FileVideo, cls: 'bg-violet-50 text-violet-600' },
  audio: { icon: FileAudio, cls: 'bg-pink-50 text-pink-600' },
  link: { icon: Link2, cls: 'bg-soft text-muted' },
  other: { icon: File, cls: 'bg-soft text-muted' },
}

/*
 * Ссылки на картинки из закрытых хранилищ. Просим их пачкой (одним запросом на хранилище),
 * только для превью, которые видно на экране, и помним час, пока ссылка действует.
 */
const cache = new Map<string, { url: string; until: number }>()
const queue = new Map<string, Map<string, ((u: string | null) => void)[]>>()
let timer: number | undefined

export function thumbUrl(bucket: string, path: string) {
  const key = `${bucket}/${path}`
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
  return new Promise<string | null>((done) => {
    const b = queue.get(bucket) ?? new Map()
    queue.set(bucket, b)
    b.set(path, [...(b.get(path) ?? []), done])
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, 40)
  })
}

async function flush() {
  const jobs = [...queue.entries()]
  queue.clear()
  for (const [bucket, paths] of jobs) {
    const list = [...paths.keys()]
    const { data } = await supabase.storage.from(bucket).createSignedUrls(list, 3600)
    for (const p of list) {
      const url = data?.find((d) => d.path === p)?.signedUrl ?? null
      if (url) cache.set(`${bucket}/${p}`, { url, until: Date.now() + 55 * 60_000 })
      paths.get(p)!.forEach((done) => done(url))
    }
  }
}

export function FileThumb({ name, mime, bucket, path, link, uploader, className }: { name: string; mime?: string | null; bucket: string; path?: string | null; link?: boolean; uploader?: string | null; className?: string }) {
  const { team, personName } = useAuth()
  const kind = fileKind(name, mime, link)
  const look = LOOK[kind]
  const I = look.icon
  const box = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // картинку подгружаем, когда превью показалось на экране: в длинном списке документов — не все сразу
  useEffect(() => {
    if (kind !== 'image' || !path || !box.current) return
    let alive = true
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return
        io.disconnect()
        thumbUrl(bucket, path).then((u) => alive && setUrl(u))
      },
      { rootMargin: '200px' },
    )
    io.observe(box.current)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [kind, bucket, path])

  const who = uploader ? team.find((t) => t.id === uploader) : null
  const whoName = uploader ? personName(uploader) : ''

  return (
    <span ref={box} className={cx('relative inline-flex size-12 shrink-0', className)}>
      <span className={cx('flex size-full items-center justify-center overflow-hidden rounded-2xl', look.cls)}>
        {url ? (
          <img src={url} alt="" loading="lazy" onLoad={() => setLoaded(true)} onError={() => setUrl(null)} className={cx('size-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')} />
        ) : (
          <I className="size-5" strokeWidth={1.5} />
        )}
      </span>
      {uploader && whoName && (
        <span className="absolute -right-1.5 -bottom-1.5 rounded-full ring-2 ring-surface" title={`Загрузил(а): ${whoName}`}>
          <Avatar name={whoName} src={who?.avatar_url} className="size-5! text-[8px]! leading-none" />
        </span>
      )}
    </span>
  )
}

/** Три точки у файла: «Скачать», «Удалить» и, если нужно, ещё действия */
export function FileMenu({ name, actions }: { name: string; actions: { id: string; label: string; danger?: boolean; run: () => void }[] }) {
  if (!actions.length) return null
  return (
    <Menu
      value=""
      chevron={false}
      title={name}
      options={actions.map((a) => ({ id: a.id, label: a.label, danger: a.danger }))}
      onChange={(id) => actions.find((a) => a.id === id)?.run()}
      trigger={
        <span className="flex size-9 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-ink/5 hover:text-ink">
          <MoreHorizontal className="size-[18px]" strokeWidth={1.5} />
        </span>
      }
    />
  )
}

/** Скачать по подписанной ссылке: браузер сохраняет файл, а не открывает его */
export async function downloadFrom(bucket: string, path: string, name: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600, { download: name })
  if (error || !data) return false
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  return true
}
