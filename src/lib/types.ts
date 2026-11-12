import type { BloggerStatus, Status } from './constants'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: 'admin' | 'manager'
  is_active: boolean
  created_at: string
}

export type Platform = 'tiktok' | 'youtube' | 'telegram' | 'vk' | 'instagram' | 'other'
export type LegalStatus = 'self_employed' | 'ip' | 'ooo' | 'individual' | 'unknown'
export type AgeSplit = Partial<Record<'u18' | 'a18' | 'a25' | 'a35', number>>

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
  age: number | null
  avatar_url: string | null
  followers: number | null
  avg_reach: number | null
  clip_views: number | null
  audience_female_pct: number | null
  audience_age: AgeSplit | null
  stats_updated_at: string | null
  price: number | null
  contact: string | null
  email: string | null
  phone: string | null
  legal_status: LegalStatus
  rkn_registered: boolean | null
  status: BloggerStatus
  blacklist_reason: string | null
  owner_id: string | null
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
  markup_pct: number
  prepaid: boolean
  start_date: string | null
  end_date: string | null
  brief: string | null
  owner_id: string | null
  created_at: string
}

export type Decision = 'none' | 'pending' | 'approved' | 'rejected'

export interface Integration {
  id: string
  blogger_id: string
  campaign_id: string | null
  publish_date: string | null
  format: string | null
  price: number | null
  price_client: number | null
  price_client_manual: boolean
  client_decision: Decision
  client_comment: string | null
  guaranteed_reach: number | null
  fact_reach: number | null
  status: Status
  script_url: string | null
  script_approved: boolean
  ad_url: string | null
  promo_code: string | null
  erid: string | null
  first_shown_at: string | null
  ord_reported_at: string | null
  ord_reported_by: string | null
  marked_by: 'us' | 'client' | 'blogger'
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
  hide_from_client: boolean
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
  from_status: string | null
  to_status: string | null
  created_at: string
}

export interface Task {
  id: string
  title: string
  assignee_id: string
  due_date: string | null
  due_time: string | null
  blogger_id: string | null
  integration_id: string | null
  campaign_id: string | null
  done_at: string | null
  created_by: string | null
  created_at: string
}

export interface Notice {
  id: number
  profile_id: string
  kind: string
  title: string
  link: string | null
  read_at: string | null
  created_at: string
}

export interface Offer {
  id: string
  token: string
  blogger_id: string
  created_by: string | null
  created_at: string
  views: number
  first_seen_at: string | null
  last_seen_at: string | null
  reply_contact: string | null
  reply_text: string | null
  replied_at: string | null
}

export interface ShareLink {
  id: string
  token: string
  kind: 'shortlist' | 'report'
  campaign_id: string
  revoked: boolean
  created_at: string
}

export interface Income {
  id: string
  paid_on: string
  amount: number
  client_id: string | null
  campaign_id: string | null
  receiver_id: string | null
  payer_type: 'org' | 'person'
  has_receipt: boolean
  receipt_url: string | null
  note: string | null
}

export interface Expense {
  id: string
  paid_on: string
  amount: number
  category: string | null
  paid_by: string | null
  note: string | null
}

export interface Settings {
  agency_name: string
  default_markup_pct: number
  tax_org_pct: number
  tax_person_pct: number
  income_limit: number
  ord_deadline_days: number
}
