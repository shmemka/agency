import { useState } from 'react'
import { useData } from '../lib/data'
import { PHASES, STATUSES, STATUS_ORDER, phaseInfo, statusInfo, type Phase } from '../lib/constants'
import { date, money } from '../lib/format'
import type { Integration } from '../lib/types'
import { StatusSelect, cx } from './ui'
import { BloggerName, useIntegrationPanel } from './bits'

/** Подпись кампании на карточке: интеграция без кампании - это работа «без клиента» */
export const NO_CLIENT = 'Без клиента'

const byDate = (a: Integration, b: Integration) => (a.publish_date ?? '9999').localeCompare(b.publish_date ?? '9999') || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]

/**
 * Доска интеграций по этапам: Поиск → Переговоры → Документы → Оплата → Выход.
 * Карточку можно перетащить в другой этап (встанет на первый шаг этапа) или открыть и выбрать точный шаг.
 * Та же доска - во вкладке кампании и на экране «Выходы», где на карточке видно и кампанию
 */
export function IntegrationBoard({ rows, showCampaign }: { rows: Integration[]; showCampaign?: boolean }) {
  const { blogger, campaign, moveIntegration } = useData()
  const { open } = useIntegrationPanel()
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Phase | null>(null)
  const cols = PHASES.filter((p) => p.id !== 'stop' || rows.some((i) => statusInfo(i.status).phase === 'stop'))
  const inPhase = (p: Phase) => rows.filter((i) => statusInfo(i.status).phase === p).sort(byDate)

  function drop(p: Phase) {
    const i = rows.find((x) => x.id === drag)
    setDrag(null)
    setOver(null)
    if (!i || statusInfo(i.status).phase === p) return
    const first = STATUSES.find((s) => s.phase === p)
    if (first) moveIntegration(i, first.id)
  }

  const where = (i: Integration) => (i.campaign_id ? (campaign(i.campaign_id)?.name ?? '') : NO_CLIENT)

  return (
    <>
      <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 md:-mx-6 md:block md:px-6">
        <div className="flex gap-2">
          {cols.map((p) => {
            const items = inPhase(p.id)
            return (
              <section
                key={p.id}
                aria-label={p.label}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(p.id)
                }}
                onDragLeave={() => setOver((o) => (o === p.id ? null : o))}
                onDrop={() => drop(p.id)}
                className={cx('flex min-w-52 flex-1 flex-col rounded-inner p-2 transition-colors duration-200', over === p.id ? 'dropzone is-over' : items.length ? 'bg-ink/[0.04]' : 'dropzone')}
              >
                <header className="flex h-8 items-center gap-2 px-2 text-[13px]">
                  <span className={cx('size-2 rounded-full', p.dot)} />
                  <span className="flex-1 truncate">{p.label}</span>
                  <span className="num text-muted">{items.length || ''}</span>
                </header>
                <div className="flex min-h-12 flex-col gap-1.5">
                  {items.map((i) => (
                    <button
                      key={i.id}
                      draggable
                      onDragStart={() => setDrag(i.id)}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => open(i.id)}
                      className={cx('rounded-2xl bg-surface p-3 text-left transition-opacity duration-150', drag === i.id && 'opacity-40', i.status === 'done' && 'text-muted')}
                    >
                      <span className="block truncate font-medium">{blogger(i.blogger_id)?.nick ?? 'блогер'}</span>
                      {showCampaign && <span className={cx('mt-0.5 block truncate text-xs', i.campaign_id ? 'text-muted' : 'text-faint')}>{where(i)}</span>}
                      <span className="mt-2 block text-xs">{statusInfo(i.status).label}</span>
                      <span className="num mt-0.5 flex justify-between gap-2 text-xs text-muted">
                        <span>{i.publish_date ? date(i.publish_date) : 'без даты'}</span>
                        <span>{money(i.price)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {/* телефон: те же этапы списком сверху вниз, шаг меняется прямо в строке */}
      <div className="space-y-5 md:hidden">
        {cols.map((p) => {
          const items = inPhase(p.id)
          if (!items.length) return null
          return (
            <section key={p.id} aria-label={p.label}>
              <h3 className="mb-2 flex items-center gap-2 px-1 text-[13px] text-muted">
                <span className={cx('size-2 rounded-full', phaseInfo(p.id).dot)} />
                {p.label}
                <span className="num">{items.length}</span>
              </h3>
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-inner bg-surface p-4">
                    <button className="min-w-0 flex-1 text-left" onClick={() => open(i.id)}>
                      <BloggerName b={blogger(i.blogger_id)} />
                      <span className="num mt-1 block truncate text-xs text-muted">
                        {[showCampaign && where(i), i.publish_date ? `выход ${date(i.publish_date)}` : '', i.price !== null && i.price !== undefined ? money(i.price) : ''].filter(Boolean).join(', ')}
                      </span>
                    </button>
                    <StatusSelect value={i.status} onChange={(s) => moveIntegration(i, s)} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
