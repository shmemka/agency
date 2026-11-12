import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { nickFromUrl, parseNumber, platformFromUrl, plural } from '../lib/format'
import type { AgeSplit, Blogger } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Modal, cx } from './ui'
import { findExisting } from './BloggerForm'

type Row = Partial<Blogger> & { nick: string; platform: Blogger['platform'] }
interface Sheet {
  name: string
  rows: Row[]
  columns: string[]
  include: boolean
}

const FIELDS: { key: keyof Blogger; label: string; test: RegExp; not?: RegExp }[] = [
  { key: 'nick', label: 'Ник', test: /(^|\s)ник/i },
  { key: 'name', label: 'Имя', test: /имя/i },
  { key: 'followers', label: 'Подписчики', test: /подписч|followers/i },
  { key: 'avg_reach', label: 'Охват', test: /охват|просмотр/i, not: /факт|гарант|cpm|спм|клип/i },
  { key: 'clip_views', label: 'Просмотры клипа', test: /клип/i },
  { key: 'price', label: 'Цена', test: /цена|стоимост|прайс/i, not: /cpm|cpv|спм/i },
  { key: 'audience_female_pct', label: 'Доля женщин', test: /жен|^пол$|пол аудитории/i },
  { key: 'topic', label: 'Тематика', test: /темат/i },
  { key: 'content_type', label: 'Формат контента', test: /тип контента|формат контента/i },
  { key: 'contact', label: 'Контакт', test: /связь|контакт|telegram|телеграм/i },
  { key: 'city', label: 'Город', test: /город/i },
]
const AGE: { id: keyof AgeSplit; test: RegExp }[] = [
  { id: 'u18', test: /до\s?18|13\s?[-–]\s?17|<\s?18/ },
  { id: 'a18', test: /18\s?[-–]\s?24/ },
  { id: 'a25', test: /25\s?[-–]\s?34/ },
  { id: 'a35', test: /35\s?\+|35 и|старше 35/ },
]
const SOCIAL = /tiktok\.com|youtube\.com|youtu\.be|t\.me\/|vk\.com|vk\.ru|instagram\.com/i
const key = (r: { platform: string; nick: string }) => `${r.platform}:${r.nick.trim().toLowerCase()}`

