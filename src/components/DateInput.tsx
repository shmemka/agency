import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { POPOVER_GAP, cx } from './ui'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (v: string | null | undefined) => {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}
const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches

function label(d: Date, compact?: boolean) {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${compact && sameYear ? '' : ` ${d.getFullYear()}`}`
}

/** Поле даты с фирменным календарём. value и onChange в формате YYYY-MM-DD */
export function DateInput({
  value,
  onChange,
  placeholder = 'Выбрать дату',
  className,
  compact,
  clearable = true,
  'aria-label': ariaLabel,
  trigger,
  triggerClassName,
}: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  placeholder?: string
  className?: string
  /** Без года, если дата в текущем году: для узких мест */
  compact?: boolean
  clearable?: boolean
  'aria-label'?: string
  /** Своя кнопка вместо поля: например, кружок с датой на карточке задачи */
  trigger?: (sel: Date | null) => ReactNode
  triggerClassName?: string
}) {
  const sel = parse(value)
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<Date>(sel ?? today)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const phone = isPhone()

  function show() {
    const r = btn.current!.getBoundingClientRect()
    const h = 392
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 312))
    if (window.innerHeight - r.bottom > h || r.top < h) setPos({ top: r.bottom + POPOVER_GAP, left })
    else setPos({ bottom: window.innerHeight - r.top + POPOVER_GAP, left })
    setFocus(sel ?? today)
    setOpen(true)
  }
  function close(refocus = true) {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }
  function pick(d: Date | null) {
    onChange(d ? iso(d) : null)
    close()
  }

  useEffect(() => {
    if (!open) return
    const out = (e: Event) => {
      if (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const reflow = () => (phone ? null : setOpen(false))
    window.addEventListener('mousedown', out)
    window.addEventListener('resize', reflow)
    window.addEventListener('scroll', reflow, true)
    return () => {
      window.removeEventListener('mousedown', out)
      window.removeEventListener('resize', reflow)
      window.removeEventListener('scroll', reflow, true)
    }
  }, [open, phone])

  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLElement>(`[data-d="${iso(focus)}"]`)?.focus()
  }, [open, focus])

  function onKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in moves) {
      e.preventDefault()
      setFocus((f) => shift(f, moves[e.key]))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      setFocus((f) => new Date(f.getFullYear(), f.getMonth() + (e.key === 'PageUp' ? -1 : 1), Math.min(f.getDate(), 28)))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  // сетка: 6 недель с понедельника
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1)
  const start = shift(first, -((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => shift(start, i))
  const weeks = cells[35].getMonth() !== focus.getMonth() ? cells.slice(0, 35) : cells
  const quick: [string, Date][] = [
    ['Сегодня', today],
    ['Завтра', shift(today, 1)],
    ['Через неделю', shift(today, 7)],
  ]

  const calendar = (
    <div onKeyDown={onKey} className="w-full md:w-[296px]">
      <div className="flex items-center gap-1 pb-2 pl-2">
        <span className="flex-1 text-sm font-medium">
          {MONTHS[focus.getMonth()]} {focus.getFullYear()}
        </span>
        <button type="button" aria-label="Предыдущий месяц" onClick={() => setFocus(new Date(focus.getFullYear(), focus.getMonth() - 1, 1))} className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink">
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </button>
        <button type="button" aria-label="Следующий месяц" onClick={() => setFocus(new Date(focus.getFullYear(), focus.getMonth() + 1, 1))} className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink">
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      <div role="grid" aria-label={`${MONTHS[focus.getMonth()]} ${focus.getFullYear()}`} className="grid grid-cols-7 gap-y-0.5">
        {DAYS.map((d) => (
          <div key={d} role="columnheader" className="flex h-8 items-center justify-center text-xs text-faint">
            {d}
          </div>
        ))}
        {weeks.map((d) => {
          const key = iso(d)
          const isSel = sel && key === iso(sel)
          const isToday = key === iso(today)
          const outside = d.getMonth() !== focus.getMonth()
          const isFocus = key === iso(focus)
          return (
            <div key={key} role="gridcell" className="flex justify-center">
              <button
                type="button"
                data-d={key}
                tabIndex={isFocus ? 0 : -1}
                aria-selected={!!isSel}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`}
                onClick={() => pick(d)}
                className={cx(
                  'inline-flex items-center justify-center rounded-full text-[13px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
                  phone ? 'size-11 text-[15px]' : 'size-9',
                  isSel ? 'bg-ink text-white' : isToday ? 'bg-lime text-ink hover:bg-lime/80' : 'hover:bg-soft',
                  outside && !isSel && 'text-faint',
                )}
              >
                {d.getDate()}
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
        {quick.map(([l, d]) => (
          <button key={l} type="button" onClick={() => pick(d)} className="h-8 rounded-full bg-soft px-3 text-[13px] hover:bg-ink/[0.07]">
            {l}
          </button>
        ))}
        {clearable && sel && (
          <button type="button" onClick={() => pick(null)} className="ml-auto h-8 rounded-full px-3 text-[13px] text-muted hover:bg-soft hover:text-ink">
            Очистить
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className={cx('relative min-w-0', className)}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${sel ? label(sel) : 'не выбрана'}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            show()
          }
        }}
        className={
          trigger
            ? cx('flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/25', triggerClassName)
            : cx(
                'flex h-10 w-full items-center gap-2 rounded-2xl bg-soft pr-3 pl-4 text-left text-sm transition-[background-color,box-shadow] duration-150 hover:bg-ink/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/25',
                open && 'ring-1 ring-ink/25',
              )
        }
      >
        {trigger ? (
          trigger(sel)
        ) : (
          <>
            <span className={cx('num min-w-0 flex-1 truncate', !sel && 'text-faint')}>{sel ? label(sel, compact) : placeholder}</span>
            <CalendarDays className={cx('size-4 shrink-0 text-faint', clearable && sel && !compact && 'invisible')} strokeWidth={1.5} />
          </>
        )}
      </button>
      {!trigger && clearable && sel && !compact && (
        <button
          type="button"
          aria-label="Очистить дату"
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-full text-faint hover:bg-ink/10 hover:text-ink"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      )}
      {open &&
        createPortal(
          phone ? (
            <div className="fade fixed inset-0 z-[70] flex items-end bg-ink/30" onMouseDown={() => close(false)}>
              <div ref={pop} role="dialog" aria-label={ariaLabel ?? 'Выбор даты'} className="sheet safe-bottom w-full rounded-t-[28px] bg-surface p-4 pt-5" onMouseDown={(e) => e.stopPropagation()}>
                {calendar}
              </div>
            </div>
          ) : (
            <div
              ref={pop}
              role="dialog"
              aria-label={ariaLabel ?? 'Выбор даты'}
              className="fade fixed z-[70] rounded-[22px] bg-surface p-3 shadow-[0_8px_24px_rgba(21,23,28,0.12)] ring-1 ring-line"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
            >
              {calendar}
            </div>
          ),
          document.body,
        )}
    </div>
  )
}
