import { supabase } from './supabase'

/*
 * Место в хранилище кабинета. На бесплатном тарифе - 1 ГБ.
 * Считает база (workspace_storage, миграция 022): документы, файлы задач, фото блогеров, логотип и аватарка
 */

export interface StorageUse {
  documents: number
  tasks: number
  bloggers: number
  brand: number
  total: number
  limit: number
}

export const STORAGE_PARTS: { id: keyof StorageUse; label: string }[] = [
  { id: 'documents', label: 'Документы' },
  { id: 'tasks', label: 'Файлы задач' },
  { id: 'bloggers', label: 'Фото блогеров' },
  { id: 'brand', label: 'Оформление' },
]

/** null - миграция 022 ещё не запущена или нет связи: тогда место просто не показываем */
export async function workspaceStorage(): Promise<StorageUse | null> {
  const { data, error } = await supabase.rpc('workspace_storage')
  if (error || !data) return null
  const d = data as Record<string, number | string>
  const n = (k: string) => Number(d[k] ?? 0)
  return { documents: n('documents'), tasks: n('tasks'), bloggers: n('bloggers'), brand: n('brand'), total: n('total'), limit: n('limit') || 1024 ** 3 }
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/** «0 Б», «512 КБ», «9,8 МБ», «1 ГБ» */
export function bytes(v: number) {
  if (v < 1024) return `${v} Б`
  if (v < 1024 ** 2) return `${nf.format(v / 1024)} КБ`
  if (v < 1024 ** 3) return `${nf.format(v / 1024 ** 2)} МБ`
  return `${nf.format(v / 1024 ** 3)} ГБ`
}

/** Проверка перед загрузкой: поместятся ли файлы. Текст ошибки или null. Без миграции не мешает загружать */
export async function checkQuota(size: number): Promise<string | null> {
  const s = await workspaceStorage()
  if (!s || s.total + size <= s.limit) return null
  const left = Math.max(0, s.limit - s.total)
  return left ? `Не хватает места: свободно ${bytes(left)} из ${bytes(s.limit)}. Удалите ненужные файлы или улучшите тариф` : `Хранилище заполнено: ${bytes(s.limit)} на бесплатном тарифе. Удалите ненужные файлы или улучшите тариф`
}
