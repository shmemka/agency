import { useEffect, useState } from 'react'
import { Toast } from '../components/ui'

const EVENT = 'crm-toast'

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    const h = (e: Event) => setMsg((e as CustomEvent<string>).detail)
    window.addEventListener(EVENT, h)
    return () => window.removeEventListener(EVENT, h)
  }, [])
  return <Toast message={msg} onDone={() => setMsg(null)} />
}
