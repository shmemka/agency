import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { onViewer, type ViewItem } from '../lib/viewer'
import { fileSize } from '../lib/format'
import { toast } from '../lib/toast'
import { LOOK, downloadFrom, fileKind, thumbUrl } from './Files'
import { cx, usePresence, useScrollLock } from './ui'

/*
 * Просмотр вложений поверх страницы: фото, PDF, Word (.docx), таблицы, видео, аудио и текст.
 * Тяжёлое (PDF, Word, Excel) подгружается, только когда такой файл открыли.
 * Между файлами - стрелки, клавиши ← → и свайп на телефоне. Esc закрывает
 */

const PdfView = lazy(() => import('./viewers/PdfView'))
const SheetView = lazy(() => import('./viewers/SheetView'))
const DocxView = lazy(() => import('./viewers/DocxView'))

type Mode = 'image' | 'pdf' | 'docx' | 'sheet' | 'video' | 'audio' | 'text' | 'none'

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

function modeOf(it: ViewItem): Mode {
  const e = ext(it.name)
  const kind = fileKind(it.name, it.mime)
  if (kind === 'image') return 'image'
  if (kind === 'pdf') return 'pdf'
  if (e === 'docx') return 'docx'
  if (['xlsx', 'xls', 'csv', 'ods'].includes(e)) return 'sheet'
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  if (['txt', 'md', 'json', 'log', 'xml'].includes(e) || it.mime?.startsWith('text/')) return 'text'
  return 'none'
}

/** Документы листаются вертикально: свайп вбок там мешал бы прокрутке таблиц */
const paper = (m: Mode) => m === 'pdf' || m === 'docx' || m === 'sheet' || m === 'text'

async function urlOf(it: ViewItem) {
  if (it.url) return it.url
  if (it.bucket && it.path) return thumbUrl(it.bucket, it.path)
  return null
}

async function download(it: ViewItem) {
  if (it.bucket && it.path) {
    if (!(await downloadFrom(it.bucket, it.path, it.name))) toast('Файл не скачался, попробуйте ещё раз')
    return
  }
  if (!it.url) return
  // подписанные ссылки хранилища отдают файл на скачивание с параметром download
  const a = document.createElement('a')
  a.href = `${it.url}${it.url.includes('?') ? '&' : '?'}download=${encodeURIComponent(it.name)}`
  a.download = it.name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function FileViewerHost() {
  const [state, setState] = useState<{ items: ViewItem[]; index: number } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(
    () =>
      onViewer((v) => {
        setState(v)
        setOpen(true)
      }),
    [],
  )
  const { mounted, leaving } = usePresence(open, 220)
  useScrollLock(open)
  if (!mounted || !state) return null
  return createPortal(<Viewer items={state.items} start={state.index} leaving={leaving} onClose={() => setOpen(false)} />, document.body)
}

function Viewer({ items, start, leaving, onClose }: { items: ViewItem[]; start: number; leaving: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const it = items[index]
  const mode = modeOf(it)
  const many = items.length > 1
  const go = useCallback((d: number) => setIndex((i) => (i + d + items.length) % items.length), [items.length])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (many && e.key === 'ArrowLeft') go(-1)
      else if (many && e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go, many, onClose])

  // соседние фото готовим заранее: листается без пустого экрана
  useEffect(() => {
    if (!many) return
    for (const d of [-1, 1]) {
      const n = items[(index + d + items.length) % items.length]
      if (modeOf(n) === 'image') urlOf(n).then((u) => u && (new Image().src = u))
    }
  }, [index, items, many])

  // свайп вбок на телефоне - соседний файл
  const touch = useRef<{ x: number; y: number } | null>(null)
  const swipe = many && !paper(mode)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={it.name}
      className={cx('fade fixed inset-0 z-[90] flex flex-col bg-[#0e0f12]/95 text-white backdrop-blur-sm', leaving && 'leaving pointer-events-none')}
      onTouchStart={swipe ? (e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }) : undefined}
      onTouchEnd={
        swipe
          ? (e) => {
              const t = touch.current
              touch.current = null
              if (!t) return
              const dx = e.changedTouches[0].clientX - t.x
              const dy = e.changedTouches[0].clientY - t.y
              if (Math.abs(dx) > 60 && Math.abs(dy) < 60) go(dx < 0 ? 1 : -1)
            }
          : undefined
      }
    >
      {/* шапка: название, номер, скачать, закрыть */}
      <div className="safe-top flex shrink-0 items-center gap-2 pr-2 pb-2 pl-5 md:pr-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">{it.name}</div>
          <div className="num text-xs text-white/55">{[many ? `${index + 1} из ${items.length}` : '', fileSize(it.size ?? null)].filter(Boolean).join(' · ')}</div>
        </div>
        <DarkButton label="Скачать" onClick={() => download(it)}>
          <Download className="size-[18px]" strokeWidth={1.5} />
        </DarkButton>
        <DarkButton label="Закрыть" onClick={onClose}>
          <X className="size-[18px]" strokeWidth={1.5} />
        </DarkButton>
      </div>

      <div className="relative min-h-0 flex-1">
        <Body key={`${index}`} it={it} mode={mode} onClose={onClose} />
        {many && (
          <>
            <DarkButton label="Предыдущий" onClick={() => go(-1)} className="absolute top-1/2 left-4 -translate-y-1/2 max-md:hidden">
              <ChevronLeft className="size-5" strokeWidth={1.5} />
            </DarkButton>
            <DarkButton label="Следующий" onClick={() => go(1)} className="absolute top-1/2 right-4 -translate-y-1/2 max-md:hidden">
              <ChevronRight className="size-5" strokeWidth={1.5} />
            </DarkButton>
          </>
        )}
      </div>

      {/* на телефоне стрелок нет - внизу точки, сколько файлов и какой открыт */}
      {many && items.length <= 12 && (
        <div className="flex shrink-0 justify-center gap-1.5 pt-3 md:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          {items.map((_, i) => (
            <span key={i} className={cx('size-1.5 rounded-full transition-colors duration-200', i === index ? 'bg-white' : 'bg-white/25')} />
          ))}
        </div>
      )}
    </div>
  )
}

function DarkButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-[background-color,transform] duration-200 hover:bg-white/20 active:scale-[0.92]', className)}
    >
      {children}
    </button>
  )
}

function Body({ it, mode, onClose }: { it: ViewItem; mode: Mode; onClose: () => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])
  useEffect(() => {
    let alive = true
    if (mode === 'none') return
    urlOf(it).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [it, mode])

  if (mode === 'none' || failed || url === null) return <NoPreview it={it} failed={failed || url === null} />
  if (url === undefined) return <Loading />

  if (mode === 'image') return <ImageView url={url} name={it.name} onFail={fail} onClose={onClose} />
  if (mode === 'video')
    return (
      <div className="flex h-full items-center justify-center p-4 md:px-20" onClick={onClose}>
        <video src={url} controls playsInline autoPlay className="max-h-full max-w-full rounded-2xl bg-black" onClick={(e) => e.stopPropagation()} onError={fail} />
      </div>
    )
  if (mode === 'audio')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6" onClick={onClose}>
        <Icon it={it} />
        <audio src={url} controls autoPlay className="w-full max-w-md" onClick={(e) => e.stopPropagation()} onError={fail} />
      </div>
    )

  // документы: белые страницы на тёмном фоне, листаются вниз
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 pb-6 md:px-20">
      <Suspense fallback={<Loading />}>
        {mode === 'pdf' && <PdfView url={url} onFail={fail} />}
        {mode === 'docx' && <DocxView url={url} onFail={fail} />}
        {mode === 'sheet' && <SheetView url={url} name={it.name} onFail={fail} />}
        {mode === 'text' && <TextView url={url} onFail={fail} />}
      </Suspense>
    </div>
  )
}

/** Фото целиком на экране; по нажатию - в натуральную величину, чтобы разглядеть цифры на скрине */
function ImageView({ url, name, onFail, onClose }: { url: string; name: string; onFail: () => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(false)
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={cx('h-full', zoom ? 'overflow-auto' : 'flex items-center justify-center p-4 md:px-20')} onClick={zoom ? undefined : onClose}>
      {!loaded && <Loading />}
      <img
        src={url}
        alt={name}
        onLoad={() => setLoaded(true)}
        onError={onFail}
        onClick={(e) => {
          e.stopPropagation()
          setZoom((z) => !z)
        }}
        className={cx(
          'select-none transition-opacity duration-300',
          loaded ? 'opacity-100' : 'absolute opacity-0',
          zoom ? 'mx-auto max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in rounded-2xl object-contain',
        )}
      />
    </div>
  )
}

function TextView({ url, onFail }: { url: string; onFail: () => void }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => alive && setText(t.length > 200_000 ? `${t.slice(0, 200_000)}\n\n…` : t))
      .catch(() => alive && onFail())
    return () => {
      alive = false
    }
  }, [url, onFail])
  if (text === null) return <Loading />
  return <pre className="mx-auto max-w-3xl rounded-xl bg-white p-5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink md:p-8">{text}</pre>
}

function Icon({ it }: { it: ViewItem }) {
  const look = LOOK[fileKind(it.name, it.mime)]
  const I = look.icon
  return (
    <span className={cx('flex size-20 items-center justify-center rounded-[24px]', look.cls)}>
      <I className="size-9" strokeWidth={1.25} />
    </span>
  )
}

function NoPreview({ it, failed }: { it: ViewItem; failed: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Icon it={it} />
      <div className="mt-5 max-w-sm text-lg break-words">{it.name}</div>
      <p className="mt-1.5 max-w-sm text-sm text-white/55">{failed ? 'Файл не открылся. Скачайте его и откройте на устройстве' : 'Такие файлы на сайте не открываются. Скачайте и откройте на устройстве'}</p>
      <button
        type="button"
        onClick={() => download(it)}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-ink transition-[background-color,transform] duration-200 hover:bg-white/85 active:scale-[0.98]"
      >
        <Download className="size-4" strokeWidth={1.5} />
        Скачать
      </button>
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  )
}
