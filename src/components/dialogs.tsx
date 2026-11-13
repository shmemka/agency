import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, Input, Textarea } from './ui'

/** Фирменные замены window.confirm и window.prompt: возвращают Promise */

type ConfirmOpts = {
  title: string
  body?: ReactNode
  /** Пункты списка под текстом, например предупреждения */
  items?: string[]
  ok?: string
  cancel?: string
  danger?: boolean
}
type PromptOpts = {
  title: string
  body?: ReactNode
  label?: string
  value?: string
  placeholder?: string
  ok?: string
  required?: boolean
  multiline?: boolean
  readOnly?: boolean
}
type Req = ({ kind: 'confirm' } & ConfirmOpts) | ({ kind: 'prompt' } & PromptOpts)
type Pending = Req & { resolve: (v: unknown) => void }

let push: ((r: Pending) => void) | null = null

function open<T>(r: Req): Promise<T> {
  return new Promise<T>((resolve) => {
    if (!push) return resolve((r.kind === 'confirm' ? false : null) as T)
    push({ ...r, resolve: resolve as (v: unknown) => void })
  })
}

export function confirmDialog(o: ConfirmOpts) {
  return open<boolean>({ kind: 'confirm', ...o })
}
export function promptDialog(o: PromptOpts) {
  return open<string | null>({ kind: 'prompt', ...o })
}

export function DialogHost() {
  const [queue, setQueue] = useState<Pending[]>([])
  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r])
    return () => {
      push = null
    }
  }, [])
  const cur = queue[0]
  if (!cur) return null
  const done = (v: unknown) => {
    cur.resolve(v)
    setQueue((q) => q.slice(1))
  }
  return <Dialog key={queue.length + cur.title} req={cur} done={done} />
}

function Dialog({ req, done }: { req: Pending; done: (v: unknown) => void }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? (req.value ?? '') : '')
  const [touched, setTouched] = useState(false)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const okBtn = useRef<HTMLButtonElement>(null)
  const cancelValue = req.kind === 'confirm' ? false : null
  const missing = req.kind === 'prompt' && req.required && !value.trim()

  function submit() {
    if (req.kind === 'confirm') return done(true)
    if (req.readOnly) return done(value)
    if (missing) return setTouched(true)
    done(value.trim())
  }

  useEffect(() => {
    if (req.kind === 'prompt') {
      field.current?.focus()
      if (req.readOnly || req.value) field.current?.select()
    } else okBtn.current?.focus()
    // Escape закрывает только диалог, а не модалку под ним
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      done(cancelValue)
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const danger = req.kind === 'confirm' && req.danger
  return createPortal(
    <div className="fade fixed inset-0 z-[90] flex items-end justify-center bg-ink/30 p-0 md:items-center md:p-6" onMouseDown={() => done(cancelValue)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
        className="sheet safe-bottom w-full rounded-t-[28px] bg-surface md:max-w-md md:rounded-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="px-6 pt-6 pb-5">
            <h2 className="text-lg leading-6">{req.title}</h2>
            {req.body && <div className="mt-2 text-muted">{req.body}</div>}
            {req.kind === 'confirm' && req.items && req.items.length > 0 && (
              <ul className="mt-3 space-y-1.5 rounded-inner p-4 text-[13px] ring-1 ring-ink/10 ring-inset">
                {req.items.map((w) => (
                  <li key={w} className="flex gap-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warn" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            {req.kind === 'prompt' && (
              <label className="mt-4 block">
                {req.label && <span className="mb-1.5 block text-[13px] text-muted">{req.label}</span>}
                {req.multiline ? (
                  <Textarea ref={field} rows={3} value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} readOnly={req.readOnly} />
                ) : (
                  <Input ref={field} value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} readOnly={req.readOnly} />
                )}
                {touched && missing && <span className="mt-1.5 block text-[13px] text-bad">Без этого не сохранить</span>}
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
            {!(req.kind === 'prompt' && req.readOnly) && (
              <Button type="button" variant="ghost" onClick={() => done(cancelValue)}>
                {(req.kind === 'confirm' && req.cancel) || 'Отмена'}
              </Button>
            )}
            <Button ref={okBtn} type="submit" variant="primary" className={danger ? 'bg-bad hover:bg-bad/90' : undefined}>
              {req.ok || (req.kind === 'prompt' && req.readOnly ? 'Готово' : 'Сохранить')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

/** Закрыть без сохранения? true — можно закрывать */
export const confirmDiscard = () =>
  confirmDialog({ title: 'Закрыть без сохранения?', body: 'Изменения, которые вы не сохранили, пропадут', ok: 'Закрыть', cancel: 'Остаться', danger: true })
