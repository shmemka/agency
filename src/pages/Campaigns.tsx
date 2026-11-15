import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { campaignStatusLabel } from '../lib/constants'
import { isLive } from '../lib/rules'
import { dateRange, plural } from '../lib/format'
import type { Campaign, Client } from '../lib/types'
import { Button, Chip, Empty, Loading, PageHeader, Progress, Skel, Table, cx, useEntrance } from '../components/ui'
import { CampaignModal, ClientModal } from '../components/CampaignForm'
import { NO_CLIENT } from '../components/IntegrationBoard'

export function Campaigns() {
  const { campaigns, clients, integrations, loading } = useData()
  const entering = useEntrance(!loading)
  const { isAdmin, personName } = useAuth()
  const nav = useNavigate()
  const [editC, setEditC] = useState<Partial<Campaign> | null>(null)
  const [editClient, setEditClient] = useState<Partial<Client> | null>(null)
  // работа без клиента тоже живёт здесь: отдельной карточкой рядом с кампаниями
  const direct = integrations.filter((i) => !i.campaign_id && i.status !== 'declined')
  const directLive = direct.filter(isLive).length

  return (
    <>
      <PageHeader
        title="Кампании"
        sub={isAdmin ? 'Заказы клиентов: подборка, согласование, выходы и отчёт' : 'Кампании, в которых вы работаете'}
        actions={
          isAdmin && (
            <>
              <Button onClick={() => setEditClient({})}>
                <Building2 className="size-4" strokeWidth={1.5} />
                Новый клиент
              </Button>
              <Button variant="primary" onClick={() => setEditC({})}>
                <Plus className="size-4" strokeWidth={1.5} />
                Новая кампания
              </Button>
            </>
          )
        }
      />
      {loading ? (
        <Loading className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="rounded-card bg-surface p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Skel className="h-3 w-24" />
                  <Skel className="mt-2.5 h-4.5" style={{ width: ['58%', '44%', '66%', '50%'][r] }} />
                </div>
                <Skel className="h-7 w-20" />
              </div>
              <Skel className="mt-5 h-4 w-full" />
              <div className="mt-3 flex gap-4">
                <Skel className="h-3 w-24" />
                <Skel className="h-3 w-20" />
              </div>
            </div>
          ))}
        </Loading>
      ) : campaigns.length === 0 && direct.length === 0 ? (
        <Empty title="Кампаний пока нет">{isAdmin ? 'Кампания собирает подборку блогеров под заказ клиента, его согласование и отчёт' : 'Учредитель добавит вас в кампанию, и она появится здесь'}</Empty>
      ) : (
        <div className={cx('grid grid-cols-1 gap-3 lg:grid-cols-2', entering && 'stagger')}>
          {campaigns.map((c) => {
            const mine = integrations.filter((i) => i.campaign_id === c.id && i.status !== 'declined')
            const approved = mine.filter((i) => i.client_decision === 'approved')
            const live = approved.filter(isLive).length
            const waiting = mine.filter((i) => i.client_decision === 'pending').length
            return (
              <Link key={c.id} to={`/campaigns/${c.id}`} className="min-w-0 rounded-card bg-surface p-5 transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(21,23,28,0.07)] active:translate-y-0 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-muted">{clients.find((x) => x.id === c.client_id)?.name ?? 'Клиент не указан'}</div>
                    <h2 className="mt-0.5 truncate text-lg">{c.name}</h2>
                  </div>
                  <Chip tone={c.status === 'active' ? 'dark' : undefined}>{campaignStatusLabel(c.status)}</Chip>
                </div>
                <Progress className="mt-5" value={live} max={approved.length} />
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                  <span className="num text-ink">
                    Вышло {live} из {approved.length}
                  </span>
                  {waiting > 0 && (
                    <span>
                      {waiting} {plural(waiting, 'ждёт', 'ждут', 'ждут')} решения клиента
                    </span>
                  )}
                  {(c.start_date || c.end_date) && (
                    <span className="num">{dateRange(c.start_date, c.end_date)}</span>
                  )}
                  {c.owner_id && <span>{personName(c.owner_id).split(' ')[0]}</span>}
                  {isAdmin && c.status === 'active' && !c.prepaid && <span className="text-bad">нет предоплаты</span>}
                </div>
              </Link>
            )
          })}
          {direct.length > 0 && (
            <Link to="/integrations?campaign=none" className="min-w-0 rounded-card bg-surface/60 p-5 ring-1 ring-line ring-inset transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-surface active:translate-y-0 sm:p-6">
              <div className="text-[13px] text-muted">Прямые договорённости с блогерами</div>
              <h2 className="mt-0.5 truncate text-lg">{NO_CLIENT}</h2>
              <Progress className="mt-5" value={directLive} max={direct.length} />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                <span className="num text-ink">
                  Вышло {directLive} из {direct.length}
                </span>
                <span>открываются на доске «Выходы»</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {clients.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg">Клиенты</h2>
          <Table
            min={640}
            head={
              <tr>
                <th>Компания</th>
                <th>Контактное лицо</th>
                <th>Контакт</th>
                <th>Ниша</th>
                <th className="text-right">Кампаний</th>
              </tr>
            }
          >
            {clients.map((cl) => (
              <tr key={cl.id} onClick={() => isAdmin && setEditClient(cl)} className={isAdmin ? 'cursor-pointer hover:bg-soft' : undefined}>
                <td className="font-medium">{cl.name}</td>
                <td>{cl.contact_name ?? '—'}</td>
                <td className="text-muted">{cl.contact ?? '—'}</td>
                <td className="text-muted">{cl.niche ?? '—'}</td>
                <td className="num text-right">{campaigns.filter((c) => c.client_id === cl.id).length}</td>
              </tr>
            ))}
          </Table>
        </section>
      )}
      <CampaignModal value={editC} onClose={() => setEditC(null)} onSaved={(id) => nav(`/campaigns/${id}`)} />
      <ClientModal value={editClient} onClose={() => setEditClient(null)} />
    </>
  )
}
