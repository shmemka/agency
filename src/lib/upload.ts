import { useCallback, useState } from 'react'
import { supabase } from './supabase'

/*
 * Загрузка файла в хранилище с прогрессом.
 * supabase-js грузит через fetch, а он не сообщает, сколько уже отправлено.
 * Поэтому тот же запрос к хранилищу шлём через XMLHttpRequest: у него есть событие upload.progress
 */

const BASE = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export async function uploadFile(bucket: string, path: string, file: File, onProgress?: (part: number) => void): Promise<{ error: string | null }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? KEY
  return new Promise((done) => {
    const x = new XMLHttpRequest()
    x.open('POST', `${BASE}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`)
    x.setRequestHeader('Authorization', `Bearer ${token}`)
    x.setRequestHeader('apikey', KEY)
    x.setRequestHeader('x-upsert', 'false')
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return done({ error: null })
      let msg = `ошибка ${x.status}`
      try {
        const j = JSON.parse(x.responseText)
        msg = j.message || j.error || msg
      } catch {
        /* ответ не JSON - оставляем код */
      }
      done({ error: msg })
    }
    // текст как у fetch: humanError превратит его в «Нет связи с базой…»
    x.onerror = () => done({ error: 'Failed to fetch' })
    // тело - как у supabase-js для файлов: FormData, сначала cacheControl, потом сам файл без имени поля
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file)
    x.send(body)
  })
}

export interface UploadItem {
  id: string
  name: string
  size: number
  mime: string
  /** 0…1; null - ждёт своей очереди */
  progress: number | null
  /** локальная ссылка на картинку: превью видно сразу, ещё до загрузки */
  preview: string | null
}

/** Строки «загружается» с прогрессом: add() при выборе файлов, потом set() по ходу и clear() в конце */
export function useUploads() {
  const [items, setItems] = useState<UploadItem[]>([])
  const add = useCallback((files: File[]) => {
    const rows = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: f.size,
      mime: f.type,
      progress: null,
      preview: f.type.startsWith('image/') && f.size < 20 * 1024 * 1024 ? URL.createObjectURL(f) : null,
    }))
    setItems((a) => [...a, ...rows])
    return rows.map((r) => r.id)
  }, [])
  const set = useCallback((id: string, progress: number) => setItems((a) => a.map((x) => (x.id === id ? { ...x, progress } : x))), [])
  const clear = useCallback((ids: string[]) => {
    setItems((a) => {
      a.filter((x) => ids.includes(x.id) && x.preview).forEach((x) => URL.revokeObjectURL(x.preview!))
      return a.filter((x) => !ids.includes(x.id))
    })
  }, [])
  return { items, add, set, clear }
}
