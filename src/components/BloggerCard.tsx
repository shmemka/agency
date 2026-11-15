import { Check, Plus } from 'lucide-react'
import { bloggerStatusInfo, platformInfo } from '../lib/constants'
import { count, money, plural } from '../lib/format'
import type { Blogger } from '../lib/types'
import { cx } from './ui'

/*
 * Карточка блогера в сетке на экране «Блогеры» (решение владельца, по референсу).
 * С фото: снимок на всю карточку, к низу он размывается в собственный цвет, и на этом фоне белый текст.
 * Без фото: почти незаметный градиент, свой оттенок у каждого ника, и крупные буквы ника.
 * Карточка - «контейнер»: в узкой (две колонки на телефоне) остаются ник, охват и цена
 */

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const letters = (nick: string) => nick.replace(/^@/, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'

export function BloggerCard({
  b,
  busy,
  picked,
  picking,
  onOpen,
  onPick,
  onDeal,
}: {
  b: Blogger
  /** в каких сделках сейчас в работе, первая и сколько ещё */
  busy?: { first: string; more: number }
  picked: boolean
  /** что-то уже отмечено: галочки видны на всех карточках */
  picking: boolean
  onOpen: () => void
  onPick: (shift: boolean) => void
  onDeal?: () => void
}) {
  const photo = b.avatar_url
  const p = platformInfo(b.platform)
  const st = bloggerStatusInfo(b.status)
  const black = b.status === 'blacklist'
  const hue = hash(b.nick) % 360
  const sub = [b.topic, b.name, b.age && `${b.age} ${plural(b.age, 'год', 'года', 'лет')}`].filter(Boolean).join(', ')
  // плашки поверх фото - «стеклянные», без фото - обычные светлые
  const chip = cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs', photo ? 'bg-white/20 text-white backdrop-blur-md' : 'bg-ink/6 text-muted')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
      className={cx(
        '@container group relative isolate aspect-[3/4] cursor-pointer overflow-hidden rounded-card bg-surface transition-[transform,box-shadow] duration-200 select-none active:scale-[0.99]',
        picked && 'ring-2 ring-ink ring-offset-2 ring-offset-canvas',
        black && 'grayscale',
      )}
    >
      {photo ? (
        <>
          <img src={photo} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
          {/* тот же снимок, сильно размытый, проявляется к низу: фон под текстом - цвет самой фотографии */}
          <img src={photo} alt="" aria-hidden loading="lazy" className="absolute inset-0 -z-10 size-full scale-125 object-cover blur-2xl [mask-image:linear-gradient(to_bottom,transparent_38%,black_70%)]" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent_45%,rgb(0_0_0/0.32))]" />
        </>
      ) : (
        <>
          <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `linear-gradient(165deg, var(--color-surface) 35%, hsl(${hue} 60% 94%))` }} />
          <span aria-hidden className="absolute inset-x-0 top-[24%] -z-10 text-center text-[clamp(40px,32cqw,88px)] leading-none font-medium tracking-tight" style={{ color: `hsl(${hue} 30% 50% / 0.14)` }}>
            {letters(b.nick)}
          </span>
        </>
      )}

      {/* верх: площадка и отметки; галочка для массовых действий справа */}
      <div className="absolute inset-x-0 top-0 flex items-start gap-1.5 p-3">
        <span className={cx(chip, 'font-medium')} title={p.label}>
          {p.short}
        </span>
        {b.status !== 'in_base' && (
          <span className={cx(chip, '@max-[239px]:hidden')}>
            {!black && <span className={cx('size-1.5 rounded-full', st.dot)} />}
            {st.label}
          </span>
        )}
        <button
          type="button"
          role="checkbox"
          aria-checked={picked}
          aria-label={`Выбрать ${b.nick}`}
          title="Shift+клик выделяет всех между двумя отмеченными"
          onMouseDown={(e) => e.shiftKey && e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onPick(e.shiftKey)
          }}
          className={cx(
            'ml-auto flex size-7 shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-150 max-md:hidden',
            picked ? 'bg-ink text-white opacity-100' : photo ? 'bg-white/25 text-transparent backdrop-blur-md hover:bg-white/40' : 'bg-ink/6 text-transparent hover:bg-ink/12',
            !picked && !picking && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Check className="size-4" strokeWidth={2} />
        </button>
      </div>

      {/* низ: кто это и сколько стоит; «В сделку» - рядом с ником, как главное действие карточки */}
      <div className={cx('absolute inset-x-0 bottom-0 p-3 @min-[240px]:p-4', photo ? 'text-white' : 'text-ink')}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base leading-6 font-medium @min-[240px]:text-lg">{b.nick}</div>
            {busy ? (
              <div className={cx('truncate text-[13px]', photo ? 'text-white/85' : 'text-ink')} title={busy.more ? `ещё ${busy.more}` : undefined}>
                в работе: {busy.first}
                {busy.more > 0 && <span className="num opacity-70"> +{busy.more}</span>}
              </div>
            ) : (
              sub && <div className={cx('truncate text-[13px] @max-[200px]:hidden', photo ? 'text-white/75' : 'text-muted')}>{sub}</div>
            )}
          </div>
          {onDeal && !black && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDeal()
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-medium text-ink shadow-[0_2px_8px_rgb(21_23_28/0.12)] transition-[background-color,transform] duration-150 hover:bg-white/90 active:scale-[0.97] @max-[259px]:hidden"
            >
              <Plus className="size-3.5" strokeWidth={1.5} />В сделку
            </button>
          )}
        </div>
        <dl className="num mt-2.5 flex gap-4 text-[13px] leading-4 whitespace-nowrap @min-[240px]:mt-3">
          <div className="@max-[239px]:hidden">
            <dt className={cx('text-[11px]', photo ? 'text-white/70' : 'text-muted')}>подписчики</dt>
            <dd className="mt-1">{count(b.followers)}</dd>
          </div>
          <div>
            <dt className={cx('text-[11px]', photo ? 'text-white/70' : 'text-muted')}>охват</dt>
            <dd className="mt-1">{count(b.avg_reach)}</dd>
          </div>
          <div>
            <dt className={cx('text-[11px]', photo ? 'text-white/70' : 'text-muted')}>цена</dt>
            <dd className="mt-1">{money(b.price)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
