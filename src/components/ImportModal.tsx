import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../lib/data'
import { nickFromUrl, parseNumber, platformFromUrl } from '../lib/format'
import { platformLabel } from '../lib/constants'
import type { Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Modal, cx } from './ui'

type Row = Partial<Blogger> & { nick: string; platform: Blogger['platform'] }
interface SheetResult {
  name: string
  rows: Row[]
  columns: string[]
  include: boolean
}

const FIELDS: { key: keyof Blogger; label: string; test: RegExp; not?: RegExp }[] = [
  { key: 'nick', label: 'Ник', test: /(^|\s)ник/i },
  { key: 'name', label: 'Имя', test: /имя/i },
  { key: 'followers', label: 'Подписчики', test: /подписч|аудитория|followers/i },
  { key: 'avg_reach', label: 'Охват', test: /охват/i, not: /факт|гарант|cpm|спм/i },
  { key: 'price', label: 'Цена', test: /цена|стоимост|прайс|бюдж/i, not: /cpm|cpv|спм/i },
  { key: 'topic', label: 'Тематика', test: /темат/i },
  { key: 'content_type', label: 'Формат контента', test: /тип контента|формат контента/i },
  { key: 'audience', label: 'Аудитория', test: /класс|студент|возраст/i },
  { key: 'contact', label: 'Контакт', test: /связь|контакт|telegram|телеграм/i },
  { key: 'city', label: 'Город', test: /город/i },
]

const SOCIAL = /tiktok\.com|youtube\.com|youtu\.be|t\.me\/|vk\.com|instagram\.com/i

