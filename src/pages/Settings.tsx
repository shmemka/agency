import { useState, type ReactNode } from 'react'
import { siteUrl, supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { parseNumber, plural } from '../lib/format'
import type { Settings as SettingsRow } from '../lib/types'
import { toast } from '../lib/toast'
import { confirmDialog } from '../components/dialogs'
import { Button, Card, Field, Input, Loading, PageHeader, Skel, submitOnEnter } from '../components/ui'
import { PLAN, UpgradeButton, WorkspaceTile } from '../components/Workspace'

/**
 * Настройки текущего кабинета. Открываются из меню профиля.
 * Видят все участники; менять название, деньги и тариф могут учредители, покинуть кабинет - любой
 */
export function Settings() {
  const { workspace, isAdmin } = useAuth()
  const { settings } = useData()
  if (!workspace) return null
  return (
    <>
      <PageHeader title="Настройки кабинета" sub={isAdmin ? 'Общие для всей команды кабинета' : 'Настройки кабинета меняют учредители'} />
      <div className="grid max-w-2xl gap-3">
        <GeneralCard />
        {isAdmin &&
          (settings ? (
            <MoneyCard s={settings} />
          ) : (
            <Loading className="rounded-card bg-surface p-6">
              <Skel className="h-4 w-32" />
              <div className="mt-5 grid gap-x-4 gap-y-6 sm:grid-cols-2">
                {[0, 1, 2, 3].map((r) => (
                  <div key={r}>
                    <Skel className="h-3 w-32" />
                    <Skel className="mt-2.5 h-10 w-full rounded-2xl" />
                  </div>
                ))}
              </div>
            </Loading>
          ))}
        {isAdmin && (
          <Section title="Тариф" sub="Тариф действует для всей команды кабинета">
            <div className="flex items-center justify-between gap-3 rounded-inner bg-soft py-2.5 pr-2.5 pl-4">
              <span>{PLAN}</span>
              <UpgradeButton size="md" />
            </div>
          </Section>
        )}
        <LeaveCard />
      </div>
    </>
  )
}

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-base">{title}</h2>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

/** Название и плитка кабинета. Название видно всем участникам и клиентам на подборках и отчётах */
function GeneralCard() {
  const { workspace, isAdmin, team, reloadProfile } = useAuth()
  const [name, setName] = useState(workspace?.name ?? '')
  const [saving, setSaving] = useState(false)
  if (!workspace) return null
  const members = team.filter((t) => t.is_active).length
  const dirty = name.trim() !== workspace.name

  async function save() {
    if (!name.trim()) return toast('Укажите название агентства')
    setSaving(true)
    const { error } = await supabase.from('workspaces').update({ name: name.trim() }).eq('id', workspace!.id)
    setSaving(false)
    if (error) return toast(error.message)
    await reloadProfile()
    toast('Название сохранено')
  }

  return (
    <Section title="Кабинет">
      <div className="flex items-center gap-3">
        <WorkspaceTile id={workspace.id} name={name.trim() || workspace.name} className="size-12 rounded-2xl text-base" />
        <div className="min-w-0">
          <div className="truncate text-[15px]">{name.trim() || workspace.name}</div>
          <div className="text-[13px] text-muted">
            {members} {plural(members, 'участник', 'участника', 'участников')}
          </div>
        </div>
      </div>
      {isAdmin && (
        <div className="mt-5" onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
          <Field label="Название агентства" hint="В кабинете и на подборках и отчётах для клиентов">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="primary" data-save loading={saving} disabled={!dirty} onClick={save} className="mt-4">
            Сохранить
          </Button>
        </div>
      )}
    </Section>
  )
}

/** Наценка, сроки ОРД и налоги: на них опираются кампании, напоминания и раздел «Финансы» */
function MoneyCard({ s }: { s: SettingsRow }) {
  const { reload } = useData()
  const { workspace } = useAuth()
  const [d, setD] = useState(s)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(d) !== JSON.stringify(s)
  const num = (k: keyof SettingsRow, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input inputMode="numeric" className="num" value={d[k]} onChange={(e) => setD({ ...d, [k]: parseNumber(e.target.value) ?? 0 })} />
    </Field>
  )
  return (
    <Section title="Деньги и ОРД" sub="Наценка для новых кампаний, сроки сдачи статистики и налоги для раздела «Финансы»">
      <div className="grid gap-4 sm:grid-cols-2" onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
        {num('default_markup_pct', 'Наценка по умолчанию, %', 'Подставляется в новые кампании')}
        {num('ord_deadline_days', 'Срок сдачи статистики в ОРД, дней', 'После конца месяца первого показа')}
        {num('tax_org_pct', 'Налог с оплат организаций и ИП, %')}
        {num('tax_person_pct', 'Налог с оплат физлиц, %')}
        {num('income_limit', 'Годовой лимит дохода, ₽', 'Для самозанятого 2 400 000 ₽')}
      </div>
      <p className="mt-4 text-[13px] text-muted">При переходе на ИП с УСН поставьте обе ставки 6% и увеличьте лимит</p>
      <Button
        variant="primary"
        data-save
        className="mt-4"
        disabled={!dirty}
        loading={saving}
        onClick={async () => {
          if (!workspace) return
          setSaving(true)
          const { error } = await supabase
            .from('settings')
            .update({ default_markup_pct: d.default_markup_pct, ord_deadline_days: d.ord_deadline_days, tax_org_pct: d.tax_org_pct, tax_person_pct: d.tax_person_pct, income_limit: d.income_limit })
            .eq('workspace_id', workspace.id)
          setSaving(false)
          if (error) return toast(error.message)
          await reload('settings')
          toast('Настройки сохранены')
        }}
      >
        Сохранить
      </Button>
    </Section>
  )
}

/** Выйти из кабинета самому: например, из агентства, с которым закончили работать */
function LeaveCard() {
  const { workspace, workspaces, team, profile, isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!workspace || !profile) return null
  const other = workspaces.find((w) => w.id !== workspace.id && w.is_active)
  // кабинет не должен остаться без учредителя
  const lastAdmin = isAdmin && !team.some((m) => m.id !== profile.id && m.role === 'admin' && m.is_active)
  return (
    <Section title="Покинуть кабинет">
      {lastAdmin ? (
        <p className="text-muted">Вы единственный учредитель, поэтому покинуть кабинет нельзя. Чтобы уйти, сначала назначьте учредителем кого-то из команды</p>
      ) : (
        <>
          <p className="mb-4 text-muted">
            {other ? `После выхода откроется «${other.name}».` : 'Это ваш единственный кабинет: после выхода можно будет создать свой или войти в команду по ссылке.'} Блогеры, задачи и документы останутся в кабинете
          </p>
          <Button
            variant="danger"
            className="bg-bad/8"
            loading={busy}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Покинуть «${workspace.name}»?`,
                body: 'Вернуться можно будет только по новой ссылке-приглашению от учредителя',
                ok: 'Покинуть',
                danger: true,
              })
              if (!ok) return
              setBusy(true)
              const { error } = await supabase.rpc('leave_workspace')
              setBusy(false)
              if (error) return toast(error.message)
              window.location.replace(siteUrl())
            }}
          >
            Покинуть кабинет
          </Button>
        </>
      )}
    </Section>
  )
}
