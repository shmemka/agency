import { useEffect, useState } from 'react'
import { Check, CircleArrowUp, Sparkles } from 'lucide-react'
import { Button, Modal, cx } from './ui'

/*
 * Общее для кабинетов: цветная плитка с буквами и тариф.
 * Плитка одного кабинета везде одного цвета: в меню, в списке переключения и в настройках
 */

const TILE = ['bg-lime/50 text-ink', 'bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-teal-100 text-teal-800', 'bg-rose-100 text-rose-800']

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

export function WorkspaceTile({ id, name, className, muted, src }: { id: string; name: string; className?: string; muted?: boolean; src?: string | null }) {
  // своя аватарка кабинета вместо букв; у закрытого кабинета - приглушённая
  if (src) return <img src={src} alt="" aria-hidden className={cx('size-8 shrink-0 rounded-[10px] object-cover', muted && 'opacity-50 grayscale', className)} />
  return (
    <span aria-hidden className={cx('flex size-8 shrink-0 items-center justify-center rounded-[10px] text-xs font-medium', muted ? 'bg-ink/6 text-faint' : TILE[hash(id) % TILE.length], className)}>
      {initials(name)}
    </span>
  )
}

/** Тариф кабинета. Пока у всех бесплатный: платных тарифов ещё нет */
export const PLAN = 'Бесплатный'

// окно тарифов живёт на уровне приложения (PlanHost в main.tsx): кнопка стоит и в меню профиля,
// а меню закрывается, когда курсор уходит к окну, - вместе с ним пропало бы и окно
const PLAN_EVENT = 'app:plan'
export const openPlan = () => window.dispatchEvent(new Event(PLAN_EVENT))

export function PlanHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(PLAN_EVENT, on)
    return () => window.removeEventListener(PLAN_EVENT, on)
  }, [])
  return <PlanModal open={open} onClose={() => setOpen(false)} />
}

/** «Улучшить план»: открывает окно с тарифами */
/** size: sm - маленькая, md - обычная, fill - во всю ширину рядом с кнопкой «Настройки» в меню профиля */
export function UpgradeButton({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' | 'fill' }) {
  return (
    <>
      <button
        type="button"
        onClick={openPlan}
        className={cx(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-lime font-medium text-lime-ink transition-[filter,transform] duration-200 hover:brightness-95 active:scale-[0.97]',
          size === 'sm' ? 'h-7 px-2.5 text-xs' : size === 'fill' ? 'h-8 w-full justify-center text-[13px]' : 'h-10 px-4 text-sm',
          className,
        )}
      >
        <CircleArrowUp className={size === 'md' ? 'size-4' : 'size-3.5'} strokeWidth={1.5} />
        Улучшить
      </button>
    </>
  )
}

function PlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Тариф кабинета">
      <div className="rounded-inner bg-soft p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base">{PLAN}</span>
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted">сейчас</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-[13px] text-muted">
          {['Все разделы: блогеры, кампании, задачи, финансы', 'Команда без ограничений', 'Страницы и отчёты для клиентов'].map((t) => (
            <li key={t} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-leaf" strokeWidth={2} />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 rounded-inner p-4 ring-1 ring-line">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" strokeWidth={1.5} />
          <span className="text-base">Платные тарифы</span>
        </div>
        <p className="mt-1.5 text-[13px] text-muted">Появятся позже, вместе с новыми возможностями для больших команд. Сейчас всё доступно бесплатно, а о тарифах предупредим заранее</p>
      </div>
      <Button variant="primary" className="mt-4 w-full" onClick={onClose}>
        Понятно
      </Button>
    </Modal>
  )
}