function detect(sheetName: string, data: unknown[][], fileName: string): SheetResult | null {
  // ищем строку-заголовок в первых 15 строках
  let headerIdx = -1
  let map: Partial<Record<keyof Blogger | 'url', number>> = {}
  for (let r = 0; r < Math.min(15, data.length); r++) {
    const row = (data[r] ?? []).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim())
    const m: typeof map = {}
    row.forEach((h, i) => {
      if (!h) return
      if (/ссылк|блогер$|^блогер|соц\.?\s?сеть|link|url/i.test(h) && m.url === undefined && !/рекламу|крео|сценар|чек/i.test(h)) m.url = i
      for (const f of FIELDS) {
        if (m[f.key] === undefined && f.test.test(h) && !(f.not && f.not.test(h))) m[f.key] = i
      }
    })
    if (m.nick !== undefined || m.url !== undefined) {
      headerIdx = r
      map = m
      break
    }
  }
  if (headerIdx < 0) return null

  // уточняем колонку со ссылкой по содержимому
  const sample = data.slice(headerIdx + 1, headerIdx + 30)
  const width = Math.max(...sample.map((r) => r?.length ?? 0), 0)
  for (let i = 0; i < width; i++) {
    const hits = sample.filter((r) => SOCIAL.test(String(r?.[i] ?? ''))).length
    if (hits >= Math.max(1, sample.length * 0.3)) {
      map.url = i
      break
    }
  }
  // «Имя блогера» без ссылок на профиль — это и есть ник
  if (map.nick === undefined && map.url === undefined && map.name !== undefined) map.nick = map.name

  const rows: Row[] = []
  const seen = new Set<string>()
  for (const r of data.slice(headerIdx + 1)) {
    if (!r) continue
    const cell = (k: keyof typeof map) => (map[k] === undefined ? null : r[map[k]!])
    const str = (k: keyof typeof map) => {
      const v = cell(k)
      const s = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim()
      return s || null
    }
    const url = str('url')
    const validUrl = url && SOCIAL.test(url) ? url : null
    // если в листе есть колонка со ссылками — строки без ссылки на профиль это итоги и пометки
    if (map.url !== undefined && !validUrl) continue
    const nick = (nickFromUrl(validUrl) || str('nick') || '').replace(/^@/, '').trim()
    if (!nick || nick.length > 60 || /итого|тотал|total/i.test(nick)) continue
    const platform = validUrl ? platformFromUrl(validUrl) : 'tiktok'
    const key = `${platform}:${nick.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      nick,
      platform,
      url: validUrl,
      name: map.name !== undefined && map.name !== map.nick ? str('name') : null,
      followers: parseNumber(cell('followers')),
      avg_reach: parseNumber(cell('avg_reach')),
      price: parseNumber(cell('price')),
      topic: str('topic'),
      content_type: str('content_type'),
      audience: str('audience'),
      contact: str('contact'),
      city: str('city'),
      source: `${fileName.replace(/\.(xlsx|xls|csv)$/i, '')} / ${sheetName}`,
      status: 'new',
    })
  }
  if (!rows.length) return null
  const columns = [
    map.url !== undefined && 'Ссылка',
    ...FIELDS.filter((f) => map[f.key] !== undefined).map((f) => f.label),
  ].filter(Boolean) as string[]
  return { name: sheetName, rows, columns, include: true }
}

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bloggers, reloadBloggers } = useData()
  const [file, setFile] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)

  const existing = new Set(bloggers.map((b) => `${b.platform}:${b.nick.trim().toLowerCase()}`))

  async function read(f: File) {
    setParsing(true)
    setFile(f.name)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const res = wb.SheetNames.map((n) => detect(n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null }), f.name)).filter(Boolean) as SheetResult[]
      setSheets(res)
    } catch (e) {
      toast(`Не получилось прочитать файл: ${(e as Error).message}`)
      setSheets(null)
    }
    setParsing(false)
  }

  const picked = (sheets ?? []).filter((s) => s.include).flatMap((s) => s.rows)
  const uniq = new Map(picked.map((r) => [`${r.platform}:${r.nick.toLowerCase()}`, r]))
  const fresh = [...uniq.entries()].filter(([k]) => !existing.has(k)).map(([, r]) => r)

  async function run() {
    setBusy(true)
    for (let i = 0; i < fresh.length; i += 500) {
      const { error } = await supabase.from('bloggers').upsert(fresh.slice(i, i + 500), { onConflict: 'platform,nick_key', ignoreDuplicates: true })
      if (error) {
        setBusy(false)
        return toast(`Импорт остановлен: ${error.message}`)
      }
    }
    await reloadBloggers()
    setBusy(false)
    toast(`Добавлено блогеров: ${fresh.length}`)
    close()
  }

  function close() {
    setSheets(null)
    setFile(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Импорт блогеров из Excel"
      footer={
        sheets && (
          <>
            <Button variant="ghost" onClick={() => setSheets(null)}>
              Выбрать другой файл
            </Button>
            {sheets.length > 0 && <Button variant="primary" loading={busy} disabled={!fresh.length} onClick={run}>
              {fresh.length ? `Добавить ${fresh.length} в базу` : 'Все уже в базе'}
            </Button>}
          </>
        )
      }
    >
      {!sheets ? (
        <label
          className={cx('flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-line bg-base/50 px-6 py-10 text-center hover:border-night/40', parsing && 'opacity-60')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) read(f)
          }}
        >
          <FileSpreadsheet className="mb-3 size-8 text-faint" />
          <span className="font-medium">{parsing ? `Читаю ${file}…` : 'Выберите или перетащите таблицу'}</span>
          <span className="mt-1 max-w-md text-sm text-muted">
            .xlsx или .csv. Нужна колонка со ссылкой на профиль или с ником — остальное (подписчики, охват, цена, тематика, контакт) подхватится по названиям колонок.
          </span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </label>
      ) : sheets.length === 0 ? (
        <p className="text-sm text-muted">В «{file}» не нашлось листов с никами или ссылками на профили.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Файл «{file}». Блогеры, которые уже есть в базе, пропускаем — их данные не перезапишутся.
          </p>
          {sheets.map((s, i) => {
            const newCount = s.rows.filter((r) => !existing.has(`${r.platform}:${r.nick.toLowerCase()}`)).length
            return (
              <label key={s.name} className="flex cursor-pointer gap-3 rounded-xl p-3.5 ring-1 ring-line hover:bg-base/50">
                <input type="checkbox" checked={s.include} onChange={(e) => setSheets(sheets.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} className="mt-1 accent-night" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{s.name}</span>
                    <span className="num text-sm text-muted">
                      {s.rows.length} найдено, {newCount} новых
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">Колонки: {s.columns.join(', ')}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.rows.slice(0, 8).map((r) => (
                      <span key={r.nick} className="rounded bg-base px-1.5 py-0.5 text-xs" title={platformLabel(r.platform)}>
                        {r.nick}
                      </span>
                    ))}
                    {s.rows.length > 8 && <span className="px-1 text-xs text-faint">+{s.rows.length - 8}</span>}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
