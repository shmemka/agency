import { useEffect, useState } from 'react'
import { Loading } from '../FileViewer'
import { cx } from '../ui'

const MAX_ROWS = 1000
const MAX_COLS = 60

type Sheet = { name: string; rows: string[][]; total: number }

/** Таблица Excel или CSV: листы вкладками, первые 1000 строк */
export default function SheetView({ url, name, onFail }: { url: string; name: string; onFail: () => void }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [res, XLSX] = await Promise.all([fetch(url), import('xlsx')])
        if (!res.ok) throw new Error(String(res.status))
        const buf = await res.arrayBuffer()
        // CSV часто сохраняют из Excel в кодировке Windows: если UTF-8 не читается, пробуем её
        let wb
        if (/\.csv$/i.test(name)) {
          let text = new TextDecoder('utf-8').decode(buf)
          if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf)
          wb = XLSX.read(text, { type: 'string' })
        } else wb = XLSX.read(buf, { type: 'array' })
        const out = wb.SheetNames.map((n) => {
          const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false })
          return { name: n, total: all.length, rows: all.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => String(c ?? ''))) }
        })
        if (alive) setSheets(out)
      } catch {
        if (alive) onFail()
      }
    })()
    return () => {
      alive = false
    }
  }, [url, name, onFail])

  if (!sheets) return <Loading />
  const s = sheets[active]
  const cols = Math.max(1, ...s.rows.map((r) => r.length))

  return (
    <div className="mx-auto max-w-5xl">
      {sheets.length > 1 && (
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {sheets.map((sh, i) => (
            <button
              key={sh.name}
              onClick={() => setActive(i)}
              className={cx('h-8 shrink-0 rounded-full px-3.5 text-[13px] transition-colors duration-200', i === active ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20')}
            >
              {sh.name}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-auto rounded-xl bg-white text-ink">
        {s.rows.length === 0 ? (
          <p className="p-6 text-muted">Лист пустой</p>
        ) : (
          <table className="num w-max min-w-full border-collapse text-[13px]">
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i} className={cx(i === 0 && 'bg-soft font-medium')}>
                  <td className="sticky left-0 border-r border-b border-line bg-soft px-2 py-1.5 text-right text-[11px] text-faint">{i + 1}</td>
                  {Array.from({ length: cols }, (_, j) => (
                    <td key={j} className="max-w-80 border-r border-b border-line px-3 py-1.5 align-top break-words whitespace-pre-wrap">
                      {r[j] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {s.total > MAX_ROWS && <p className="py-3 text-center text-sm text-white/55">Показаны первые {MAX_ROWS} строк из {s.total}. Всю таблицу - по кнопке «Скачать»</p>}
    </div>
  )
}
