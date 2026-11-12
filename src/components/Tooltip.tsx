import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Фирменные подсказки вместо системных. Любой элемент с атрибутом title
 * при наведении отдаёт текст в data-tip, и мы рисуем подсказку сами.
 * Так не нужно менять каждый title по коду.
 */
export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const current = useRef<Element | null>(null)

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current)
      current.current = null
      setTip(null)
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = (e.target as Element | null)?.closest?.('[title],[data-tip]')
      if (el === current.current) return
      hide()
      if (!el) return
      const title = el.getAttribute('title')
      if (title !== null) {
        el.removeAttribute('title')
        if (title) el.setAttribute('data-tip', title)
        if (title && !el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title)
      }
      const text = el.getAttribute('data-tip')
      if (!text) return
      current.current = el
      timer.current = window.setTimeout(() => {
        if (current.current !== el || !el.isConnected) return
        const r = el.getBoundingClientRect()
        const below = r.top < 44
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below })
      }, 350)
    }
    const out = (e: PointerEvent) => {
      if (!current.current) return
      const to = e.relatedTarget as Node | null
      if (to && current.current.contains(to)) return
      hide()
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    window.addEventListener('pointerdown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('keydown', hide, true)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      window.removeEventListener('pointerdown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('keydown', hide, true)
    }
  }, [])

  if (!tip) return null
  const half = 130
  const x = Math.min(Math.max(tip.x, half / 2 + 8), window.innerWidth - half / 2 - 8)
  return createPortal(
    <div
      role="tooltip"
      className="fade pointer-events-none fixed z-[100] max-w-[260px] rounded-xl bg-ink px-2.5 py-1.5 text-center text-xs leading-4 text-white shadow-[0_4px_12px_rgba(21,23,28,0.18)]"
      style={{ left: x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}
    >
      {tip.text}
    </div>,
    document.body,
  )
}
