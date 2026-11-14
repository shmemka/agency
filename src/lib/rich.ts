import DOMPurify from 'dompurify'

/**
 * Текст с форматированием хранится как небольшой HTML: абзацы, жирный, курсив, подчёркнутый,
 * зачёркнутый, списки, ссылки и выделение цветом. Старые записи — обычный текст, их понимаем тоже.
 */

/** Цвета выделения: название хранится в тексте, сами цвета — в index.css */
export const HIGHLIGHTS = [
  { id: 'yellow', label: 'Жёлтый' },
  { id: 'lime', label: 'Зелёный' },
  { id: 'pink', label: 'Красный' },
  { id: 'blue', label: 'Синий' },
] as const
export type HighlightId = (typeof HIGHLIGHTS)[number]['id']

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ul', 'ol', 'li', 'a', 'mark']
const ALLOWED_ATTR = ['href', 'target', 'rel', 'data-color']

let hooked = false
function purify(html: string) {
  if (!hooked) {
    // любая ссылка открывается в новой вкладке и не получает доступа к нашей странице
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer nofollow')
      }
      if (node.tagName === 'MARK' && !HIGHLIGHTS.some((h) => h.id === node.getAttribute('data-color'))) node.setAttribute('data-color', 'yellow')
    })
    hooked = true
  }
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

/** Это уже форматированный текст или старый обычный? */
export const isRich = (v: string | null | undefined) => !!v && /^\s*<(p|ul|ol)[\s>]/i.test(v)

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Обычный текст → абзацы, чтобы редактор и отображение работали одинаково */
export function toHtml(v: string | null | undefined): string {
  if (!v) return ''
  if (isRich(v)) return purify(v)
  return v
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Безопасный HTML для показа: только разрешённые теги, ссылки в новой вкладке */
export const safeHtml = (v: string | null | undefined) => toHtml(v)

/** Без форматирования: для поиска, коротких превью и проверки «пусто ли» */
export function plain(v: string | null | undefined): string {
  if (!v) return ''
  if (!isRich(v)) return v
  const d = document.createElement('div')
  d.innerHTML = purify(v.replace(/<\/(p|li)>/gi, '</$1>\n').replace(/<br\s*\/?>/gi, '\n'))
  return (d.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
