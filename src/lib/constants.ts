import type { CampaignStatus, DocKind, LegalStatus, Platform } from './types'

export const AGENCY = 'No Name Agency'

/** Этапы воронки — живут в интеграции */
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

export type Phase = 'search' | 'talks' | 'papers' | 'money' | 'live' | 'stop'

export const PHASES: { id: Phase; label: string; dot: string }[] = [
  { id: 'search', label: 'Поиск', dot: 'bg-sky-400' },
  { id: 'talks', label: 'Переговоры', dot: 'bg-violet-400' },
  { id: 'papers', label: 'Документы', dot: 'bg-amber-400' },
  { id: 'money', label: 'Оплата', dot: 'bg-teal-400' },
  { id: 'live', label: 'Выход', dot: 'bg-leaf' },
  { id: 'stop', label: 'Отказ', dot: 'bg-stone-400' },
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
]

export const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s.id, i])) as Record<Status, number>
export const statusInfo = (s: Status) => STATUSES.find((x) => x.id === s) ?? STATUSES[0]
export const phaseInfo = (p: Phase) => PHASES.find((x) => x.id === p)!
export const statusLabel = (s: Status | null | undefined) => (s ? statusInfo(s).label : '—')
export const nextStatus = (s: Status): Status | null => {
  const i = STATUS_ORDER[s]
  return i < 11 ? STATUSES[i + 1].id : null
}

/** Статус отношений с блогером */
export type BloggerStatus = 'in_base' | 'verified' | 'worked' | 'blacklist'
export const BLOGGER_STATUSES: { id: BloggerStatus; label: string; dot: string; hint: string }[] = [
  { id: 'in_base', label: 'В базе', dot: 'bg-stone-300', hint: 'Добавили, ещё не проверяли' },
  { id: 'verified', label: 'Проверенный', dot: 'bg-sky-400', hint: 'Охваты и цена актуальны, статус самозанятого или ИП известен' },
  { id: 'worked', label: 'Работали', dot: 'bg-leaf', hint: 'Ставится сам после первого выхода' },
  { id: 'blacklist', label: 'Чёрный список', dot: 'bg-ink', hint: 'Не работаем' },
]
export const bloggerStatusInfo = (s: BloggerStatus) => BLOGGER_STATUSES.find((x) => x.id === s) ?? BLOGGER_STATUSES[0]

export const PLATFORMS: { id: Platform; label: string; short: string; reach: string; followers: string; format: string }[] = [
  { id: 'tiktok', label: 'TikTok', short: 'TT', reach: 'Средние просмотры видео', followers: 'Подписчики', format: 'Видео-интеграция' },
  { id: 'vk', label: 'VK', short: 'VK', reach: 'Средний охват поста', followers: 'Подписчики сообщества', format: 'Пост' },
  { id: 'youtube', label: 'YouTube', short: 'YT', reach: 'Средние просмотры видео', followers: 'Подписчики', format: 'Интеграция в видео' },
  { id: 'telegram', label: 'Telegram', short: 'TG', reach: 'Средний охват поста', followers: 'Подписчики', format: 'Пост' },
  { id: 'instagram', label: 'Instagram', short: 'IG', reach: 'Средний охват', followers: 'Подписчики', format: 'Reels' },
  { id: 'other', label: 'Другое', short: '··', reach: 'Средний охват', followers: 'Подписчики', format: '' },
]
export const platformInfo = (p: Platform) => PLATFORMS.find((x) => x.id === p) ?? PLATFORMS[5]
export const platformLabel = (p: Platform) => platformInfo(p).label

export const AGE_GROUPS = [
  { id: 'u18', label: 'до 18' },
  { id: 'a18', label: '18–24' },
  { id: 'a25', label: '25–34' },
  { id: 'a35', label: '35+' },
] as const

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
  { id: 'brief', label: 'ТЗ, сценарий' },
  { id: 'other', label: 'Другое' },
]
export const docKindLabel = (k: DocKind) => DOC_KINDS.find((x) => x.id === k)?.label ?? k

export const CAMPAIGN_STATUSES: { id: CampaignStatus; label: string }[] = [
  { id: 'planning', label: 'Планируем' },
  { id: 'active', label: 'Идёт' },
  { id: 'paused', label: 'На паузе' },
  { id: 'done', label: 'Завершена' },
  { id: 'cancelled', label: 'Отменена' },
]
export const campaignStatusLabel = (s: CampaignStatus) => CAMPAIGN_STATUSES.find((x) => x.id === s)?.label ?? s

export const DECISIONS = {
  none: 'Не отправлено',
  pending: 'Ждём решения',
  approved: 'Одобрен',
  rejected: 'Отклонён',
} as const

export const MARKED_BY = { us: 'Мы', client: 'Клиент', blogger: 'Блогер' } as const
