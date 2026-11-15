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

// яркость канала 0-255 в линейном виде - заранее для всех значений: картинку проверяем попиксельно
const LIN = Array.from({ length: 256 }, (_, v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
const lum = (r: number, g: number, b: number) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b]
const luminance = (hex: string) => lum(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]))

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
  // полосы прогресса - ровным цветом бренда: переход в зелёный подходит только зелёному
  s.setProperty('--color-lime-end', hex)
}

/** Путь файла внутри бакета из публичной ссылки */
export function logoPath(url: string | null | undefined) {
  const i = url?.indexOf(`/${LOGO_BUCKET}/`) ?? -1
  return url && i >= 0 ? decodeURIComponent(url.slice(i + LOGO_BUCKET.length + 2).split('?')[0]) : null
}

/** Место логотипа в меню, px (рядом с колокольчиком): квадратный встаёт по высоте, длинный - по ширине */
export const LOGO_BOX = { w: 144, h: 32 }

/** Логотип, подготовленный к загрузке: поля обрезаны, размер подогнан, есть замечания */
export interface PreparedLogo {
  blob: Blob
  type: string
  ext: string
  /** ссылка на файл в браузере - для предпросмотра до сохранения */
  url: string
  /** размер после обрезки полей, px */
  w: number
  h: number
  trimmed: boolean
  warnings: string[]
}

const TYPES: Record<string, string> = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }

/** Из SVG убираем скрипты и обработчики событий: файл открывается по прямой ссылке */
function cleanSvg(text: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement as unknown as SVGSVGElement
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Не получилось прочитать SVG')
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const href = /href$/i.test(a.name) && /^\s*javascript:/i.test(a.value)
      if (/^on/i.test(a.name) || href) el.removeAttribute(a.name)
    }
  })
  return svg
}

/** У SVG пустые поля по краям обрезаем, подгоняя viewBox под сам рисунок */
function trimSvg(svg: SVGSVGElement): { w: number; h: number; trimmed: boolean } {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;visibility:hidden'
  const live = document.importNode(svg, true) as SVGSVGElement
  host.append(live)
  document.body.append(host)
  try {
    const box = live.getBBox()
    const vb = live.viewBox.baseVal
    if (!box.width || !box.height) throw new Error('empty')
    // обводка выходит за рамку getBBox на полтолщины - оставляем запас
    const pad = Math.max(box.width, box.height) * 0.015
    const v = { x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 }
    const before = vb && vb.width ? vb.width * vb.height : Number(live.getAttribute('width')) * Number(live.getAttribute('height')) || 0
    svg.setAttribute('viewBox', `${+v.x.toFixed(2)} ${+v.y.toFixed(2)} ${+v.w.toFixed(2)} ${+v.h.toFixed(2)}`)
    svg.setAttribute('width', String(+v.w.toFixed(2)))
    svg.setAttribute('height', String(+v.h.toFixed(2)))
    return { w: v.w, h: v.h, trimmed: !before || v.w * v.h < before * 0.9 }
  } catch {
    const vb = svg.viewBox?.baseVal
    return { w: vb?.width || Number(svg.getAttribute('width')) || 160, h: vb?.height || Number(svg.getAttribute('height')) || 32, trimmed: false }
  } finally {
    host.remove()
  }
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не получилось открыть картинку'))
    img.src = url
  })

/** Пиксели картинки, вписанной в side×side: по ним ищем поля и проверяем, не слишком ли светлый логотип */
function pixels(src: CanvasImageSource, w: number, h: number, side: number) {
  const k = Math.min(1, side / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, k }
}

/** Насколько светлый рисунок (0-1) и есть ли у него сплошной фон */
function looks(p: { data: Uint8ClampedArray; w: number; h: number }) {
  const { data, w, h } = p
  const at = (x: number, y: number) => (y * w + x) * 4
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)]
  const solid = corners.every((i) => data[i + 3] > 245 && Math.abs(data[i] - data[corners[0]]) + Math.abs(data[i + 1] - data[corners[0] + 1]) + Math.abs(data[i + 2] - data[corners[0] + 2]) < 24)
  let sum = 0
  let weight = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    if (a < 0.1) continue
    sum += a * lum(data[i], data[i + 1], data[i + 2])
    weight += a
  }
  return { light: weight ? sum / weight : 0, solid }
}

