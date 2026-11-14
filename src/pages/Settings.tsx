import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { parseNumber } from '../lib/format'
import type { Settings as SettingsRow } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Field, Input, Loading, PageHeader, Skel, cx, submitOnEnter } from '../components/ui'

export function Settings() {
  const { settings } = useData()
  const { isAdmin } = useAuth()
  return (
    <>
      <PageHeader title="Настройки" sub={isAdmin ? 'Общие для всего кабинета агентства' : 'Настройки агентства меняют учредители'} />
      {isAdmin && (settings ? (
        <SettingsCard s={settings} />
      ) : (
        <Loading className="max-w-2xl rounded-card bg-surface p-6">
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
            {[0, 1, 2, 3, 4].map((r) => (
              <div key={r} className={r === 0 ? 'sm:col-span-2' : undefined}>
                <Skel className="h-3 w-32" />
                <Skel className="mt-2.5 h-10 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        </Loading>
      ))}
    </>
  )
}

function SettingsCard({ s }: { s: SettingsRow }) {
  const { reload } = useData()
  const { workspace, reloadProfile } = useAuth()
  const [d, setD] = useState(s)
  // название — у самого кабинета: его видно в переключателе кабинетов у всех участников
  const [name, setName] = useState(workspace?.name ?? '')
  const dirty = JSON.stringify(d) !== JSON.stringify(s) || name.trim() !== workspace?.name
  const num = (k: keyof SettingsRow, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input inputMode="numeric" className="num" value={d[k]} onChange={(e) => setD({ ...d, [k]: parseNumber(e.target.value) ?? 0 })} />
    </Field>
  )
  return (
    <Card className={cx('max-w-2xl')} onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название агентства" hint="В кабинете и на подборках и отчётах для клиентов" className="sm:col-span-2">
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
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
        onClick={async () => {
          if (!name.trim()) return toast('Укажите название агентства')
          if (!workspace) return
          const [r1, r2] = await Promise.all([
            name.trim() !== workspace.name ? supabase.from('workspaces').update({ name: name.trim() }).eq('id', workspace.id) : null,
            supabase.from('settings').update({ default_markup_pct: d.default_markup_pct, ord_deadline_days: d.ord_deadline_days, tax_org_pct: d.tax_org_pct, tax_person_pct: d.tax_person_pct, income_limit: d.income_limit }).eq('workspace_id', workspace.id),
          ])
          const error = r1?.error ?? r2.error
          if (error) return toast(error.message)
          await Promise.all([reload('settings'), reloadProfile()])
          toast('Настройки сохранены')
        }}
      >
        Сохранить настройки
      </Button>
    </Card>
  )
}
