import { Children, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type CSSProperties, type HTMLAttributes, type ReactNode, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronLeft, Copy, Loader2, SlidersHorizontal, X } from 'lucide-react'
import { BLOGGER_STATUSES, PHASES, STATUSES, STATUS_ORDER, bloggerStatusInfo, nextStatus, phaseInfo, statusInfo, type BloggerStatus, type Status } from '../lib/constants'
import { onToast } from '../lib/toast'

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ')
}

export const isPhone = () => window.matchMedia('(max-width: 767px)').matches
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Телефон или узкое окно: меняется вместе с поворотом экрана */
export function useIsPhone() {
  const [phone, setPhone] = useState(isPhone)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)')
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

/**
 * Сколько пикселей снизу закрывает клавиатура телефона. Окна-панели снизу поднимаются на эту высоту,
 * иначе поле, в которое пишут, оказывается под клавиатурой
 */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const on = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
      setInset(0)
    }
  }, [active])
  return inset
}

// сколько окон и панелей сейчас открыто: страница под ними не прокручивается, пока открыто хоть одно
let locks = 0
/** Пока окно открыто, страница под ним стоит на месте: на телефоне иначе прокручивается фон */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const html = document.documentElement
    if (locks++ === 0) {
      // ширина полосы прокрутки, чтобы на компьютере страница не дёргалась вбок
      const gap = window.innerWidth - html.clientWidth
      html.style.overflow = 'hidden'
      if (gap > 0) html.style.paddingRight = `${gap}px`
    }
    return () => {
      if (--locks === 0) {
        html.style.overflow = ''
        html.style.paddingRight = ''
      }
    }
  }, [active])
}

/**
 * Держит элемент на экране ещё `ms` после закрытия, чтобы он успел плавно уйти.
 * leaving — уже закрыт и доигрывает уход (на него вешается класс .leaving).
 */
export function usePresence(open: boolean, ms = 160) {
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) return setShown(true)
    if (!shown) return
    if (reducedMotion()) return setShown(false)
    const t = setTimeout(() => setShown(false), ms)
    return () => clearTimeout(t)
  }, [open, shown, ms])
  return { mounted: open || shown, leaving: !open && shown }
}

/**
 * true, пока список ещё не показан, и первые ms после показа (ready = данные загрузились).
 * Строки, появившиеся вместе со списком, въезжают по очереди; добавленные потом — сразу, без задержки
 */
export function useEntrance(ready = true, ms = 1300) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setOn(false), ms)
    return () => clearTimeout(t)
  }, [ready, ms])
  return on
}

/** Скопировать текст в буфер. copied — true полторы секунды после успеха: кнопка показывает галочку */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { copied, copy }
}

/** Иконка копирования, которая после нажатия на миг становится галочкой */
export function CopyIcon({ copied }: { copied: boolean }) {
  return (
    <span className="relative inline-flex size-3.5">
      <Copy className={cx('absolute inset-0 size-3.5 transition-[opacity,transform] duration-300', copied ? 'scale-50 opacity-0' : 'opacity-100')} strokeWidth={1.5} />
      <Check className={cx('absolute inset-0 size-3.5 transition-[opacity,transform] duration-300', copied ? 'opacity-100' : 'scale-50 opacity-0')} strokeWidth={2} />
    </span>
  )
}

/* ---------- скелетоны: серые плашки той же формы, что и будущие данные ---------- */

/** Одна плашка. Высоту и ширину задают классами: h-4 w-32 */
export function Skel({ className, style }: { className?: string; style?: CSSProperties }) {
  // своё скругление (rounded-card у больших блоков) важнее круглого по умолчанию
  return <span aria-hidden className={cx('skel block', !/\brounded-/.test(className ?? '') && 'rounded-full', className)} style={style} />
}

/** Обёртка для скелетона: для читалки экрана «Загружаем», на глаз появляется с задержкой, чтобы не мелькать */
export function Loading({ children, className, label = 'Загружаем' }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cx('skel-wrap', className)}>
      {children}
    </div>
  )
}

// ширины «текста» в строках: разные, чтобы скелетон не выглядел решёткой
const W = ['62%', '48%', '71%', '55%', '66%', '44%', '58%', '69%', '51%', '63%']

