import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fetchAll, siteUrl, supabase } from '../lib/supabase'
import { AVATAR_BUCKET, avatarPath } from '../lib/avatars'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { parseNumber, plural } from '../lib/format'
import type { Settings as SettingsRow } from '../lib/types'
import { toast } from '../lib/toast'
import { confirmDialog } from '../components/dialogs'
import { Avatar, Button, Card, Field, Input, Loading, Modal, PageHeader, Skel, submitOnEnter } from '../components/ui'
import { PLAN, UpgradeButton, WorkspaceTile } from '../components/Workspace'

/**
 * Настройки текущего кабинета. Открываются из меню профиля.
 * Видят все участники; менять название, деньги и тариф могут учредители, покинуть кабинет - любой.
 * Сверху «паспорт» кабинета, ниже деньги, в самом низу - необратимое
 */
export function Settings() {
  const { workspace, isAdmin } = useAuth()
  const { settings } = useData()
  if (!workspace) return null
  return (
    <>
      <PageHeader title="Настройки кабинета" sub={isAdmin ? undefined : 'Менять настройки могут учредители'} />
      <div className="grid max-w-2xl gap-3">
        <Passport />
        {isAdmin &&
          (settings ? (
            <MoneyCard s={settings} />
          ) : (
            <Loading className="rounded-card bg-surface p-6">
              <Skel className="h-4 w-32" />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[0, 1].map((r) => (
                  <div key={r}>
                    <Skel className="h-3 w-32" />
                    <Skel className="mt-2.5 h-10 w-full rounded-2xl" />
                  </div>
                ))}
              </div>
            </Loading>
          ))}
        <DangerCard />
      </div>
    </>
  )
}

/** Подсказка под полем: на этой странице она объясняет, на что влияет число, поэтому темнее обычной */
const hint = (t: ReactNode) => <span className="text-muted">{t}</span>

/** «Сохранить» и «Отменить» появляются, только когда есть что сохранять */
function SaveBar({ dirty, saving, onSave, onReset }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty && !saving) return null
  return (
    <div className="fade mt-4 flex gap-2">
      <Button variant="primary" data-save loading={saving} onClick={onSave}>
        Сохранить
      </Button>
      <Button variant="ghost" disabled={saving} onClick={onReset}>
        Отменить
      </Button>
    </div>
  )
}

/** Паспорт кабинета: плитка, название, команда и тариф. Название видно команде и клиентам на подборках и отчётах */
function Passport() {
  const { workspace, isAdmin, team, reloadProfile } = useAuth()
  const [name, setName] = useState(workspace?.name ?? '')
  const [saving, setSaving] = useState(false)
  if (!workspace) return null
  const people = team.filter((t) => t.is_active)
  const shown = name.trim() || workspace.name
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
    <Card>
      <div className="flex items-center gap-4">
        <WorkspaceTile id={workspace.id} name={shown} className="size-14 rounded-[18px] text-lg" />
        <div className="min-w-0">
          <h2 className="truncate text-xl leading-7">{shown}</h2>
          <Link to="/team" className="group mt-1 inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink">
            <span className="flex">
              {people.slice(0, 4).map((p) => (
                <Avatar key={p.id} name={p.full_name || p.email || ''} src={p.avatar_url} className="-ml-1.5 size-6 text-[10px] ring-2 ring-surface first:ml-0" />
              ))}
            </span>
            {people.length} {plural(people.length, 'участник', 'участника', 'участников')}
          </Link>
        </div>
      </div>

      <div className="mt-5 flex min-h-14 items-center justify-between gap-3 rounded-inner bg-soft py-2 pr-2 pl-4">
        <div>
          <div className="text-xs text-muted">Тариф</div>
          <div className="text-sm">{PLAN}</div>
        </div>
        {isAdmin && <UpgradeButton size="md" />}
      </div>

      {isAdmin && (
        <div className="mt-5" onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
          <Field label="Название агентства" hint={hint('Видно команде, а клиентам - на подборках и отчётах')}>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setName(workspace.name)} />
        </div>
      )}
    </Card>
  )
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/** Число с единицей прямо в поле: «30 %», «2 400 000 ₽». Пока поле в фокусе, формат не мешает печатать */
function NumberInput({ value, unit, onChange }: { value: number; unit: string; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <span className="relative block">
      <Input
        inputMode="decimal"
        className="num pr-12"
        value={text ?? nf.format(value)}
        onFocus={() => setText(nf.format(value))}
        onBlur={() => setText(null)}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseNumber(e.target.value) ?? 0)
        }}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-faint">
        {unit}
      </span>
    </span>
  )
}

