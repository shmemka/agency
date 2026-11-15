import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bell, Building2, Check, CircleArrowUp, Coins, LayoutGrid, ListTodo, LogOut, Palette, Pipette, Upload, Users, type LucideIcon } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchAll, siteUrl, supabase } from '../lib/supabase'
import { AVATAR_BUCKET, avatarPath } from '../lib/avatars'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { parseNumber, plural } from '../lib/format'
import type { Settings as SettingsRow } from '../lib/types'
import { toast } from '../lib/toast'
import { confirmDialog } from '../components/dialogs'
import { Avatar, Button, Card, Field, Input, Loading, Modal, PageHeader, Segmented, Skel, cx, submitOnEnter } from '../components/ui'
import { PLAN, UpgradeButton, WorkspaceTile } from '../components/Workspace'
import { BrandLogo, Mark } from '../components/Layout'
import { BRAND_PRESETS, DEFAULT_BRAND, LOGO_BUCKET, applyBrand, logoPath, normalizeHex, onBrand, prepareLogo, removeLogo, uploadLogo, type PreparedLogo } from '../lib/brand'

type SectionId = 'general' | 'brand' | 'money' | 'danger'

/** Разделы настроек: у каждого свой адрес, /settings/brand и т. п. Учредитель видит все, специалист - общее и выход */
const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; admin?: boolean }[] = [
  { id: 'general', label: 'Общее', icon: Building2 },
  { id: 'brand', label: 'Оформление', icon: Palette, admin: true },
  { id: 'money', label: 'Деньги и ОРД', icon: Coins, admin: true },
  { id: 'danger', label: 'Выход и удаление', icon: LogOut },
]

/**
 * Настройки текущего кабинета. Открываются из меню профиля.
 * Слева разделы (на телефоне - переключатель сверху), справа - один выбранный раздел
 */
