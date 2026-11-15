import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { Loading } from '../FileViewer'

/** Word (.docx): текст, заголовки, списки, таблицы и картинки. Вёрстка упрощённая, как в превью почты */
export default function DocxView({ url, onFail }: { url: string; onFail: () => void }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [res, mammoth] = await Promise.all([fetch(url), import('mammoth')])
        if (!res.ok) throw new Error(String(res.status))
        const out = await mammoth.convertToHtml({ arrayBuffer: await res.arrayBuffer() })
        // файл мог прислать кто угодно: оставляем только безопасную разметку
        if (alive) setHtml(DOMPurify.sanitize(out.value, { FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] }))
      } catch {
        if (alive) onFail()
      }
    })()
    return () => {
      alive = false
    }
  }, [url, onFail])
  if (html === null) return <Loading />
  return (
    <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 text-ink md:p-12">
      {html ? <div className="doc-html" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-muted">Документ пустой</p>}
    </div>
  )
}