type MoneyKey = 'default_markup_pct' | 'ord_deadline_days' | 'tax_org_pct' | 'tax_person_pct' | 'income_limit'

/** Наценка, сроки ОРД и налоги: на них опираются кампании, напоминания и раздел «Финансы» */
function MoneyCard({ s }: { s: SettingsRow }) {
  const { reload } = useData()
  const { workspace } = useAuth()
  const [d, setD] = useState(s)
  const [saving, setSaving] = useState(false)
  const keys: MoneyKey[] = ['default_markup_pct', 'ord_deadline_days', 'tax_org_pct', 'tax_person_pct', 'income_limit']
  const dirty = keys.some((k) => d[k] !== s[k])
  const num = (k: MoneyKey, label: string, unit: string, h?: string) => (
    <Field label={label} hint={h && hint(h)}>
      <NumberInput value={d[k]} unit={unit} onChange={(v) => setD({ ...d, [k]: v })} />
    </Field>
  )

  async function save() {
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
  }

  return (
    <Card>
      <h2 className="text-base">Деньги и ОРД</h2>
      <div onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
        <Group title="Кампании">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('default_markup_pct', 'Наценка по умолчанию', '%', 'Подставляется в новые кампании')}
            {num('ord_deadline_days', 'Срок сдачи статистики в ОРД', 'дн.', 'Считается от конца месяца первого показа')}
          </div>
        </Group>
        <Group title="Налоги" sub="Для раздела «Финансы». При переходе на ИП с УСН поставьте обе ставки 6 % и увеличьте лимит">
          <div className="grid gap-4 sm:grid-cols-3">
            {num('tax_org_pct', 'С оплат организаций и ИП', '%')}
            {num('tax_person_pct', 'С оплат физлиц', '%')}
            {num('income_limit', 'Лимит дохода в год', '₽', 'У самозанятого 2 400 000 ₽')}
          </div>
        </Group>
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setD(s)} />
      </div>
    </Card>
  )
}

/** Группа полей внутри карточки: тонкая линия сверху и короткий заголовок */
function Group({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-line pt-5 first:mt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-medium">{title}</h3>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Строка необратимого действия: что произойдёт - слева, кнопка - справа (на телефоне под текстом) */
function DangerRow({ title, text, children }: { title: string; text: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h3 className="text-[15px]">{title}</h3>
        <p className="mt-1 text-[13px] text-muted">{text}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
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
      <h2 className="text-base">Выход и удаление</h2>
      <div className="mt-5">
        <LeaveRow />
        {isAdmin && (
          <>
            <div className="my-5 h-px bg-line" />
            <DeleteRow />
          </>
        )}
      </div>
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
  if (lastAdmin)
    return (
      <DangerRow title="Покинуть кабинет" text="Вы единственный учредитель. Чтобы уйти, сначала назначьте учредителем кого-то из команды">
        <Link to="/team" className="inline-flex h-10 items-center rounded-full bg-soft px-4 text-sm font-medium transition-colors hover:bg-ink/8">
          Открыть команду
        </Link>
      </DangerRow>
    )
  return (
    <DangerRow
      title="Покинуть кабинет"
      text={other ? `Данные останутся в кабинете, а у вас откроется «${other.name}»` : 'Данные останутся в кабинете, а вы сможете создать свой или войти в другой по ссылке'}
    >
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
        Покинуть
      </Button>
    </DangerRow>
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
    <>
      <DangerRow title="Удалить кабинет" text="Все данные и файлы удалятся навсегда, команда потеряет доступ">
        <Button variant="danger" className="bg-bad/8" onClick={() => setOpen(true)}>
          Удалить
        </Button>
      </DangerRow>
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
    </>
  )
}
