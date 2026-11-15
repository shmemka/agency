import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { Loading } from '../FileViewer'

// сборка legacy: открывается и на старых iPhone
pdfjs.GlobalWorkerOptions.workerSrc = worker

const MAX_PAGES = 300

/** PDF страницами-картинками. Рисуем только те страницы, до которых долистали */
export default function PdfView({ url, onFail }: { url: string; onFail: () => void }) {
  const [doc, setDoc] = useState<{ pdf: PDFDocumentProxy; ratios: number[] } | null>(null)

  useEffect(() => {
    let alive = true
    let task: PDFDocumentLoadingTask | null = null
    ;(async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        task = pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) })
        const pdf = await task.promise
        const ratios: number[] = []
        for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
          const v = (await pdf.getPage(n)).getViewport({ scale: 1 })
          ratios.push(v.width / v.height)
        }
        if (alive) setDoc({ pdf, ratios })
      } catch {
        if (alive) onFail()
      }
    })()
    return () => {
      alive = false
      // закрыли окно: останавливаем разбор файла и освобождаем память
      task?.destroy()
    }
  }, [url, onFail])

  if (!doc) return <Loading />
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {doc.ratios.map((r, i) => (
        <Page key={i} pdf={doc.pdf} n={i + 1} ratio={r} />
      ))}
      {doc.pdf.numPages > MAX_PAGES && <p className="py-2 text-center text-sm text-white/55">Показаны первые {MAX_PAGES} страниц. Весь файл - по кнопке «Скачать»</p>}
    </div>
  )
}

function Page({ pdf, n, ratio }: { pdf: PDFDocumentProxy; n: number; ratio: number }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    let cancel = () => {}
    const io = new IntersectionObserver(
      async (es) => {
        if (!es.some((e) => e.isIntersecting) || !canvas.current) return
        io.disconnect()
        try {
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: (el.clientWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2) })
          canvas.current.width = vp.width
          canvas.current.height = vp.height
          const task = page.render({ canvas: canvas.current, viewport: vp })
          cancel = () => task.cancel()
          await task.promise
          setDone(true)
        } catch {
          /* документ закрыли, пока страница рисовалась */
        }
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancel()
    }
  }, [pdf, n])

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl bg-white" style={{ aspectRatio: ratio }}>
      <canvas ref={canvas} className={`size-full transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  )
}
