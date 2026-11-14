// Ссылка-приглашение в кабинет: /join/?t=…
// Пока человек входит или регистрируется, токен лежит в браузере, чтобы после входа сразу предложить присоединиться
import { siteUrl } from './supabase'

const KEY = 'sverka-invite'

export const inviteUrl = (token: string) => siteUrl(`join/?t=${token}`)

export function saveInvite(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    /* приватный режим: приглашение не переживёт перезагрузку, ссылку откроют ещё раз */
  }
}

export function readInvite() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* нечего чистить */
  }
}

/** Токен из вставленной ссылки целиком или из одного кода */
export function parseInvite(text: string) {
  const s = text.trim()
  const m = s.match(/[?&]t=([A-Za-z0-9]+)/) ?? s.match(/^([A-Za-z0-9]{12,64})$/)
  return m?.[1] ?? null
}