/** Таблица-заглушка: те же белые строки-плашки, что у Table */
export function SkelTable({ rows = 8, cols = [3, 1, 1, 1, 1] }: { rows?: number; cols?: number[] }) {
  return (
    <Loading>
      <div className="hidden md:block">
        <table className="rows w-full [&_td]:px-2.5 [&_td]:py-3.5 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5">
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {cols.map((c, i) => (
                  <td key={i} style={{ width: `${(c / cols.reduce((a, b) => a + b, 0)) * 100}%` }}>
                    {i === 0 ? (
                      <div className="flex items-center gap-3">
                        <Skel className="size-7 shrink-0" />
                        <Skel className="h-3.5" style={{ width: W[r % W.length] }} />
                      </div>
                    ) : (
                      <Skel className="h-3" style={{ width: W[(r + i * 3) % W.length] }} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-0.5 md:hidden">
        {Array.from({ length: Math.min(rows, 6) }, (_, r) => (
          <div key={r} className={cx('flex items-center gap-3 bg-surface px-4 py-3.5', r === 0 && 'rounded-t-[20px]', r === Math.min(rows, 6) - 1 && 'rounded-b-[20px]')}>
            <Skel className="size-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skel className="h-3.5" style={{ width: W[r % W.length] }} />
              <Skel className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** Панель блогера, интеграции или задачи, пока карточка грузится по прямой ссылке */
export function SkelDrawer() {
  return (
    <Loading className="flex flex-col gap-3 p-3 md:p-4">
      <div className="rounded-card bg-surface p-6">
        <Skel className="h-6 w-48" />
        <Skel className="mt-3 h-3.5 w-64" />
        <div className="mt-6 flex gap-2">
          <Skel className="h-8 w-28" />
          <Skel className="h-8 w-24" />
        </div>
      </div>
      <div className="rounded-card bg-surface p-6">
        {[0, 1, 2, 3].map((r) => (
          <div key={r} className="flex items-center justify-between gap-6 py-3">
            <Skel className="h-3 w-24" />
            <Skel className="h-3.5" style={{ width: W[r + 3] }} />
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** Строки списка в карточке: как пункты «Требует внимания» или «Ближайшие выходы» */
export function SkelList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Loading className={className}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex min-h-12 items-center gap-3 border-t border-line py-2 first:border-t-0">
          <Skel className="size-2.5 shrink-0" />
          <Skel className="h-3.5" style={{ width: W[(r + 2) % W.length] }} />
        </div>
      ))}
    </Loading>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ComponentProps<'button'> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      type="button"
      data-variant={variant}
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,color,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink/85',
        // белая кнопка без обводки; внутри белых карточек и окон она серая (см. index.css)
        variant === 'secondary' && 'bg-surface text-ink hover:bg-white/70',
        variant === 'ghost' && 'text-muted hover:bg-ink/5 hover:text-ink',
        variant === 'danger' && 'text-bad hover:bg-bad/10',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

/** Круглая кнопка с иконкой */
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-[background-color,color,transform] duration-200 hover:bg-ink/5 hover:text-ink active:scale-[0.92]', className)}
    >
      {children}
    </button>
  )
}

const fieldBase = 'w-full rounded-2xl bg-soft px-4 text-sm text-ink placeholder:text-faint ring-1 ring-transparent transition-shadow duration-200 focus:bg-surface focus:outline-none focus:ring-ink/25'

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(fieldBase, 'h-10', props.className)} />
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(fieldBase, 'min-h-20 resize-none py-3 leading-5 [field-sizing:content]', props.className)} />
}
type SelectEvent = { target: { value: string } }

/*
 * Общая геометрия выпадающих списков.
 * Радиус оболочки 18 = радиус пункта 12 + отступ 6, чтобы скругления шли параллельно.
 * Текст пункта: отступ оболочки 6 + 10 = 16, ровно как pl-4 у кнопки, поэтому текст в списке стоит под текстом кнопки.
 * Галочка: 6 + 6 = 12, как pr-3 у кнопки, поэтому она встаёт под стрелку.
 */
export const POPOVER = 'rounded-[18px] bg-surface p-1.5 shadow-[0_8px_24px_rgba(21,23,28,0.12)] ring-1 ring-line'
export const POPOVER_GAP = 6
export const ITEM = 'flex w-full items-center rounded-xl pr-1.5 pl-2.5 text-left'
export const ITEM_DESKTOP = 'h-9 text-[13px]'
const ITEM_PHONE = 'h-12 text-[15px]'
interface SelectOption {
  value: string
  label: ReactNode
  text: string
  disabled?: boolean
}

function readOptions(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = []
  const walk = (nodes: ReactNode) =>
    Children.forEach(nodes, (n) => {
      if (!isValidElement(n)) return
      const props = n.props as { value?: string | number; children?: ReactNode; disabled?: boolean }
      if (n.type === 'option') {
        const text = Children.toArray(props.children).join('')
        out.push({ value: String(props.value ?? text), label: props.children, text, disabled: props.disabled })
      } else if (props.children) walk(props.children)
    })
  walk(children)
  return out
}

/**
 * Выпадающий список в стиле сайта. Принимает те же <option>, что и обычный select,
 * и отдаёт onChange({ target: { value } }). На телефоне открывается панелью снизу,
 * в длинных списках появляется поиск.
 */
export function Select({
  value,
  onChange,
  children,
  className,
  disabled,
  tone = 'field',
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string | number | null | undefined
  onChange?: (e: SelectEvent) => void
  children: ReactNode
  className?: string
  disabled?: boolean
  /** field — серое поле в форме, surface — белое на сером фоне страницы, dark — на тёмной панели */
  tone?: 'field' | 'surface' | 'dark'
  placeholder?: string
  'aria-label'?: string
}) {
  const options = readOptions(children)
  const current = options.find((o) => o.value === String(value ?? ''))
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number }>({ left: 0, width: 0, maxH: 320 })
  const maxW = Math.max(pos.width, 320)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const phone = isPhone()
  // на телефоне список — панель снизу: фон под ней не прокручивается
  useScrollLock(open && phone)
  const searchable = options.length > 12
  const shown = q.trim() ? options.filter((o) => o.text.toLowerCase().includes(q.trim().toLowerCase())) : options

  function place() {
    const r = btn.current!.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const want = Math.min(360, options.length * 36 + (searchable ? 54 : 12))
    const width = r.width
    const left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(width, 320) - 8))
    if (below >= Math.min(want, 240) || below >= above) setPos({ top: r.bottom + POPOVER_GAP, left, width, maxH: Math.max(160, Math.min(360, below)) })
    else setPos({ bottom: window.innerHeight - r.top + POPOVER_GAP, left, width, maxH: Math.max(160, Math.min(360, above)) })
  }

  function show() {
    if (disabled) return
    place()
    setQ('')
    setActive(Math.max(0, options.findIndex((o) => o.value === String(value ?? ''))))
    setOpen(true)
  }

  function pick(o: SelectOption) {
    if (o.disabled) return
    setOpen(false)
    btn.current?.focus()
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } })
  }

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (list.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const reflow = () => (phone ? null : setOpen(false))
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', reflow)
    window.addEventListener('scroll', reflow, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', reflow)
      window.removeEventListener('scroll', reflow, true)
    }
  }, [open, phone])

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(shown.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[active]) pick(shown[active])
    } else if (e.key === 'Tab') setOpen(false)
  }

  const items = (
    <>
      {searchable && (
        <div className="pb-1.5">
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            placeholder="Найти"
            aria-label="Поиск по списку"
            className="h-9 w-full rounded-xl bg-soft pr-1.5 pl-2.5 text-[13px] placeholder:text-faint focus:outline-none"
          />
        </div>
      )}
      <div className="min-h-0 overflow-y-auto" style={{ maxHeight: phone ? '60vh' : pos.maxH - 12 - (searchable ? 42 : 0) }}>
        {shown.map((o, i) => {
          const sel = o.value === String(value ?? '')
          return (
            <button
              key={o.value + i}
              type="button"
              role="option"
              aria-selected={sel}
              aria-disabled={o.disabled}
              data-i={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={cx(
                ITEM, 'gap-2.5',
                phone ? ITEM_PHONE : ITEM_DESKTOP,
                i === active && 'bg-soft',
                o.disabled && 'opacity-40',
                o.value === '' && !sel && 'text-muted',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {sel && <Check className="size-4 shrink-0" strokeWidth={1.5} />}
            </button>
          )
        })}
        {shown.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">Ничего не нашли</div>}
      </div>
    </>
  )

  return (
    <div className={cx('relative min-w-0', className)}>
      <button
        data-tone={tone}
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={cx(
          'flex h-10 w-full items-center gap-2 pr-3 pl-4 text-left text-sm transition-[background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
          // фильтры на фоне страницы и в тёмной панели — капсулы; поля внутри карточек — со скруглением 16
          tone === 'field' ? 'rounded-2xl' : 'rounded-full',
          tone === 'field' && 'bg-soft text-ink hover:bg-ink/[0.06] focus-visible:ring-ink/25',
          tone === 'surface' && 'bg-surface text-ink hover:bg-white/70 focus-visible:ring-ink/25',
          tone === 'dark' && 'bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white/50',
          open && tone !== 'dark' && 'ring-1 ring-ink/15',
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', !current?.text && !placeholder && 'text-faint', current?.value === '' && tone !== 'dark' && 'text-muted')}>{current?.label ?? placeholder ?? '—'}</span>
        <ChevronDown className={cx('size-4 shrink-0 transition-transform duration-200', tone === 'dark' ? 'text-white/70' : 'text-faint', open && 'rotate-180')} strokeWidth={1.5} />
      </button>
      {open &&
        createPortal(
          phone ? (
            <div className="fade fixed inset-0 z-[70] flex items-end bg-ink/30" onMouseDown={() => setOpen(false)}>
              <div ref={list} role="listbox" aria-label={ariaLabel} className="sheet safe-bottom w-full rounded-t-[28px] bg-surface p-3" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
                {ariaLabel && <div className="pt-2 pr-1.5 pb-2 pl-2.5 text-[13px] text-muted">{ariaLabel}</div>}
                {items}
              </div>
            </div>
          ) : (
            <div
              ref={list}
              role="listbox"
              aria-label={ariaLabel}
              onKeyDown={onKey}
              className={cx('pop fixed z-[70] flex flex-col overflow-hidden', POPOVER)}
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: 'max-content', minWidth: pos.width, maxWidth: maxW, maxHeight: pos.maxH }}
            >
              {items}
            </div>
          ),
          document.body,
        )}
    </div>
  )
}

/** Подгруппа полей внутри формы: тонкая рамка вместо заливки, чтобы серые поля не сливались с фоном */
export function FieldGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx('rounded-inner p-4 ring-1 ring-ink/10 ring-inset', className)}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-3 text-[13px] font-medium text-ink">{title}</div>
      {children}
    </fieldset>
  )
}

