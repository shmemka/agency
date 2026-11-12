const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export function money(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${rub.format(v)} ₽`
}

export function count(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`
  if (v >= 10_000) return `${Math.round(v / 1000).toLocaleString('ru-RU')} тыс.`
  return rub.format(v)
}

export function cpm(price: number | null, reach: number | null) {
  if (!price || !reach) return null
  return (price / reach) * 1000
}

export function date(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function dateTime(v: string) {
  return new Date(v).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fileSize(v: number | null) {
  if (!v) return ''
  if (v > 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} МБ`
  return `${Math.max(1, Math.round(v / 1024))} КБ`
}

/** Достаёт ник из ссылки вида tiktok.com/@nick или youtube.com/@nick */
export function nickFromUrl(url: string | null | undefined) {
  if (!url) return null
  const m = url.match(/@([A-Za-z0-9_.-]+)/)
  if (m) return m[1].replace(/\.$/, '')
  const t = url.match(/(?:t\.me|vk\.com|vk\.ru)\/([A-Za-z0-9_.]+)/)
  if (t) return t[1]
  return null
}

export function platformFromUrl(url: string | null | undefined) {
  const u = (url || '').toLowerCase()
  if (u.includes('tiktok')) return 'tiktok' as const
  if (u.includes('youtu')) return 'youtube' as const
  if (u.includes('t.me')) return 'telegram' as const
  if (u.includes('vk.com') || u.includes('vk.ru')) return 'vk' as const
  if (u.includes('instagram')) return 'instagram' as const
  return 'other' as const
}

/** «13.2k», «5к», «1 300 000», «р.55.000,00» → число */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).toLowerCase().replace(/р\.|₽|руб|\s| /g, '')
  let mult = 1
  if (/[kк]$/.test(s)) {
    mult = 1000
    s = s.slice(0, -1)
  } else if (/(m|м|млн)$/.test(s)) {
    mult = 1_000_000
    s = s.replace(/(m|м|млн)$/, '')
  }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  s = s.replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n * mult : null
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b.slice(0, 10)}T12:00:00`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000)
}

export function pct(v: number | null | undefined) {
  return v === null || v === undefined ? '—' : `${Math.round(v)}%`
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export async function downloadXlsx(name: string, rows: Record<string, unknown>[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Лист1')
  XLSX.writeFile(wb, `${name}.xlsx`)
}