/**
 * Готовит логотип: обрезает пустые поля, чтобы он не терялся в меню, уменьшает большую картинку
 * и собирает замечания - мелкая, слишком светлая, на сплошном фоне, вертикальная
 */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  const type = file.type || (/\.svg$/i.test(file.name) ? 'image/svg+xml' : '')
  const ext = TYPES[type]
  if (!ext) throw new Error('Нужен файл SVG или PNG')
  const warnings: string[] = []

  if (ext === 'svg') {
    if (file.size > 1024 * 1024) throw new Error('SVG больше 1 МБ: упростите его или сохраните в PNG')
    const svg = cleanSvg(await file.text())
    const { w, h, trimmed } = trimSvg(svg)
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type })
    const url = URL.createObjectURL(blob)
    try {
      const img = await loadImage(url)
      const look = looks(pixels(img, w, h, 200))
      if (look.solid) warnings.push('У логотипа сплошной фон - в меню будет видна плашка')
      else if (look.light > 0.8) warnings.push('Логотип очень светлый - на сером фоне меню его почти не видно')
    } catch {
      /* картинку не удалось проверить - загрузим как есть */
    }
    if (h > w * 1.4) warnings.push('Вертикальный логотип в меню будет мелким - лучше горизонтальный')
    return { blob, type, ext, url, w, h, trimmed, warnings }
  }

  if (file.size > 8 * 1024 * 1024) throw new Error('Картинка больше 8 МБ')
  const bmp = await createImageBitmap(file)
  // ищем рамку рисунка: прозрачные поля, а у картинки со сплошным фоном - поля цвета фона
  const p = pixels(bmp, bmp.width, bmp.height, 1200)
  const look = looks(p)
  const bg = [p.data[0], p.data[1], p.data[2]]
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4
      const ink = look.solid ? Math.abs(p.data[i] - bg[0]) + Math.abs(p.data[i + 1] - bg[1]) + Math.abs(p.data[i + 2] - bg[2]) > 36 : p.data[i + 3] > 12
      if (!ink) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  if (x1 < 0) throw new Error('Картинка пустая')
  const pad = 2
  const crop = {
    x: Math.max(0, (x0 - pad) / p.k),
    y: Math.max(0, (y0 - pad) / p.k),
    w: Math.min(bmp.width, (x1 + 1 + pad) / p.k) - Math.max(0, (x0 - pad) / p.k),
    h: Math.min(bmp.height, (y1 + 1 + pad) / p.k) - Math.max(0, (y0 - pad) / p.k),
  }
  const trimmed = crop.w * crop.h < bmp.width * bmp.height * 0.9
  // в меню логотип не выше 32 px - хватит запаса в 4 раза для чётких экранов
  const k = Math.min(1, (LOGO_BOX.h * 4) / crop.h, (LOGO_BOX.w * 4) / crop.w)
  const c = document.createElement('canvas')
  c.width = Math.round(crop.w * k)
  c.height = Math.round(crop.h * k)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
  bmp.close()
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Не получилось обработать картинку'))), 'image/png'))

  if (look.solid) warnings.push('У логотипа сплошной фон - в меню будет видна плашка. Лучше PNG с прозрачным фоном или SVG')
  else if (look.light > 0.8) warnings.push('Логотип очень светлый - на сером фоне меню его почти не видно')
  if (crop.h < 64 && crop.w < 320) warnings.push('Картинка мелкая и может выглядеть размытой - лучше от 64 px в высоту или SVG')
  if (crop.h > crop.w * 1.4) warnings.push('Вертикальный логотип в меню будет мелким - лучше горизонтальный')
  return { blob, type: 'image/png', ext: 'png', url: URL.createObjectURL(blob), w: crop.w, h: crop.h, trimmed, warnings }
}

/** Загружает готовый логотип в папку кабинета и возвращает публичную ссылку. Ошибки - понятным текстом */
export async function uploadLogo(workspaceId: string, logo: PreparedLogo): Promise<string> {
  const path = `${workspaceId}/${Date.now()}.${logo.ext}`
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, logo.blob, { contentType: logo.type, cacheControl: '31536000' })
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
