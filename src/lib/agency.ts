import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { AGENCY } from './constants'

const KEY = 'agency-name'

const read = () => {
  try {
    return localStorage.getItem(KEY) || AGENCY
  } catch {
    return AGENCY
  }
}

/** Запоминаем название, чтобы страница входа сразу показывала его без запроса */
export function rememberAgency(name: string) {
  try {
    localStorage.setItem(KEY, name)
  } catch {
    /* приватный режим: просто не запоминаем */
  }
}

/** Название агентства для страниц без входа: из памяти браузера, затем из базы (миграция 012) */
export function useAgencyName(setTitle = true) {
  const [name, setName] = useState(read)
  useEffect(() => {
    let alive = true
    supabase.rpc('public_agency_name').then(({ data, error }) => {
      if (!alive || error || typeof data !== 'string' || !data.trim()) return
      setName(data.trim())
      rememberAgency(data.trim())
    })
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (setTitle) document.title = name
  }, [name, setTitle])
  return name
}
