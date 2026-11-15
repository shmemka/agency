import { supabase } from './supabase'

/*
 * Оформление кабинета: логотип в меню и брендовый цвет вместо зелёного.
 * Цвет меняет переменную --color-lime, на ней держатся все акценты сайта
 */

export const LOGO_BUCKET = 'logos'
export const DEFAULT_BRAND = '#c5e84e'

/** Готовые цвета. Первый - зелёный «Сверки», он же «без своего цвета» */
export const BRAND_PRESETS = [
  { hex: DEFAULT_BRAND, label: 'Зелёный «Сверки»' },
  { hex: '#ffd84d', label: 'Жёлтый' },
  { hex: '#ffab70', label: 'Оранжевый' },
  { hex: '#ff8fab', label: 'Розовый' },
  { hex: '#b8a4ff', label: 'Сиреневый' },
  { hex: '#7cc4ff', label: 'Голубой' },
  { hex: '#5edcb4', label: 'Мятный' },
  { hex: '#3358ff', label: 'Синий' },
]

export const isHex = (s: string) => /^#[0-9a-f]{6}$/.test(s)

/** «c5e84e», «#C5E84E», «#abc» → «#c5e84e»; неверное - null */
export function normalizeHex(s: string): string | null {
  let v = s.trim().toLowerCase().replace(/^#?/, '#')
  if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  return isHex(v) ? v : null
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Тёмный текст на светлом цвете, белый - на тёмном: чтобы надпись на кнопке читалась */
export const onBrand = (hex: string) => ((luminance(hex) + 0.05) / (luminance('#15171c') + 0.05) >= 4.5 ? 'var(--color-ink)' : '#ffffff')

/** Красит сайт в цвет кабинета; null - вернуть зелёный */
export function applyBrand(hex: string | null | undefined) {
  const s = document.documentElement.style
  if (!hex || !isHex(hex) || hex === DEFAULT_BRAND) {
    for (const v of ['--color-lime', '--color-lime-ink', '--color-lime-end']) s.removeProperty(v)
    return
  }
  s.setProperty('--color-lime', hex)
  s.setProperty('--color-lime-ink', onBrand(hex))
  // полосы прогресса - переход в чуть более густой оттенок того же цвета, а не в зелёный
  s.setProperty('--color-lime-end', `color-mix(in oklab, ${hex} 78%, #15171c)`)
}

/** Путь файла внутри бакета из публичной ссылки */
export function logoPath(url: string | null | undefined) {
  const i = url?.indexOf(`/${LOGO_BUCKET}/`) ?? -1
  return url && i >= 0 ? decodeURIComponent(url.slice(i + LOGO_BUCKET.length + 2).split('?')[0]) : null
}

/** Из SVG убираем скрипты и обработчики событий: файл открывается по прямой ссылке */
async function cleanSvg(file: File): Promise<Blob> {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Не получилось прочитать SVG')
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const href = /href$/i.test(a.name) && /^\s*javascript:/i.test(a.value)
      if (/^on/i.test(a.name) || href) el.removeAttribute(a.name)
    }
  })
  return new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' })
}

const TYPES: Record<string, string> = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }

/** Загружает логотип в папку кабинета и возвращает публичную ссылку. Ошибки - понятным текстом */
export async function uploadLogo(workspaceId: string, file: File): Promise<string> {
  const type = file.type || (/\.svg$/i.test(file.name) ? 'image/svg+xml' : '')
  const ext = TYPES[type]
  if (!ext) throw new Error('Нужен файл SVG или PNG')
  if (file.size > 1024 * 1024) throw new Error('Логотип больше 1 МБ: сожмите его или сохраните в SVG')
  const body = ext === 'svg' ? await cleanSvg(file) : file
  const path = `${workspaceId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000' })
  if (error) {
    if (/bucket not found|row-level security|unauthorized|403/i.test(error.message)) throw new Error('Логотип не сохранился: нужно запустить миграцию 019_workspace_brand.sql')
    throw error
  }
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function removeLogo(url: string | null | undefined) {
  const path = logoPath(url)
  if (path) await supabase.storage.from(LOGO_BUCKET).remove([path])
}