/** as="div" — для полей с собственными кнопками (текст с форматированием): <label> переадресовал бы клик первой кнопке */
export function Field({ label, hint, children, className, as: Tag = 'label' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; as?: 'label' | 'div' }) {
  return (
    <Tag className={cx('block', className)}>
      <span className="mb-1 block text-[13px] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </Tag>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-faint', className)} />
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-card bg-surface p-5 sm:p-6', className)}>
      {children}
    </div>
  )
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-8 tracking-tight sm:text-[32px] sm:leading-9">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="appear rounded-card bg-surface px-6 py-12 text-center">
      <p className="text-base">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  )
}

/** Тихая плашка: нейтральная, смысл несёт точка */
export function Chip({ dot, children, className, tone }: { dot?: string; children: ReactNode; className?: string; tone?: 'warn' | 'bad' | 'dark' }) {
  return (
    <span
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] whitespace-nowrap',
        tone === 'dark' ? 'bg-ink text-white' : tone === 'warn' ? 'bg-amber-100 text-warn' : tone === 'bad' ? 'bg-orange-100 text-bad' : 'bg-soft text-ink',
        className,
      )}
    >
      {dot && <span className={cx('size-2 rounded-full', dot)} />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = statusInfo(status)
  return (
    <Chip dot={phaseInfo(s.phase).dot} className={className}>
      {s.label}
    </Chip>
  )
}

