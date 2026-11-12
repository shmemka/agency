import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/data'
import { addDays, todayISO } from '../lib/format'
import type { Task } from '../lib/types'
import { Card, PageHeader, Segmented } from '../components/ui'
import { TaskList } from '../components/bits'

export function Tasks() {
  const { tasks } = useData()
  const { profile, isAdmin } = useAuth()
  const [who, setWho] = useState<'mine' | 'all' | 'given'>('mine')
  const [done, setDone] = useState(false)
  const today = todayISO()
  const week = addDays(today, 7)

  const list = tasks.filter((t) => (who === 'mine' ? t.assignee_id === profile?.id : who === 'given' ? t.created_by === profile?.id && t.assignee_id !== profile?.id : true))
  const open = list.filter((t) => !t.done_at).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  const groups: [string, Task[]][] = [
    ['Просрочено', open.filter((t) => t.due_date && t.due_date < today)],
    ['Сегодня', open.filter((t) => t.due_date === today)],
    ['На неделе', open.filter((t) => t.due_date && t.due_date > today && t.due_date <= week)],
    ['Позже', open.filter((t) => t.due_date && t.due_date > week)],
    ['Без срока', open.filter((t) => !t.due_date)],
  ]
  const closed = list.filter((t) => t.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!))

  return (
    <>
      <PageHeader title="Задачи" sub={open.length ? `Открыто: ${open.length}` : 'Открытых задач нет'} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          value={who}
          onChange={setWho}
          options={[
            { id: 'mine', label: 'Мои' },
            { id: 'given', label: 'Я поставил' },
            ...(isAdmin ? [{ id: 'all' as const, label: 'Все' }] : []),
          ]}
        />
        <Segmented value={done ? 'done' : 'open'} onChange={(v) => setDone(v === 'done')} options={[{ id: 'open', label: 'В работе' }, { id: 'done', label: `Готовые ${closed.length}` }]} />
      </div>
      <div className="max-w-3xl space-y-3">
        {done ? (
          <Card>
            <TaskList tasks={closed.slice(0, 100)} showDone noForm empty="Готовых задач пока нет" />
          </Card>
        ) : (
          <>
            <Card>
              <TaskList tasks={[]} />
            </Card>
            {groups
              .filter(([, g]) => g.length)
              .map(([name, g]) => (
                <Card key={name}>
                  <h2 className="mb-1 text-base">
                    {name} <span className="num text-muted">{g.length}</span>
                  </h2>
                  <TaskList tasks={g} noForm />
                </Card>
              ))}
          </>
        )}
      </div>
    </>
  )
}
