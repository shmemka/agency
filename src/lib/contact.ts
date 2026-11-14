/** Ник в Telegram из поля «Контакт»: @nick, nick, t.me/nick, «tg: @nick, звонить вечером» */
export function tgUsername(contact: string | null | undefined) {
  const s = contact?.trim()
  if (!s) return null
  const m =
    s.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,32})/i) ??
    s.match(/(?:^|[\s,;:(])@([A-Za-z0-9_]{4,32})\b/) ??
    s.match(/^@?([A-Za-z][A-Za-z0-9_]{3,31})$/)
  return m?.[1] ?? null
}
