import { useEffect, useState } from 'react'
import { useLocation, type Location } from 'react-router-dom'

/*
 * Настройки кабинета на компьютере открываются окном поверх страницы, на которой были.
 * Адрес при этом /settings/…, а страница под окном хранится в state.bg.
 * Открыли адрес напрямую (закладка, обновили страницу) - под окном главная
 */

const WIDE = '(min-width: 1024px)'

/** Широкий экран: настройки - окном. Уже - отдельной страницей со списком разделов */
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const m = window.matchMedia(WIDE)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

export type SettingsState = { bg?: Location; back?: boolean } | null

export const isSettings = (path: string) => /^\/settings(\/|$)/.test(path)

export const bgLocation = (pathname: string): Location => ({ pathname, search: '', hash: '', state: null, key: pathname })

/** Страница под окном настроек. null - окна нет: настроек не открыли или экран узкий */
export function useSettingsBackground(): Location | null {
  const loc = useLocation()
  const wide = useWide()
  if (!wide || !isSettings(loc.pathname)) return null
  return (loc.state as SettingsState)?.bg ?? bgLocation('/')
}
