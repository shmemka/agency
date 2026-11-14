import { useMemo } from 'react'
import { safeHtml } from '../lib/rich'
import { cx } from './ui'

/** Показ текста с форматированием (комментарии, заметки). Старый обычный текст тоже показывается правильно */
export function RichText({ value, className }: { value: string | null | undefined; className?: string }) {
  const html = useMemo(() => safeHtml(value), [value])
  if (!html) return null
  return <div className={cx('rich break-words', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