export function BloggerStatusBadge({ status, className }: { status: BloggerStatus; className?: string }) {
  const s = bloggerStatusInfo(status)
  return (
    <Chip dot={s.id === 'blacklist' ? undefined : s.dot} tone={s.id === 'blacklist' ? 'dark' : undefined} className={className}>
      {s.label}
    </Chip>
  )
}

/** Выпадающее меню; на телефоне — панель снизу с крупными строками */
export function Menu<T extends string>({
  value,
  options,
  onChange,
  trigger,
  title,
  chevron = true,
}: {
  value: T
  options: { id: T; label: string; dot?: string; group?: string; danger?: boolean }[]
  onChange: (v: T) => void
  trigger: ReactNode
  title: string
  chevron?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const phone = isPhone()
  // на телефоне список — панель снизу: фон под ней не прокручивается
  useScrollLock(open && phone)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    if (!phone) window.addEventListener('scroll', close, { once: true, capture: true })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [open, phone])

  const list = options.map((o, i) => (
    <div key={o.id}>
      {i > 0 && o.group !== options[i - 1].group && <div className="mx-2.5 my-1.5 h-px bg-line" />}
      <button
        role="option"
        aria-selected={o.id === value}
        className={cx(ITEM, 'gap-1.5 hover:bg-soft', o.danger && 'text-bad', phone ? ITEM_PHONE : ITEM_DESKTOP)}
        onClick={() => {
          setOpen(false)
          if (o.id !== value) onChange(o.id)
        }}
      >
        {o.dot && <span className={cx('size-2 shrink-0 rounded-full', o.dot)} />}
        <span className="flex-1">{o.label}</span>
        {o.id === value && <Check className="size-4 shrink-0" strokeWidth={1.5} />}
      </button>
    </div>
  ))

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="group inline-flex items-center gap-0.5 rounded-full"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          const r = btn.current!.getBoundingClientRect()
          const groups = new Set(options.map((o) => o.group)).size
          const h = options.length * 36 + (groups - 1) * 13 + 12
          const below = window.innerHeight - r.bottom - POPOVER_GAP - 8
          // кнопка у правого края (например, «⋯» в строке файла) — меню раскрывается влево, под самой кнопкой
          const right = r.left > window.innerWidth / 2
          setPos({ top: below >= h ? r.bottom + POPOVER_GAP : Math.max(8, r.top - POPOVER_GAP - h), left: right ? Math.max(8, r.right - 224 + 6) : Math.max(8, Math.min(r.left - 6, window.innerWidth - 232)) })
          setOpen((o) => !o)
        }}
      >
        {trigger}
        {chevron && <ChevronDown className="size-3.5 text-faint opacity-60 group-hover:opacity-100" strokeWidth={1.5} />}
      </button>
      {open &&
        createPortal(
          phone ? (
            <div className="fade fixed inset-0 z-[70] flex items-end bg-ink/30" onMouseDown={() => setOpen(false)}>
              <div role="listbox" className="sheet safe-bottom max-h-[80vh] w-full overflow-y-auto rounded-t-[28px] bg-surface p-3" onMouseDown={(e) => e.stopPropagation()}>
                <div className="pt-1 pr-1.5 pb-2 pl-2.5 text-[13px] text-muted">{title}</div>
                {list}
              </div>
            </div>
          ) : (
            <div role="listbox" className={cx('pop fixed z-[70] w-56', POPOVER)} style={pos} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              {list}
            </div>
          ),
          document.body,
        )}
    </>
  )
}

