import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { nextStatus, phaseInfo, statusInfo } from '../lib/constants'
import type { NextStep } from '../lib/rules'
import type { Integration } from '../lib/types'
import { Button, cx } from './ui'
import { BloggerName, useIntegrationPanel } from './bits'
import { NO_DEAL } from './IntegrationBoard'

const TONE = { warn: 'text-warn', bad: 'text-bad' }

/**
 * Строка списка дел: блогер, сделка, шаг и что сейчас сделать. Кнопка справа переводит на следующий шаг,
 * клик по строке открывает карточку интеграции - там точный шаг, документы, erid и деньги.
 * dealLink - адрес панели сделки; без него сделка в строке не показывается (внутри самой сделки)
 */
export function WorkRow({ i, step, dealLink }: { i: Integration; step: NextStep | null; dealLink?: (id: string) => string }) {
  const { blogger, campaign, moveIntegration } = useData()
  const { open } = useIntegrationPanel()
  const st = statusInfo(i.status)
  const next = step ? nextStatus(i.status) : null
  const c = campaign(i.campaign_id)
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => open(i.id)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open(i.id)}
      className={cx('flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 transition-colors duration-150 first:border-t-0 hover:bg-soft md:min-h-14 md:flex-nowrap md:py-2', !step && 'text-muted')}
    >
      <span className="min-w-0 flex-1 md:w-52 md:flex-none">
        <BloggerName b={blogger(i.blogger_id)} />
      </span>
      {/* на телефоне сделка и шаг - второй строкой под блогером */}
      <span className="order-3 flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] md:order-none md:contents md:text-sm">
        {dealLink &&
          (c ? (
            <Link to={dealLink(c.id)} onClick={(e) => e.stopPropagation()} className="w-full min-w-0 truncate text-muted transition-colors duration-150 hover:text-ink md:w-44 md:flex-none">
              {c.name}
            </Link>
          ) : (
            <span className="w-full text-faint md:w-44 md:flex-none">{NO_DEAL}</span>
          ))}
        <span className="flex min-w-0 items-baseline gap-2 md:flex-1 md:items-center">
          <span className={cx('size-2 shrink-0 rounded-full max-md:translate-y-[-1px]', phaseInfo(st.phase).dot)} />
          <span className="min-w-0 md:truncate">
            {st.label}
            {step && <span className={cx(step.tone ? TONE[step.tone] : 'text-muted')}> - {step.text}</span>}
          </span>
        </span>
      </span>
      {next && (
        <Button
          size="sm"
          className="order-2 md:order-none"
          title={`Перевести на шаг «${statusInfo(next).label}»`}
          onClick={(e) => {
            e.stopPropagation()
            moveIntegration(i, next)
          }}
        >
          {statusInfo(next).label}
          <ArrowRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      )}
    </li>
  )
}
