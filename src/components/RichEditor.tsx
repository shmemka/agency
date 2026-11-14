import { lazy, Suspense } from 'react'
import { cx } from './ui'

export type RichEditorProps = {
  /** HTML из редактора или старый обычный текст */
  value: string | null | undefined
  /** пустое поле отдаёт пустую строку */
  onChange: (html: string) => void
  onBlur?: () => void
  /** поле комментария: Enter отправляет (кроме телефона и списков) */
  onSubmit?: () => void
  placeholder?: string
  label?: string
  /** панель форматирования видна, только пока пишешь */
  compact?: boolean
  autoFocus?: boolean
  /** высота и прочее для обёртки, например min-h-24 */
  className?: string
  /** data-field для проверки «это поле сейчас редактируется» */
  field?: string
}

// редактор весит заметно больше остального сайта, поэтому грузится отдельно — когда впервые понадобился
const load = () => import('./RichEditorImpl')
const Impl = lazy(load)
/** Подгрузить редактор заранее, когда кабинет уже открылся: к моменту, когда откроют задачу или блогера, он готов */
export function preloadRichEditor() {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
  idle(() => void load())
}

/** Поле с форматированием: жирный, курсив, подчёркнутый, зачёркнутый, списки, ссылки, выделение цветом */
export function RichEditor(props: RichEditorProps) {
  return (
    <Suspense fallback={<div className={cx('w-full rounded-2xl bg-soft', props.compact ? 'min-h-11' : 'min-h-24', props.className)} aria-busy />}>
      <Impl {...props} />
    </Suspense>
  )
}
