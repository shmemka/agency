// Встроенный просмотр вложений: openViewer(файлы, номер) открывает окно поверх страницы.
// Само окно (FileViewerHost) живёт в main.tsx рядом с уведомлениями, поэтому работает и на страницах для клиента

export interface ViewItem {
  name: string
  mime?: string | null
  size?: number | null
  /** файл в закрытом хранилище: ссылку на него окно попросит само */
  bucket?: string
  path?: string | null
  /** или готовая ссылка */
  url?: string
}

const EVENT = 'app:viewer'

export function openViewer(items: ViewItem[], index = 0) {
  if (!items.length) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { items, index: Math.max(0, Math.min(index, items.length - 1)) } }))
}

export function onViewer(handler: (v: { items: ViewItem[]; index: number }) => void) {
  const h = (e: Event) => handler((e as CustomEvent<{ items: ViewItem[]; index: number }>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
