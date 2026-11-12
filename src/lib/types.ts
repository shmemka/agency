import type { Status } from './constants'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: 'admin' | 'manager'
  is_active: boolean
  created_at: string
}

export type Platform = 'tiktok' | 'youtube' | 'telegram' | 'vk' | 'instagram' | 'other'
export type LegalStatus = 'self_employed' | 'ip' | 'ooo' | 'individual' | 'unknown'

export interface Blogger {
  id: string
  nick: string
  name: string | null
  platform: Platform
  url: string | null
  topic: string | null
  audience: string | null
  content_type: string | null
  city: string | null
  followers: number | null
  avg_reach: number | null
  price: number | null
  contact: string | null
  email: string | null
  phone: string | null
  legal_status: LegalStatus
  rkn_registered: boolean | null
  status: Status
  owner_id: string | null
  next_action_at: string | null
  tags: string[]
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  contact_name: string | null
  contact: string | null
  inn: string | null
  niche: string | null
  notes: string | null
  created_at: string
}

export type CampaignStatus = 'planning' | 'active' | 'paused' | 'done' | 'cancelled'

export interface Campaign {
  id: string
  client_id: string | null
  name: string
  status: CampaignStatus
  budget: number | null
  commission_pct: number | null
  prepaid: boolean
  start_date: string | null
  end_date: string | null
  brief: string | null
  owner_id: string | null
  created_at: string
}

export interface Integration {
  id: string
  blogger_id: string
  campaign_id: string | null
  publish_date: string | null
  format: string | null
  price: number | null
  guaranteed_reach: number | null
  fact_reach: number | null
  status: Status
  script_url: string | null
  script_approved: boolean
  ad_url: string | null
  promo_code: string | null
  erid: string | null
  ord_registered: boolean
  payments_count: number | null
  revenue: number | null
  owner_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DocKind = 'contract' | 'act' | 'receipt' | 'invoice' | 'stats' | 'brief' | 'other'

export interface Doc {
  id: string
  blogger_id: string | null
  integration_id: string | null
  campaign_id: string | null
  kind: DocKind
  name: string
  storage_path: string | null
  external_url: string | null
  size: number | null
  mime: string | null
  uploaded_by: string | null
  created_at: string
}

export interface Activity {
  id: number
  blogger_id: string | null
  integration_id: string | null
  actor_id: string | null
  kind: 'comment' | 'status' | 'document' | 'created'
  body: string | null
  from_status: Status | null
  to_status: Status | null
  created_at: string
}