export function Settings() {
  const { workspace, isAdmin } = useAuth()
  const { settings } = useData()
  const { section } = useParams()
  const navigate = useNavigate()
  const list = SECTIONS.filter((x) => !x.admin || isAdmin)
  const cur = list.find((x) => x.id === section) ?? list[0]
  if (!workspace) return null
  const go = (id: SectionId) => navigate(id === 'general' ? '/settings' : `/settings/${id}`, { replace: true })
  return (
    <>
      <PageHeader title="Настройки кабинета" sub={isAdmin ? undefined : 'Менять настройки могут учредители'} />
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,42rem)] lg:items-start lg:gap-8">
        <nav aria-label="Разделы настроек" className="sticky top-8 hidden space-y-0.5 lg:block">
          {list.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-current={x.id === cur.id ? 'page' : undefined}
              onClick={() => go(x.id)}
              className={cx('flex h-9 w-full items-center gap-2.5 rounded-full px-3 text-left transition-colors duration-150', x.id === cur.id ? 'bg-surface text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink')}
            >
              <x.icon className="size-4" strokeWidth={1.5} />
              {x.label}
            </button>
          ))}
        </nav>
        <Segmented className="mb-4 max-w-full lg:hidden" value={cur.id} options={list.map((x) => ({ id: x.id, label: x.label }))} onChange={go} />
        <div key={cur.id} className="fade grid min-w-0 grid-cols-1 gap-3">
          {cur.id === 'general' && <Passport />}
          {cur.id === 'brand' && <BrandSection />}
          {cur.id === 'money' &&
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
          {cur.id === 'danger' && <DangerCard />}
        </div>
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

type LogoDraft = { kind: 'keep' } | { kind: 'none' } | { kind: 'new'; logo: PreparedLogo; name: string }

/**
 * Логотип и брендовый цвет. Всё, что выбрано, сразу видно в предпросмотре, а сохраняется одной кнопкой.
 * Логотип подгоняется сам: поля по краям обрезаются, рисунок вписывается в место в меню
 */
function BrandSection() {
  const { workspace, reloadProfile } = useAuth()
  const saved = workspace?.brand_color || DEFAULT_BRAND
  const savedLogo = workspace?.logo_url || null
  const [color, setColor] = useState(saved)
  const [hex, setHex] = useState<string | null>(null)
  const [draft, setDraft] = useState<LogoDraft>({ kind: 'keep' })
  const [reading, setReading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [saving, setSaving] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  // выбранный цвет сразу виден на всём сайте; без сохранения вернётся прежний
  useEffect(() => {
    applyBrand(color)
    return () => applyBrand(saved)
  }, [color, saved])
  // предпросмотр нового файла живёт в памяти браузера - освобождаем, когда он больше не нужен
  useEffect(() => () => void (draft.kind === 'new' && URL.revokeObjectURL(draft.logo.url)), [draft])

  if (!workspace) return null
  const logo = draft.kind === 'new' ? draft.logo.url : draft.kind === 'none' ? null : savedLogo
  const dirty = color !== saved || draft.kind !== 'keep'
  const custom = !BRAND_PRESETS.some((p) => p.hex === color)
  const migrate = (m: string) => (/logo_url|brand_color|schema cache/i.test(m) ? 'Нужно запустить миграцию 019_workspace_brand.sql в Supabase' : m)

  async function pick(f: File | undefined) {
    if (!f) return
    setReading(true)
    try {
      setDraft({ kind: 'new', logo: await prepareLogo(f), name: f.name })
    } catch (e) {
      toast((e as Error).message)
    }
    setReading(false)
  }

  async function save() {
    setSaving(true)
    let uploaded: string | null = null
    try {
      if (draft.kind === 'new') uploaded = await uploadLogo(workspace!.id, draft.logo)
      const logo_url = draft.kind === 'keep' ? savedLogo : uploaded
      const { error } = await supabase
        .from('workspaces')
        .update({ logo_url, brand_color: color === DEFAULT_BRAND ? null : color })
        .eq('id', workspace!.id)
      if (error) throw new Error(migrate(error.message))
      if (draft.kind !== 'keep') await removeLogo(savedLogo)
      await reloadProfile()
      setDraft({ kind: 'keep' })
      toast('Оформление сохранено')
    } catch (e) {
      if (uploaded) await removeLogo(uploaded)
      toast((e as Error).message)
    }
    setSaving(false)
  }

  function reset() {
    setColor(saved)
    setHex(null)
    setDraft({ kind: 'keep' })
  }

  const note =
    draft.kind === 'new'
      ? `${draft.name}${draft.logo.trimmed ? ' - пустые поля обрезаны' : ''}`
      : draft.kind === 'none'
        ? 'В меню вернутся значок и название агентства'
        : 'SVG или PNG на прозрачном фоне. Файл можно перетащить на предпросмотр выше'
  const swatch = 'relative flex size-9 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(21_23_28/0.08)] transition-transform duration-150 active:scale-90'
  const picked = 'ring-2 ring-ink ring-offset-2 ring-offset-surface'

  return (
    <Card>
      {/* предпросмотр: кусок меню и карточка с акцентами - в выбранных логотипе и цвете */}
      <div
        className={cx('relative overflow-hidden rounded-inner bg-canvas p-4 transition-shadow duration-150', drag && 'shadow-[inset_0_0_0_2px_var(--color-ink)]')}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          pick(e.dataTransfer.files?.[0])
        }}
      >
        <div className="flex gap-4" aria-hidden>
          <div className="w-52 shrink-0">
            <div className="flex items-center gap-1.5 px-2">
              {/* пунктир - место логотипа в меню */}
              <div className="flex h-8 w-36 min-w-0 items-center rounded-[6px] outline-1 outline-offset-2 outline-ink/20 outline-dashed">
                {logo ? (
                  <BrandLogo key={logo} src={logo} name={workspace.name} className="appear" />
                ) : (
                  <>
                    <Mark />
                    <span className="truncate pl-2.5 text-[15px] leading-5 font-medium">{workspace.name}</span>
                  </>
                )}
              </div>
              <span className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                <Bell className="size-[18px]" strokeWidth={1.5} />
              </span>
            </div>
            <div className="mt-5 space-y-0.5">
              {[
                [LayoutGrid, 'Обзор'],
                [Users, 'Блогеры'],
                [ListTodo, 'Задачи'],
              ].map(([Icon, label], i) => {
                const I = Icon as LucideIcon
                return (
                  <div key={i} className={cx('flex h-9 items-center gap-2.5 rounded-full px-3', i === 0 ? 'bg-surface' : 'text-muted')}>
                    <I className="size-[18px]" strokeWidth={1.5} />
                    {label as string}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 rounded-[20px] bg-surface p-4 sm:block">
            <div className="text-xs text-muted">Кампания</div>
            <div className="truncate text-[15px]">Весенний запуск</div>
            <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-ink/6">
              <span className="bar-lime w-[62%] rounded-full" />
            </div>
            <div className="num mt-1.5 flex justify-between text-xs text-faint">
              <span>5 из 8 интеграций</span>
              <span>62 %</span>
            </div>
            <div className="mt-4">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-lime px-3 text-[13px] font-medium text-lime-ink">
                <CircleArrowUp className="size-3.5" strokeWidth={1.5} />
                Улучшить
              </span>
            </div>
          </div>
        </div>
        {drag && (
          <div className="fade absolute inset-0 flex items-center justify-center bg-canvas/85 text-sm">
            Отпустите, чтобы поставить логотип
          </div>
        )}
      </div>

      <section className="mt-5 border-t border-line pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Логотип</h3>
            <p className="mt-1 text-[13px] break-words text-muted">{note}</p>
            {draft.kind === 'new' && draft.logo.warnings.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-[13px] text-warn">
                {draft.logo.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button loading={reading} disabled={saving} onClick={() => file.current?.click()}>
              {!reading && <Upload className="size-4" strokeWidth={1.5} />}
              {logo ? 'Заменить' : 'Загрузить'}
            </Button>
            {logo && (
              <Button variant="ghost" disabled={saving || reading} onClick={() => setDraft(savedLogo ? { kind: 'none' } : { kind: 'keep' })}>
                Убрать
              </Button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept=".svg,.png,image/svg+xml,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              pick(f)
            }}
          />
        </div>
      </section>

      <Group title="Цвет" sub="Заменяет зелёный в кнопках, полосах прогресса и отметках">
        <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Цвет">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              role="radio"
              aria-checked={color === p.hex}
              title={p.label}
              onClick={() => {
                setColor(p.hex)
                setHex(null)
              }}
              className={cx(swatch, color === p.hex && picked)}
              style={{ background: p.hex, color: onBrand(p.hex) }}
            >
              {color === p.hex && <Check className="size-4" strokeWidth={2} />}
            </button>
          ))}
          {/* свой цвет: системная палитра или код из брендбука */}
          <label title="Свой цвет" className={cx(swatch, 'cursor-pointer', custom ? picked : 'bg-soft text-muted hover:text-ink')} style={custom ? { background: color, color: onBrand(color) } : undefined}>
            {custom ? <Check className="size-4" strokeWidth={2} /> : <Pipette className="size-4" strokeWidth={1.5} />}
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value)
                setHex(null)
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Свой цвет"
            />
          </label>
          <span onKeyDown={(e) => submitOnEnter(e, e.currentTarget.closest('[data-brand]'), 'button[data-save]')}>
            <Input
              aria-label="Код цвета"
              className="num h-9 w-28!"
              value={hex ?? color}
              maxLength={7}
              spellCheck={false}
              onChange={(e) => {
                setHex(e.target.value)
                const v = normalizeHex(e.target.value)
                if (v && e.target.value.replace('#', '').length === 6) setColor(v)
              }}
              onBlur={() => setHex(null)}
            />
          </span>
        </div>
      </Group>
      <div data-brand>
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={reset} />
      </div>
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
    <section className="mt-5 border-t border-line pt-5 first:mt-0 first:border-t-0 first:pt-0">
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
      <div>
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
        [LOGO_BUCKET, [logoPath(workspace.logo_url)].filter((p): p is string => Boolean(p))],
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
