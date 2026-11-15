import { supabase } from './supabase'
import type { Blogger, Integration } from './types'

/** Кладёт блогеров в подборку кампании. Чёрный список и уже добавленных пропускает */
export async function addToCampaign(campaignId: string, bloggers: Blogger[], integrations: Integration[]) {
  const have = new Set(integrations.filter((i) => i.campaign_id === campaignId).map((i) => i.blogger_id))
  const rows = bloggers.filter((b) => b.status !== 'blacklist' && !have.has(b.id)).map((b) => ({ blogger_id: b.id, campaign_id: campaignId, price: b.price, status: 'new' }))
  if (!rows.length) return { added: 0, error: null as string | null }
  const { error } = await supabase.from('integrations').insert(rows)
  return { added: error ? 0 : rows.length, error: error?.message ?? null }
}

/**
 * Перед удалением кампании или интеграции убирает их файлы из хранилища: документы кампании и вложения задач.
 * Записи о файлах база удалит каскадом, а сами файлы остались бы навсегда - хранилище разрешает удалить файл,
 * только пока есть запись о нём
 */
export async function removeStoredFiles({ campaignId, integrationIds = [] }: { campaignId?: string; integrationIds?: string[] }): Promise<string | null> {
  const docPaths = campaignId ? ((await supabase.from('documents').select('storage_path').eq('campaign_id', campaignId).not('storage_path', 'is', null)).data ?? []).map((d) => d.storage_path as string) : []
  const taskIds = [
    ...(campaignId ? ((await supabase.from('tasks').select('id').eq('campaign_id', campaignId)).data ?? []) : []),
    ...(integrationIds.length ? ((await supabase.from('tasks').select('id').in('integration_id', integrationIds)).data ?? []) : []),
  ].map((t) => t.id as string)
  const filePaths = taskIds.length ? ((await supabase.from('task_files').select('storage_path').in('task_id', [...new Set(taskIds)])).data ?? []).map((f) => f.storage_path as string) : []
  for (const [bucket, list] of [['documents', docPaths], ['task-files', filePaths]] as const) {
    for (let i = 0; i < list.length; i += 100) {
      const { error } = await supabase.storage.from(bucket).remove(list.slice(i, i + 100))
      if (error) return `Не получилось удалить файлы, ничего не удалено. Попробуйте ещё раз. ${error.message}`
    }
  }
  return null
}
