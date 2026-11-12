import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { campaignStatusLabel } from '../lib/constants'
import { isLive } from '../lib/rules'
import { date, plural } from '../lib/format'
import type { Campaign, Client } from '../lib/types'
import { Button, Chip, Empty, PageHeader, Progress, Table } from '../components/ui'
import { CampaignModal, ClientModal } from '../components/CampaignForm'

export function Campaigns() {
  const { campaigns, clients, integrations } = useData()
  const { isAdmin, personName } = useAuth()
  const nav = useNavigate()
  const [editC, setEditC] = useState<Partial<Campaign> | null>(null)
  const [editClient, setEditClient] = useState<Partial<Client> | null>(null)

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
      {campaigns.length === 0 ? (
        <Empty title="Кампаний пока нет">{isAdmin ? 'Кампания собирает подборку блогеров под заказ клиента, его согласование и отчёт' : 'Учредитель добавит вас в кампанию, и она появится здесь'}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {campaigns.map((c) => {
            const mine = integrations.filter((i) => i.campaign_id === c.id && i.status !== 'declined')
            const approved = mine.filter((i) => i.client_decision === 'approved')
            const live = approved.filter(isLive).length
            const waiting = mine.filter((i) => i.client_decision === 'pending').length
            return (
              <Link key={c.id} to={`/campaigns/${c.id}`} className="min-w-0 rounded-card bg-surface p-5 transition-colors duration-150 hover:bg-white/60 sm:p-6">
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
                    <span className="num">
                      {date(c.start_date)} – {date(c.end_date)}
                    </span>
                  )}
                  {c.owner_id && <span>{personName(c.owner_id).split(' ')[0]}</span>}
                  {isAdmin && c.status === 'active' && !c.prepaid && <span className="text-bad">нет предоплаты</span>}
                </div>
              </Link>
            )
          })}
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
