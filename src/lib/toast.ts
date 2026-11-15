const EVENT = 'app:toast'

/*
 * Ошибки базы приходят по-английски и техническим языком («new row violates row-level security policy…»).
 * Человеку показываем, что случилось и что делать, а не текст для программиста
 */
const HUMAN: [RegExp, string][] = [
  [/row-level security|permission denied|not allowed|insufficient privilege/i, 'Нет прав на это действие. Если это ошибка, напишите учредителю кабинета'],
  [/duplicate key|already exists|unique constraint/i, 'Такая запись уже есть'],
  [/failed to fetch|networkerror|load failed|network request failed|fetch failed/i, 'Нет связи с базой. Проверьте интернет или VPN и попробуйте ещё раз'],
  [/jwt expired|invalid jwt|refresh token/i, 'Сессия истекла. Обновите страницу и войдите снова'],
  [/violates foreign key/i, 'Запись связана с другими данными, поэтому изменить её так нельзя'],
  [/value too long/i, 'Слишком длинный текст, сократите его'],
  [/invalid input syntax for type (numeric|integer|bigint)/i, 'Проверьте числа: где-то вместо цифры стоит текст'],
  [/invalid input syntax for type date|date\/time field value out of range/i, 'Проверьте дату'],
  [/timeout|timed out|statement timeout|aborted/i, 'База долго не отвечает. Попробуйте ещё раз через минуту'],
  [/payload too large|exceeded the maximum allowed size|too large/i, 'Файл слишком большой'],
]

export function humanError(msg: string) {
  for (const [re, text] of HUMAN) if (re.test(msg)) return text
  // текст уже по-русски (ошибки из наших функций в базе) — показываем как есть
  if (/[а-яё]/i.test(msg)) return msg
  return `Не получилось, попробуйте ещё раз. Подробности для поддержки: ${msg}`
}

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: humanError(message) }))
}

export function onToast(handler: (m: string) => void) {
  const h = (e: Event) => handler((e as CustomEvent<string>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
