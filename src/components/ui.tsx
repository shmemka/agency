import { Children, isValidElement, useEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type ReactNode, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronLeft, Loader2, X } from 'lucide-react'
import { BLOGGER_STATUSES, PHASES, STATUSES, STATUS_ORDER, bloggerStatusInfo, nextStatus, phaseInfo, statusInfo, type BloggerStatus, type Status } from '../lib/constants'
import { onToast } from '../lib/toast'

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ')
}

export const isPhone = () => window.matchMedia('(max-width: 767px)').matches

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
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink/85',
        variant === 'secondary' && 'bg-surface text-ink ring-1 ring-line hover:bg-soft',
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
      className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink', className)}
    >
      {children}
    </button>
  )
}

const fieldBase = 'w-full rounded-2xl bg-soft px-4 text-sm text-ink placeholder:text-faint ring-1 ring-transparent transition-shadow duration-150 focus:bg-surface focus:outline-none focus:ring-ink/25'

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
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={cx(
          'flex h-10 w-full items-center gap-2 rounded-2xl pr-3 pl-4 text-left text-sm transition-[background-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
          tone === 'field' && 'bg-soft text-ink hover:bg-ink/[0.06] focus-visible:ring-ink/25',
          tone === 'surface' && 'bg-surface text-ink hover:bg-white/70 focus-visible:ring-ink/25',
          tone === 'dark' && 'bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white/50',
          open && tone !== 'dark' && 'ring-1 ring-ink/15',
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', !current?.text && !placeholder && 'text-faint', current?.value === '' && tone !== 'dark' && 'text-muted')}>{current?.label ?? placeholder ?? '—'}</span>
        <ChevronDown className={cx('size-4 shrink-0 transition-transform duration-150', tone === 'dark' ? 'text-white/70' : 'text-faint', open && 'rotate-180')} strokeWidth={1.5} />
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
              className={cx('fade fixed z-[70] flex flex-col overflow-hidden', POPOVER)}
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

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[13px] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
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
    <div className="rounded-card bg-surface px-6 py-12 text-center">
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
  options: { id: T; label: string; dot?: string; group?: string }[]
  onChange: (v: T) => void
  trigger: ReactNode
  title: string
  chevron?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const phone = isPhone()

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
        className={cx(ITEM, 'gap-1.5 hover:bg-soft', phone ? ITEM_PHONE : ITEM_DESKTOP)}
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
          setPos({ top: below >= h ? r.bottom + POPOVER_GAP : Math.max(8, r.top - POPOVER_GAP - h), left: Math.max(8, Math.min(r.left - 6, window.innerWidth - 232)) })
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
            <div role="listbox" className={cx('fade fixed z-[70] w-56', POPOVER)} style={pos} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
                        'h-8 truncate rounded-full px-3 text-left text-[13px] transition-colors duration-150',
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
          className={cx('mt-2 h-8 rounded-full px-3 text-[13px] transition-colors duration-150', stopped ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink')}
        >
          Отказ
        </button>
      </div>
    </div>
  )
}

/** Переключатель-пилюля: активное — чёрное */
export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150', value === o.id ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
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
      <div className={cx('h-full rounded-full', over ? 'bg-bad' : 'bar-lime')} style={{ width: `${p}%` }} />
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
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fade fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 md:items-start md:overflow-y-auto md:p-6 md:pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('sheet safe-bottom flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-surface md:max-h-none md:rounded-card', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => submitOnEnter(e, footerRef.current, 'button[data-variant="primary"], button[data-save]')}
      >
        <div className="flex items-center justify-between py-3 pr-3 pl-6">
          <h2 className="text-lg">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X className="size-[18px]" strokeWidth={1.5} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 pb-6 md:overflow-visible">{children}</div>
        {footer && <div ref={footerRef} className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Боковая панель; на телефоне — экран целиком с кнопкой «Назад» */
export function Drawer({ onClose, children, label, beforeClose }: { onClose: () => void; children: ReactNode; label: string; beforeClose?: () => Promise<boolean> | boolean }) {
  // beforeClose спрашивает, можно ли закрыть: например, когда есть несохранённые правки
  const close = useCallback(async () => {
    if (beforeClose && !(await beforeClose())) return
    onClose()
  }, [beforeClose, onClose])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog][aria-modal=true]')) close()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [close])
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="fade absolute inset-0 hidden bg-ink/25 md:block" onClick={close} />
      <aside role="complementary" aria-label={label} onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')} className="slide absolute inset-0 flex flex-col overflow-y-auto bg-canvas md:inset-y-3 md:right-3 md:left-auto md:w-[720px] md:rounded-card md:shadow-[0_8px_24px_rgba(21,23,28,0.1)]">
        <button onClick={close} className="flex h-12 shrink-0 items-center gap-1 px-3 text-muted md:hidden">
          <ChevronLeft className="size-5" strokeWidth={1.5} />
          Назад
        </button>
        {children}
      </aside>
    </div>,
    document.body,
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-3 select-none">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-ink/15 transition-colors duration-150 peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40 after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-150 peer-checked:after:translate-x-4" />
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
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => onToast(setMsg), [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3200)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  return createPortal(
    <div role="status" className="rise fixed bottom-24 left-1/2 z-[80] max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm text-white md:bottom-6">
      {msg}
    </div>,
    document.body,
  )
}

/** Таблица в карточке: общий вид для всех списков */
export function Table({ head, children, min }: { head: ReactNode; children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table
        className="rows w-full text-left text-[13px] [&_td]:px-2.5 [&_td]:py-2.5 [&_td.num]:whitespace-nowrap [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-2.5 [&_th]:pt-1 [&_th]:pb-2 [&_th]:font-normal [&_th]:whitespace-nowrap [&_th:first-child]:pl-5 [&_th:last-child]:pr-5"
        style={{ minWidth: min }}
      >
        <thead className="text-faint">{head}</thead>
        <tbody>{children}</tbody>
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
