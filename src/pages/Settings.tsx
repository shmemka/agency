import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { parseNumber } from '../lib/format'
import type { Settings as SettingsRow } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, Field, Input, PageHeader, cx, submitOnEnter } from '../components/ui'

export function Settings() {
  const { settings } = useData()
  const { isAdmin } = useAuth()
  return (
    <>
      <PageHeader title="Настройки" sub={isAdmin ? 'Общие для всего агентства' : 'Настройки агентства меняют учредители'} />
      {isAdmin && settings && <SettingsCard s={settings} />}
    </>
  )
}

function SettingsCard({ s }: { s: SettingsRow }) {
  const { reload } = useData()
  const [d, setD] = useState(s)
  const dirty = JSON.stringify(d) !== JSON.stringify(s)
  const num = (k: Exclude<keyof SettingsRow, 'agency_name'>, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input inputMode="numeric" className="num" value={d[k]} onChange={(e) => setD({ ...d, [k]: parseNumber(e.target.value) ?? 0 })} />
    </Field>
  )
  return (
    <Card className={cx('max-w-2xl')} onKeyDown={(e) => submitOnEnter(e, e.currentTarget, 'button[data-save]')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название агентства" hint="В кабинете, на подборках и в предложениях блогерам" className="sm:col-span-2">
          <Input value={d.agency_name} onChange={(e) => setD({ ...d, agency_name: e.target.value })} />
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
          if (!d.agency_name.trim()) return toast('Укажите название агентства')
          const { error } = await supabase.from('settings').update({ agency_name: d.agency_name.trim(), default_markup_pct: d.default_markup_pct, ord_deadline_days: d.ord_deadline_days, tax_org_pct: d.tax_org_pct, tax_person_pct: d.tax_person_pct, income_limit: d.income_limit }).eq('id', true)
          if (error) return toast(error.message)
          await reload('settings')
          toast('Настройки сохранены')
        }}
      >
        Сохранить настройки
      </Button>
    </Card>
  )
}
