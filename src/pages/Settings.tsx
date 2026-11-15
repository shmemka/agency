import { useState, type ReactNode } from 'react'
import { fetchAll, siteUrl, supabase } from '../lib/supabase'
import { AVATAR_BUCKET, avatarPath } from '../lib/avatars'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { parseNumber, plural } from '../lib/format'
import type { Settings as SettingsRow } from '../lib/types'
import { toast } from '../lib/toast'
import { confirmDialog } from '../components/dialogs'
import { Button, Card, Field, Input, Loading, Modal, PageHeader, Skel, submitOnEnter } from '../components/ui'
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
        <DangerCard />
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

/**
 * Необратимое - отдельной карточкой в самом низу: покинуть кабинет (любой участник)
 * и удалить его со всеми данными (учредитель)
 */
function DangerCard() {
  const { isAdmin } = useAuth()
  return (
    <Card>
      <h2 className="text-base">Покинуть или удалить</h2>
      <LeaveRow />
      {isAdmin && (
        <>
          <div className="my-5 h-px bg-line" />
          <DeleteRow />
        </>
      )}
    </Card>
  )
}

/** Выйти из кабинета самому: например, из агентства, с которым закончили работать */
function LeaveRow() {
  const { workspace, workspaces, team, profile, isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!workspace || !profile) return null
  const other = workspaces.find((w) => w.id !== workspace.id && w.is_active)
  // кабинет не должен остаться без учредителя
  const lastAdmin = isAdmin && !team.some((m) => m.id !== profile.id && m.role === 'admin' && m.is_active)
  return (
    <div className="mt-4">
      <h3 className="text-[15px]">Покинуть кабинет</h3>
      {lastAdmin ? (
        <p className="mt-1 text-[13px] text-muted">Вы единственный учредитель, поэтому покинуть кабинет нельзя. Назначьте учредителем кого-то из команды или удалите кабинет</p>
      ) : (
        <>
          <p className="mt-1 mb-3 text-[13px] text-muted">
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
    </div>
  )
}

const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`

/** Удалить кабинет со всеми данными и файлами. Подтверждение - название кабинета, набранное вручную */
function DeleteRow() {
  const { workspace, workspaces, team } = useAuth()
  const d = useData()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [step, setStep] = useState<string | null>(null)
  if (!workspace) return null
  const match = typed.trim() === workspace.name
  const other = workspaces.find((w) => w.id !== workspace.id && w.is_active)
  const people = team.filter((t) => t.is_active).length

  // что пропадёт - числами, чтобы было понятно, о каком объёме речь
  const lost = [
    count(d.bloggers.length, 'блогер', 'блогера', 'блогеров'),
    count(d.campaigns.length, 'кампания', 'кампании', 'кампаний'),
    count(d.integrations.length, 'интеграция', 'интеграции', 'интеграций'),
    count(d.tasks.length, 'задача', 'задачи', 'задач'),
    count(d.docs.length, 'документ', 'документа', 'документов'),
  ].join(', ')

  async function run() {
    if (!workspace || !match) return
    try {
      // 1. файлы: хранилище разрешает удалить файл, только пока в базе есть запись о нём
      setStep('Собираем файлы…')
      const paths = async (table: string, col: string) =>
        (
          await fetchAll<Record<string, string | null>>(
            (f, t) => supabase.from(table).select(col).not(col, 'is', null).range(f, t) as unknown as PromiseLike<{ data: Record<string, string | null>[] | null; error: { message: string } | null }>,
          )
        )
          .map((r) => r[col])
          .filter((x): x is string => Boolean(x))
      const groups: [string, string[]][] = [
        ['documents', await paths('documents', 'storage_path')],
        ['task-files', await paths('task_files', 'storage_path')],
        [AVATAR_BUCKET, (await paths('bloggers', 'avatar_url')).map(avatarPath).filter((p): p is string => Boolean(p?.startsWith('bloggers/')))],
      ]
      const total = groups.reduce((a, [, p]) => a + p.length, 0)
      let done = 0
      for (const [bucket, list] of groups) {
        for (let i = 0; i < list.length; i += 100) {
          const { error } = await supabase.storage.from(bucket).remove(list.slice(i, i + 100))
          if (error) throw new Error(`Не получилось удалить файлы, данные кабинета не тронуты. Попробуйте ещё раз. ${error.message}`)
          done += Math.min(100, list.length - i)
          setStep(`Удаляем файлы: ${done} из ${total}`)
        }
      }
      // 2. данные: кабинет и всё, что в нём, одной транзакцией в базе
      setStep('Удаляем данные…')
      const { error } = await supabase.rpc('delete_workspace', { p_ws: workspace.id, p_name: typed.trim() })
      if (error) throw new Error(/delete_workspace/.test(error.message) ? 'Сначала запустите миграцию 018_delete_workspace.sql в Supabase' : error.message)
      // откроется другой кабинет, а если их нет - экран «создать кабинет или войти по ссылке»
      window.location.replace(siteUrl())
    } catch (e) {
      setStep(null)
      toast((e as Error).message)
    }
  }

  return (
    <div>
      <h3 className="text-[15px]">Удалить кабинет</h3>
      <p className="mt-1 mb-3 text-[13px] text-muted">Навсегда удалит кабинет, все его данные и файлы. Команда потеряет к нему доступ. Отменить удаление нельзя</p>
      <Button variant="danger" className="bg-bad/8" onClick={() => setOpen(true)}>
        Удалить кабинет
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (step) return
          setOpen(false)
          setTyped('')
        }}
        title={`Удалить «${workspace.name}»?`}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={!!step}
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
            >
              Отмена
            </Button>
            <Button variant="primary" data-save className="bg-bad! hover:bg-bad/90!" disabled={!match} loading={!!step} onClick={run}>
              Удалить навсегда
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 rounded-inner bg-bad/6 p-4 text-[13px]">
          <li>Удалятся {lost}</li>
          <li>Вместе с ними - финансы, списки, комментарии, история и все загруженные файлы</li>
          <li>
            {count(people, 'участник', 'участника', 'участников')} {people === 1 ? 'потеряет' : 'потеряют'} доступ. Сами аккаунты останутся
          </li>
          <li>{other ? `После удаления откроется «${other.name}»` : 'Других кабинетов у вас нет: после удаления можно будет создать новый'}</li>
        </ul>
        <Field label={`Чтобы подтвердить, введите название кабинета: ${workspace.name}`} className="mt-4">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={workspace.name} autoComplete="off" disabled={!!step} />
        </Field>
        {step && <p className="mt-3 text-[13px] text-muted">{step}</p>}
      </Modal>
    </div>
  )
}