export function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <Menu
      title="Этап"
      value={value}
      onChange={onChange}
      options={STATUSES.map((s) => ({ id: s.id, label: s.label, dot: phaseInfo(s.phase).dot, group: s.phase }))}
      trigger={<StatusBadge status={value} />}
    />
  )
}

export function BloggerStatusSelect({ value, onChange }: { value: BloggerStatus; onChange: (s: BloggerStatus) => void }) {
  return (
    <Menu
      title="Статус блогера"
      value={value}
      onChange={onChange}
      options={BLOGGER_STATUSES.map((s) => ({ id: s.id, label: s.label, dot: s.dot }))}
      trigger={<BloggerStatusBadge status={value} />}
    />
  )
}

/** Дорожка этапов интеграции. На телефоне — текущий этап и кнопка следующего */
export function StatusRail({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const cur = STATUS_ORDER[value]
  const stopped = value === 'declined'
  const next = nextStatus(value)
  const flow = PHASES.filter((p) => p.id !== 'stop')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <StatusSelect value={value} onChange={onChange} />
        {next && !stopped && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => onChange(next)}>
            Дальше: {statusInfo(next).label}
          </Button>
        )}
      </div>
      <div className="hidden md:block">
        <div className="grid grid-cols-5 gap-2">
          {flow.map((ph) => (
            <div key={ph.id} className="min-w-0">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                <span className={cx('size-2 rounded-full', ph.dot)} />
                {ph.label}
              </div>
              <div className="flex flex-col gap-1">
                {STATUSES.filter((s) => s.phase === ph.id).map((s) => {
                  const idx = STATUS_ORDER[s.id]
                  const isCur = s.id === value
                  const passed = !stopped && idx < cur
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onChange(s.id)}
                      aria-pressed={isCur}
                      className={cx(
                        'h-8 truncate rounded-full px-3 text-left text-[13px] transition-colors duration-200',
                        isCur ? 'bg-ink text-white' : passed ? 'bg-lime/45 text-ink hover:bg-lime/70' : 'hatch text-muted hover:text-ink',
                      )}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange('declined')}
          aria-pressed={stopped}
          className={cx('mt-2 h-8 rounded-full px-3 text-[13px] transition-colors duration-200', stopped ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink')}
        >
          Отказ
        </button>
      </div>
    </div>
  )
}

/** Переключатель-пилюля: активное — чёрное */
export function Segmented<T extends string>({ value, options, onChange, className, size = 'md' }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg'
  // тёмная подложка переезжает под выбранный вариант, а не перескакивает
  const box = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number; animate: boolean } | null>(null)
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el) return setPill(null)
    setPill((p) => ({ x: el.offsetLeft, w: el.offsetWidth, animate: !!p }))
  }, [value, options.length])
  // вариантов больше, чем влезает (телефон): выбранный подкручиваем в поле зрения, края затухают
  const [edge, setEdge] = useState({ l: false, r: false })
  const edges = useCallback(() => {
    const el = box.current
    if (!el) return
    setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }, [])
  useEffect(() => {
    const el = box.current
    const a = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el && a && el.scrollWidth > el.clientWidth) {
      const left = a.offsetLeft - (el.clientWidth - a.offsetWidth) / 2
      el.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
    edges()
  }, [value, edges])
  useEffect(() => {
    // ширина вариантов меняется вместе со шрифтом и счётчиками внутри
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      edges()
      const a = el.querySelector<HTMLElement>('[aria-selected="true"]')
      if (a) setPill((p) => (p && p.x === a.offsetLeft && p.w === a.offsetWidth ? p : { x: a.offsetLeft, w: a.offsetWidth, animate: false }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [edges])
  const mask = edge.l || edge.r ? `linear-gradient(to right, ${edge.l ? 'transparent, #000 28px' : '#000'}, ${edge.r ? '#000 calc(100% - 28px), transparent' : '#000'})` : undefined
  return (
    <div
      ref={box}
      onScroll={edges}
      className={cx('no-scrollbar relative inline-flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-full bg-surface', lg ? 'p-1.5' : 'p-1', className)}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      role="tablist"
    >
      {pill && (
        <span
          aria-hidden
          className={cx('absolute left-0 rounded-full bg-ink', lg ? 'top-1.5 h-11' : 'top-1 h-8', pill.animate && 'transition-[transform,width] duration-450 ease-[var(--ease-out)]')}
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition-colors duration-200',
            lg ? 'h-11 flex-1 px-5 text-[15px]' : 'h-8 px-3.5 text-[13px]',
            value === o.id ? cx('text-white', !pill && 'bg-ink') : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Яркий момент: лаймовая полоса, остаток — штриховка */
export function Progress({ value, max, over, className }: { value: number; max: number; over?: boolean; className?: string }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cx('hatch h-4 overflow-hidden rounded-full', className)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('grow h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]', over ? 'bg-bad' : 'bar-lime')} style={{ width: `${p}%` }} />
    </div>
  )
}

/**
 * Enter в поле сохраняет форму: нажимает кнопку сохранения в той же модалке или панели.
 * В многострочном поле Enter — перенос строки, сохраняет Cmd/Ctrl+Enter.
 */
export function submitOnEnter(e: React.KeyboardEvent, scope: HTMLElement | null, selector: string) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing || e.shiftKey || e.altKey) return
  const t = e.target as HTMLElement
  const field = t instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit', 'reset'].includes(t.type)
  const area = t instanceof HTMLTextAreaElement && (e.metaKey || e.ctrlKey)
  if (!field && !area) return
  const buttons = scope?.querySelectorAll<HTMLButtonElement>(selector)
  const btn = buttons && [...buttons].reverse().find((b) => !b.disabled)
  if (!btn) return
  e.preventDefault()
  btn.click()
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const footerRef = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // пока окно уходит, показываем его последнее содержимое: данные формы к этому времени уже сброшены
  const { mounted, leaving } = usePresence(open, 220)
  useScrollLock(open)
  const kb = useKeyboardInset(open && isPhone())
  const last = useRef({ title, children, footer })
  if (open) last.current = { title, children, footer }
  const v = open ? { title, children, footer } : last.current
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // окно поверх окна (новый клиент внутри новой сделки): Esc закрывает только верхнее
      const all = document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]')
      if (all.length && all[all.length - 1] !== box.current) return
      onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!mounted) return null
  return createPortal(
    <div
      className={cx('fade fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 md:items-start md:overflow-y-auto md:p-6 md:pt-[8vh]', leaving && 'leaving pointer-events-none')}
      style={kb ? { paddingBottom: kb } : undefined}
      onMouseDown={leaving ? undefined : onClose}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal={leaving ? undefined : 'true'}
        aria-label={v.title}
        className={cx('sheet safe-bottom flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-surface md:max-h-none md:rounded-card', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}
        style={kb ? { maxHeight: `calc(92dvh - ${kb}px)` } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => submitOnEnter(e, footerRef.current, 'button[data-variant="primary"], button[data-save]')}
      >
        <div className="flex items-center justify-between py-3 pr-3 pl-6">
          <h2 className="text-lg">{v.title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X className="size-[18px]" strokeWidth={1.5} />
          </IconButton>
        </div>
        <div className="overscroll-contain overflow-y-auto px-6 pb-6 md:overflow-visible">{v.children}</div>
        {/* на телефоне кнопки окна — во всю ширину, по ним легко попасть большим пальцем */}
        {v.footer && <div ref={footerRef} className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 max-md:[&>*]:flex-1">{v.footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

const DrawerCtx = createContext<{ close: () => void; dismiss: () => void } | null>(null)
/**
 * Закрыть панель изнутри с анимацией ухода.
 * close — спросит про несохранённые правки; dismiss — без вопроса (например, после удаления)
 */
export const useDrawer = () => useContext(DrawerCtx)

/** Крестик в шапке панели: закрывает её так же, как фон, Esc и «Назад» */
export function DrawerClose({ className, iconClass = 'size-[18px]' }: { className?: string; iconClass?: string }) {
  const d = useDrawer()
  return (
    <IconButton label="Закрыть" onClick={() => d?.close()} className={className}>
      <X className={iconClass} strokeWidth={1.5} />
    </IconButton>
  )
}

/** Боковая панель; на телефоне — экран целиком с кнопкой «Назад» */
export function Drawer({ onClose, children, label, beforeClose }: { onClose: () => void; children: ReactNode; label: string; beforeClose?: () => Promise<boolean> | boolean }) {
  const [leaving, setLeaving] = useState(false)
  useScrollLock(true)
  // панель уезжает вправо, и только потом её убирают со страницы
  const dismiss = useCallback(() => {
    if (reducedMotion()) return onClose()
    setLeaving(true)
    setTimeout(onClose, 260)
  }, [onClose])
  // beforeClose спрашивает, можно ли закрыть: например, когда есть несохранённые правки
  const close = useCallback(async () => {
    if (beforeClose && !(await beforeClose())) return
    dismiss()
  }, [beforeClose, dismiss])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog][aria-modal=true]')) close()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [close])
  return createPortal(
    <DrawerCtx.Provider value={{ close, dismiss }}>
      <div className={cx('fixed inset-0 z-50', leaving && 'leaving pointer-events-none')}>
        <div className="fade absolute inset-0 hidden bg-ink/25 md:block" onClick={close} />
        <aside role="complementary" aria-label={label} onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')} className="slide absolute inset-0 flex flex-col overflow-y-auto overscroll-contain bg-canvas md:inset-y-3 md:right-3 md:left-auto md:w-[720px] md:rounded-card md:shadow-[0_8px_24px_rgba(21,23,28,0.1)]">
          {/* «Назад» всегда под рукой: панель на телефоне длинная */}
          <button onClick={close} className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1 bg-canvas/90 px-3 text-muted backdrop-blur md:hidden">
            <ChevronLeft className="size-5" strokeWidth={1.5} />
            Назад
          </button>
          {children}
        </aside>
      </div>
    </DrawerCtx.Provider>,
    document.body,
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-3 select-none">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-ink/15 transition-colors duration-200 peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40 after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-200 peer-checked:after:translate-x-4" />
      {label}
    </label>
  )
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const n = name || '?'
  // помним, какая именно ссылка не загрузилась: новая ссылка снова пробует показать фото
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src)
    return <img src={src} alt={n} title={n} onError={() => setBroken(src)} className={cx('inline-block size-8 shrink-0 rounded-full bg-ink/8 object-cover', className)} />
  return (
    <span className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/8 text-xs font-medium text-ink', className)} title={n}>
      {n
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('')}
    </span>
  )
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; n: number } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(
    () =>
      onToast((text) => {
        setMsg((m) => ({ text, n: (m?.n ?? 0) + 1 }))
        setOpen(true)
      }),
    [],
  )
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), 3200)
    return () => clearTimeout(t)
  }, [open, msg?.n])
  const { mounted, leaving } = usePresence(open, 220)
  if (!mounted || !msg) return null
  return createPortal(
    // w-max: ширина по тексту, но не шире экрана. Иначе у left-1/2 остаётся половина экрана и длинный текст сжимается в столбик
    <div role="status" className="fixed bottom-24 left-1/2 z-[80] w-max max-w-[min(calc(100vw-32px),420px)] -translate-x-1/2 md:bottom-6">
      {/* новое сообщение заново въезжает, даже если старое ещё на экране.
          Скругление 22px: одна строка - капсула, несколько - аккуратная плашка, а не круг */}
      <div key={msg.n} className={cx('rise rounded-[22px] bg-ink px-5 py-3 text-sm leading-snug text-white shadow-[0_8px_24px_rgba(21,23,28,0.18)]', leaving && 'leaving')}>
        {msg.text}
      </div>
    </div>,
    document.body,
  )
}

