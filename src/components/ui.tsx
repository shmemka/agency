import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { PHASES, STATUSES, phaseInfo, statusInfo, type Status } from '../lib/constants'

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-dark',
        variant === 'secondary' && 'bg-surface text-ink ring-1 ring-line hover:bg-base',
        variant === 'ghost' && 'text-muted hover:bg-base hover:text-ink',
        variant === 'danger' && 'text-rose-700 hover:bg-rose-50',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

const fieldBase =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-night focus:outline-none focus:ring-2 focus:ring-night/10'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, 'h-9', props.className)} />
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, 'py-2 leading-relaxed', props.className)} />
}
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cx(fieldBase, 'h-9 appearance-none pr-8', props.className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-faint" />
    </div>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-faint', className)} />
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = statusInfo(status)
  const p = phaseInfo(s.phase)
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset', p.chip, className)}>
      <span className={cx('size-1.5 rounded-full', p.dot)} />
      {s.label}
    </span>
  )
}

/** Компактный выпадающий выбор статуса — для строк таблицы */
export function StatusSelect({ value, onChange, className }: { value: Status; onChange: (s: Status) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('scroll', () => setOpen(false), { once: true, capture: true })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx('group inline-flex items-center gap-0.5 rounded-md', className)}
        onClick={(e) => {
          e.stopPropagation()
          const r = btn.current!.getBoundingClientRect()
          const top = Math.min(r.bottom + 4, window.innerHeight - 440)
          setPos({ top: Math.max(8, top), left: Math.min(r.left, window.innerWidth - 220) })
          setOpen((o) => !o)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <StatusBadge status={value} />
        <ChevronDown className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      {open &&
        createPortal(
          <div
            role="listbox"
            className="fade-in fixed z-50 w-52 rounded-xl bg-surface p-1.5 shadow-xl ring-1 ring-line"
            style={pos}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {PHASES.map((ph) => (
              <div key={ph.id} className="py-0.5">
                {STATUSES.filter((s) => s.phase === ph.id).map((s) => (
                  <button
                    key={s.id}
                    role="option"
                    aria-selected={s.id === value}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-base"
                    onClick={() => {
                      setOpen(false)
                      if (s.id !== value) onChange(s.id)
                    }}
                  >
                    <span className={cx('size-2 rounded-full', ph.dot)} />
                    <span className="flex-1">{s.label}</span>
                    {s.id === value && <Check className="size-3.5 text-accent" />}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

/** Дорожка этапов — главный элемент карточки блогера */
export function StatusRail({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const current = statusInfo(value)
  const flow = PHASES.filter((p) => p.id !== 'stop')
  const flowStatuses = STATUSES.filter((s) => s.phase !== 'stop')
  const curIdx = flowStatuses.findIndex((s) => s.id === value)
  const stopped = current.phase === 'stop'

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-1.5 gap-y-3 sm:grid-cols-5 sm:gap-y-1.5">
        {flow.map((ph) => {
          const items = STATUSES.filter((s) => s.phase === ph.id)
          return (
            <div key={ph.id} className="min-w-0">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <span className={cx('size-1.5 rounded-full', ph.dot)} />
                {ph.label}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((s) => {
                  const idx = flowStatuses.findIndex((x) => x.id === s.id)
                  const isCur = s.id === value
                  const passed = !stopped && curIdx > -1 && idx < curIdx
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onChange(s.id)}
                      aria-pressed={isCur}
                      className={cx(
                        'truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        isCur ? cx(ph.solid, 'font-medium shadow-sm') : passed ? 'bg-night/[0.07] text-ink hover:bg-night/[0.12]' : 'bg-base text-muted hover:bg-line hover:text-ink',
                      )}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {STATUSES.filter((s) => s.phase === 'stop').map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            aria-pressed={s.id === value}
            className={cx(
              'rounded-md px-2 py-1 text-xs transition-colors',
              s.id === value ? 'bg-rose-600 font-medium text-white' : 'text-muted hover:bg-rose-50 hover:text-rose-700',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-night/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('w-full rounded-2xl bg-surface shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button className="rounded-md p-1 text-faint hover:bg-base hover:text-ink" onClick={onClose} aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog][aria-modal=true]')) onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="fade-in absolute inset-0 bg-night/25" onClick={onClose} />
      <aside role="complementary" aria-label={label} className="drawer-in absolute top-0 right-0 flex h-full w-full max-w-[720px] flex-col overflow-y-auto bg-surface shadow-2xl sm:overflow-hidden">
        {children}
      </aside>
    </div>,
    document.body,
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-night peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      {label}
    </label>
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const n = name || '?'
  const hue = [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span
      className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white', className)}
      style={{ background: `oklch(0.55 0.12 ${hue})` }}
      title={n}
    >
      {n
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('')}
    </span>
  )
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [message, onDone])
  if (!message) return null
  return createPortal(
    <div role="status" className="fade-in fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-night px-4 py-2.5 text-sm text-white shadow-xl">
      {message}
    </div>,
    document.body,
  )
}
