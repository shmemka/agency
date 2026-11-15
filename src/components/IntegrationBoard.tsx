import { useState } from 'react'
import { useData } from '../lib/data'
import { PHASES, STATUSES, STATUS_ORDER, statusInfo, type Phase } from '../lib/constants'
import { date, money } from '../lib/format'
import type { Integration } from '../lib/types'
import { cx } from './ui'
import { useIntegrationPanel } from './bits'

/** Подпись на карточке для интеграций, заведённых раньше без сделки. Новые без сделки не создаются */
export const NO_DEAL = 'Без сделки'

const byDate = (a: Integration, b: Integration) => (a.publish_date ?? '9999').localeCompare(b.publish_date ?? '9999') || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]

/**
 * Доска интеграций по этапам: Поиск → Переговоры → Документы → Оплата → Выход.
 * Карточку можно перетащить в другой этап (встанет на первый шаг этапа) или открыть и выбрать точный шаг.
 * На телефоне этапы листаются вбок, шаг меняется в карточке интеграции.
 * Та же доска - во вкладке сделки и на экране «Работа» во вкладке «Все», где на карточке видно и сделку
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

  const where = (i: Integration) => (i.campaign_id ? (campaign(i.campaign_id)?.name ?? '') : NO_DEAL)

  return (
    <>
      {/* на телефоне доска та же: этапы листаются вбок и встают ровно по краю экрана */}
      <div className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:snap-none md:px-6">
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
                className={cx('flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-inner p-2 transition-colors duration-200 md:w-auto md:max-w-none md:min-w-52 md:flex-1 md:shrink', over === p.id ? 'dropzone is-over' : items.length ? 'bg-ink/[0.04]' : 'dropzone')}
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

    </>
  )
}
