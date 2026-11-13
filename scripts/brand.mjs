// Подставляет название агентства из настроек в заголовок и превью ссылок (dist/index.html).
// Название меняется в «Настройках», а превью для мессенджеров — статичный файл, поэтому обновляется при публикации.
// Нет связи с базой или миграции 012 — оставляем название по умолчанию.
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.production', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
)
const DEFAULT = 'No Name Agency'
let name = DEFAULT
try {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/public_agency_name`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(8000),
  })
  const v = r.ok ? await r.json() : null
  if (typeof v === 'string' && v.trim()) name = v.trim()
} catch {
  /* оставляем по умолчанию */
}
const esc = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const file = 'dist/index.html'
writeFileSync(file, readFileSync(file, 'utf8').replaceAll(DEFAULT, esc))
console.log(`Название в превью: ${name}`)