function detect(sheetName: string, data: unknown[][], fileName: string): Sheet | null {
  let headerIdx = -1
  let map: Partial<Record<string, number>> = {}
  for (let r = 0; r < Math.min(15, data.length); r++) {
    const row = (data[r] ?? []).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim())
    const m: typeof map = {}
    row.forEach((h, i) => {
      if (!h) return
      if (/ссылк|блогер$|^блогер|соц\.?\s?сеть|link|url/i.test(h) && m.url === undefined && !/рекламу|крео|сценар|чек/i.test(h)) m.url = i
      for (const f of FIELDS) if (m[f.key] === undefined && f.test.test(h) && !(f.not && f.not.test(h))) m[f.key] = i
      for (const a of AGE) if (m[a.id] === undefined && a.test.test(h)) m[a.id] = i
    })
    if (m.nick !== undefined || m.url !== undefined) {
      headerIdx = r
      map = m
      break
    }
  }
  if (headerIdx < 0) return null

  const sample = data.slice(headerIdx + 1, headerIdx + 30)
  const width = Math.max(...sample.map((r) => r?.length ?? 0), 0)
  for (let i = 0; i < width; i++) {
    if (sample.filter((r) => SOCIAL.test(String(r?.[i] ?? ''))).length >= Math.max(1, sample.length * 0.3)) {
      map.url = i
      break
    }
  }
  if (map.nick === undefined && map.url === undefined && map.name !== undefined) map.nick = map.name

  const rows: Row[] = []
  const seen = new Set<string>()
  for (const r of data.slice(headerIdx + 1)) {
    if (!r) continue
    const cell = (k: string) => (map[k] === undefined ? null : r[map[k]!])
    const str = (k: string) => String(cell(k) ?? '').replace(/\s+/g, ' ').trim() || null
    const url = str('url')
    const validUrl = url && SOCIAL.test(url) ? url : null
    // в листе со ссылками строки без ссылки на профиль — это итоги и пометки
    if (map.url !== undefined && !validUrl) continue
    const nick = (nickFromUrl(validUrl) || str('nick') || '').replace(/^@/, '').trim()
    if (!nick || nick.length > 60 || /итого|тотал|total/i.test(nick)) continue
    const platform = validUrl ? platformFromUrl(validUrl) : 'tiktok'
    if (seen.has(key({ platform, nick }))) continue
    seen.add(key({ platform, nick }))
    const share = (v: unknown) => {
      const n = parseNumber(typeof v === 'string' ? v.replace('%', '') : v)
      return n === null ? null : n <= 1 ? Math.round(n * 100) : Math.round(n)
    }
    const age: AgeSplit = {}
    for (const a of AGE) {
      const n = share(cell(a.id))
      if (n !== null) age[a.id] = n
    }
    rows.push({
      nick,
      platform,
      url: validUrl,
      name: map.name !== undefined && map.name !== map.nick ? str('name') : null,
      followers: parseNumber(cell('followers')),
      avg_reach: parseNumber(cell('avg_reach')),
      clip_views: parseNumber(cell('clip_views')),
      price: parseNumber(cell('price')),
      audience_female_pct: share(cell('audience_female_pct')),
      audience_age: Object.keys(age).length ? age : null,
      topic: str('topic'),
      content_type: str('content_type'),
      contact: str('contact'),
      city: str('city'),
      source: `${fileName.replace(/\.(xlsx|xls|csv)$/i, '')}, ${sheetName}`,
    })
  }
  if (!rows.length) return null
  const columns = [map.url !== undefined && 'Ссылка', ...FIELDS.filter((f) => map[f.key] !== undefined).map((f) => f.label), AGE.some((a) => map[a.id] !== undefined) && 'Возраст'].filter(Boolean) as string[]
  return { name: sheetName, rows, columns, include: true }
}

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reload } = useData()
  const { profile } = useAuth()
  const [file, setFile] = useState<string | null>(null)
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [taken, setTaken] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)

  async function read(f: File) {
    setParsing(true)
    setFile(f.name)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const res = wb.SheetNames.map((n) => detect(n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null }), f.name)).filter(Boolean) as Sheet[]
      // дубли ищем по всей базе, включая блогеров коллег
      const keys = [...new Set(res.flatMap((s) => s.rows.map(key)))]
      const found = new Map<string, string>()
      for (let i = 0; i < keys.length; i += 400) for (const e of await findExisting(keys.slice(i, i + 400))) found.set(e.key, e.owner_name)
      setTaken(found)
      setSheets(res)
    } catch (e) {
      toast(`Файл не прочитался: ${(e as Error).message}`)
      setSheets(null)
    }
    setParsing(false)
  }

  const uniq = new Map((sheets ?? []).filter((s) => s.include).flatMap((s) => s.rows).map((r) => [key(r), r]))
  const fresh = [...uniq.entries()].filter(([k]) => !taken.has(k)).map(([, r]) => r)
  const owners = [...new Set([...uniq.keys()].filter((k) => taken.has(k)).map((k) => taken.get(k)!))]

  async function run() {
    setBusy(true)
    for (let i = 0; i < fresh.length; i += 300) {
      const { error } = await supabase.from('bloggers').upsert(
        fresh.slice(i, i + 300).map((r) => ({ ...r, owner_id: profile?.id })),
        { onConflict: 'platform,nick_key', ignoreDuplicates: true },
      )
      if (error) {
        setBusy(false)
        return toast(`Импорт остановлен: ${error.message}`)
      }
    }
    await reload('bloggers')
    setBusy(false)
    toast(`Добавлено: ${fresh.length} ${plural(fresh.length, 'блогер', 'блогера', 'блогеров')}`)
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
        sheets &&
        sheets.length > 0 && (
          <>
            <Button variant="ghost" onClick={() => setSheets(null)}>
              Другой файл
            </Button>
            <Button variant="primary" loading={busy} disabled={!fresh.length} onClick={run}>
              {fresh.length ? `Добавить ${fresh.length} в базу` : 'Все уже в базе'}
            </Button>
          </>
        )
      }
    >
      {!sheets ? (
        <label
          className={cx('hatch flex cursor-pointer flex-col items-center rounded-inner px-6 py-12 text-center', parsing && 'opacity-60')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) read(f)
          }}
        >
          <FileSpreadsheet className="mb-3 size-7 text-muted" strokeWidth={1.5} />
          <span className="text-base">{parsing ? `Читаю ${file}` : 'Выберите или перетащите таблицу'}</span>
          <span className="mt-1 max-w-md text-muted">Файл .xlsx или .csv с колонкой ссылок на профили или ников. Подписчики, охват, цену, пол и возраст аудитории найдём по названиям колонок</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </label>
      ) : sheets.length === 0 ? (
        <p className="text-muted">В файле «{file}» не нашлось листов с никами или ссылками на профили</p>
      ) : (
        <div className="space-y-2">
          <p className="text-muted">Вы станете ответственным за новых блогеров. Тех, кто уже есть в базе{owners.length ? ` (ответственные: ${owners.join(', ')})` : ''}, пропускаем</p>
          {sheets.map((s, i) => {
            const n = s.rows.filter((r) => !taken.has(key(r))).length
            return (
              <label key={s.name} className="flex cursor-pointer gap-3 rounded-inner bg-soft p-4">
                <input type="checkbox" checked={s.include} onChange={(e) => setSheets(sheets.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} className="mt-1 size-4 accent-[#15171c]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span>{s.name}</span>
                    <span className="num text-[13px] text-muted">
                      найдено {s.rows.length}, новых {n}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">Колонки: {s.columns.join(', ')}</div>
                  <div className="mt-1 truncate text-xs text-faint">{s.rows.slice(0, 8).map((r) => r.nick).join(', ')}</div>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