/** Таблица в карточке: общий вид для всех списков */
export function Table({ head, children, min, enter }: { head: ReactNode; children: ReactNode; min?: number; enter?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table
        className="rows w-full text-left text-[13px] [&_td]:px-2.5 [&_td]:py-2.5 [&_td.num]:whitespace-nowrap [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-2.5 [&_th]:pt-1 [&_th]:pb-2 [&_th]:font-normal [&_th]:whitespace-nowrap [&_th:first-child]:pl-5 [&_th:last-child]:pr-5"
        style={{ minWidth: min }}
      >
        <thead className="text-faint">{head}</thead>
        <tbody className={enter ? 'stagger' : undefined}>{children}</tbody>
      </table>
    </div>
  )
}

export function PlatformTag({ short, label, className }: { short: string; label: string; className?: string }) {
  return (
    <span className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-soft text-[10px] font-medium text-muted', className)} title={label}>
      {short}
    </span>
  )
}

/**
 * Комментарий: Enter — отправить, Shift+Enter — новая строка.
 * На телефоне Shift+Enter не набрать, поэтому там Enter — перенос строки, а отправляет кнопка
 */
export function sendOnEnter(e: React.KeyboardEvent): boolean {
  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return false
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return false
  e.preventDefault()
  return true
}

/**
 * Фильтры списка. На компьютере стоят в строку как есть.
 * На телефоне вместо стопки разных по ширине списков — одна кнопка «Фильтры» с числом включённых,
 * а сами списки открываются панелью снизу во всю ширину.
 */
export function Filters({ active, onReset, children }: { active: number; onReset?: () => void; children: ReactNode }) {
  const phone = useIsPhone()
  const [open, setOpen] = useState(false)
  if (!phone) return <>{children}</>
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-[background-color,color,transform] duration-200 active:scale-[0.97]',
          active ? 'bg-ink text-white' : 'bg-surface text-ink',
        )}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.5} />
        Фильтры
        {active > 0 && <span className="num -mr-1 flex size-5 items-center justify-center rounded-full bg-white/20 text-xs">{active}</span>}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Фильтры"
        footer={
          <>
            {active > 0 && onReset && (
              <Button variant="ghost" onClick={onReset}>
                Сбросить
              </Button>
            )}
            <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>
              Готово
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 [&>*]:w-full!">{children}</div>
      </Modal>
    </>
  )
}
