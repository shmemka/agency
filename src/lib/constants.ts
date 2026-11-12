import type { CampaignStatus, DocKind, LegalStatus, Platform } from './types'

export type Status =
  | 'new'
  | 'contacted'
  | 'waiting_reply'
  | 'negotiating'
  | 'agreed'
  | 'waiting_details'
  | 'waiting_contract'
  | 'waiting_signature'
  | 'waiting_payment'
  | 'paid'
  | 'published'
  | 'done'
  | 'declined'
  | 'blacklist'

export type Phase = 'search' | 'talks' | 'papers' | 'money' | 'live' | 'stop'

export const PHASES: { id: Phase; label: string; dot: string; chip: string; solid: string }[] = [
  { id: 'search', label: 'Поиск', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800 ring-sky-200', solid: 'bg-sky-600 text-white' },
  { id: 'talks', label: 'Переговоры', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-800 ring-violet-200', solid: 'bg-violet-600 text-white' },
  { id: 'papers', label: 'Документы', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-900 ring-amber-200', solid: 'bg-amber-500 text-white' },
  { id: 'money', label: 'Оплата', dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-800 ring-teal-200', solid: 'bg-teal-600 text-white' },
  { id: 'live', label: 'Выход', dot: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', solid: 'bg-emerald-700 text-white' },
  { id: 'stop', label: 'Стоп', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-800 ring-rose-200', solid: 'bg-rose-600 text-white' },
]

export const STATUSES: { id: Status; label: string; phase: Phase }[] = [
  { id: 'new', label: 'Новый', phase: 'search' },
  { id: 'contacted', label: 'Написали', phase: 'search' },
  { id: 'waiting_reply', label: 'Жду ответ', phase: 'search' },
  { id: 'negotiating', label: 'Переговоры', phase: 'talks' },
  { id: 'agreed', label: 'Согласовано', phase: 'talks' },
  { id: 'waiting_details', label: 'Жду реквизиты', phase: 'papers' },
  { id: 'waiting_contract', label: 'Жду договор', phase: 'papers' },
  { id: 'waiting_signature', label: 'Жду подпись', phase: 'papers' },
  { id: 'waiting_payment', label: 'На оплате', phase: 'money' },
  { id: 'paid', label: 'Оплачено', phase: 'money' },
  { id: 'published', label: 'Вышел', phase: 'live' },
  { id: 'done', label: 'Закрыт', phase: 'live' },
  { id: 'declined', label: 'Отказ', phase: 'stop' },
  { id: 'blacklist', label: 'Чёрный список', phase: 'stop' },
]

export const STATUS_INDEX = Object.fromEntries(STATUSES.map((s, i) => [s.id, i])) as Record<Status, number>
export const statusInfo = (s: Status) => STATUSES.find((x) => x.id === s) ?? STATUSES[0]
export const phaseInfo = (p: Phase) => PHASES.find((x) => x.id === p)!
export const statusLabel = (s: Status | null | undefined) => (s ? statusInfo(s).label : '—')

export const PLATFORMS: { id: Platform; label: string; short: string }[] = [
  { id: 'tiktok', label: 'TikTok', short: 'TT' },
  { id: 'youtube', label: 'YouTube', short: 'YT' },
  { id: 'telegram', label: 'Telegram', short: 'TG' },
  { id: 'vk', label: 'VK', short: 'VK' },
  { id: 'instagram', label: 'Instagram', short: 'IG' },
  { id: 'other', label: 'Другое', short: '··' },
]
export const platformLabel = (p: Platform) => PLATFORMS.find((x) => x.id === p)?.label ?? p

export const LEGAL: { id: LegalStatus; label: string; ok: boolean }[] = [
  { id: 'self_employed', label: 'Самозанятый', ok: true },
  { id: 'ip', label: 'ИП', ok: true },
  { id: 'ooo', label: 'ООО', ok: true },
  { id: 'individual', label: 'Физлицо', ok: false },
  { id: 'unknown', label: 'Не уточнили', ok: false },
]
export const legalInfo = (l: LegalStatus) => LEGAL.find((x) => x.id === l) ?? LEGAL[4]

export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: 'contract', label: 'Договор' },
  { id: 'act', label: 'Акт' },
  { id: 'receipt', label: 'Чек' },
  { id: 'invoice', label: 'Счёт' },
  { id: 'stats', label: 'Статистика' },
  { id: 'brief', label: 'ТЗ / сценарий' },
  { id: 'other', label: 'Другое' },
]
export const docKindLabel = (k: DocKind) => DOC_KINDS.find((x) => x.id === k)?.label ?? k

export const CAMPAIGN_STATUSES: { id: CampaignStatus; label: string; chip: string }[] = [
  { id: 'planning', label: 'Планируем', chip: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { id: 'active', label: 'Идёт', chip: 'bg-accent-soft text-accent-dark ring-pink-200' },
  { id: 'paused', label: 'На паузе', chip: 'bg-amber-50 text-amber-900 ring-amber-200' },
  { id: 'done', label: 'Завершена', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { id: 'cancelled', label: 'Отменена', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
]
