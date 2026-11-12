const EVENT = 'crm-toast'

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

export function onToast(handler: (m: string) => void) {
  const h = (e: Event) => handler((e as CustomEvent<string>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
