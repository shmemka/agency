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
