import { useEffect, useRef, useState, type ReactNode } from 'react'
import art from '../assets/onboarding.svg'
import { APP } from '../lib/constants'

/*
 * Экран с иллюстрацией во весь фон: фигура сверху по центру, ленты уходят за края.
 * Картинка растягивается по большей стороне окна, а блок с текстом стоит под фигурой:
 * его отступ считается от высоты картинки, поэтому они не наезжают друг на друга ни на каком экране.
 * Так выглядят вход, регистрация, выбор кабинета и остальные экраны до входа в кабинет.
 */
const ART_H = 'max(100vw * 906 / 1677, 100dvh)'

export function ArtScreen({ children, corner }: { children: ReactNode; corner?: ReactNode }) {
  useEffect(() => {
    document.title = APP
  }, [])
  // на низком экране форма длиннее картинки и страница прокручивается:
  // тогда низ картинки растворяется в фоне, чтобы лента не обрывалась ровной линией
  const root = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const [tall, setTall] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const check = () => setTall(el.scrollHeight > (img.current?.offsetHeight ?? 0) + 1)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    if (img.current) ro.observe(img.current)
    return () => ro.disconnect()
  }, [])
  const fade = tall ? 'linear-gradient(to bottom, #000 70%, transparent)' : undefined
  return (
    <div ref={root} className="relative min-h-dvh overflow-hidden bg-canvas">
      <img
        ref={img}
        src={art}
        alt=""
        aria-hidden
        draggable={false}
        className="onboard-art pointer-events-none absolute top-0 left-1/2 max-w-none -translate-x-1/2 select-none"
        style={{ width: 'max(100vw, 100dvh * 1677 / 906)', aspectRatio: '1677 / 906', maskImage: fade, WebkitMaskImage: fade }}
      />
      {corner && <div className="absolute top-4 right-4 z-10 md:top-6 md:right-6">{corner}</div>}
      {/* фигура заканчивается на 46% высоты картинки — блок начинается чуть ниже */}
      <main className="relative flex flex-col items-center px-4 pb-12 text-center" style={{ paddingTop: `calc(${ART_H} * 0.49)` }}>
        {children}
      </main>
    </div>
  )
}

/** Заголовок и подпись экрана: крупно, по центру */
export function ArtTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <h1 className="text-[26px] leading-8 tracking-tight md:text-[34px] md:leading-10">{title}</h1>
      {sub && <p className="mt-3 max-w-lg text-balance text-muted">{sub}</p>}
    </>
  )
}

/** Большое поле-«пилюля», как кнопки на первом экране */
export const BIG_FIELD =
  'h-14 w-full min-w-0 rounded-full bg-surface px-6 text-[16px] text-ink ring-1 ring-transparent transition-shadow duration-150 placeholder:text-faint focus:ring-ink/25 focus:outline-none'
