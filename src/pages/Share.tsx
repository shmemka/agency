import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, Download, ExternalLink, Printer, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AGENCY, platformInfo } from '../lib/constants'
import { count, cpm, date, downloadXlsx, money, plural } from '../lib/format'
import type { AgeSplit, Platform } from '../lib/types'
import { toast } from '../lib/toast'
import { Button, Card, PlatformTag, Spinner, cx } from '../components/ui'
import { AudienceBar } from '../components/bits'
import { ImageViewer } from '../components/DocumentsPanel'

interface Base {
  kind: 'shortlist' | 'report'
  agency: string
  campaign: string
  client: string | null
  start_date: string | null
  end_date: string | null
  error?: string
}
interface ShortRow {
  id: string
  nick: string
  name: string | null
  url: string | null
  platform: Platform
  topic: string | null
  followers: number | null
  avg_reach: number | null
  female_pct: number | null
  age: AgeSplit | null
  format: string | null
  price: number | null
  decision: 'pending' | 'approved' | 'rejected'
  comment: string | null
  /** с блогером уже оформляют документы: решение меняет только менеджер */
  locked?: boolean
}
interface ReportRow {
  id: string
  date: string | null
  nick: string
  url: string | null
  platform: Platform
  ad_url: string | null
  price: number | null
  guaranteed_reach: number | null
  fact_reach: number | null
  erid: string | null
  shots: { name: string; path: string | null; url: string | null }[]
}
type Data = Base & { rows: (ShortRow | ReportRow)[]; planned?: number; budget?: number | null }

function Frame({ d, title, children, actions }: { d: Base | null; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 pt-6 pb-32">
      <header className="mb-8 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-ink">
          <span className="bar-lime size-2.5 rounded-full" />
        </span>
        <span className="flex-1 text-[15px] font-medium">{d?.agency ?? AGENCY}</span>
        <span className="no-print flex gap-2">{actions}</span>
      </header>
      {d && (
        <div className="mb-6">
          <p className="text-muted">
            {title}
            {d.client ? ` для ${d.client}` : ''}
          </p>
          <h1 className="mt-1 text-[28px] leading-8 tracking-tight sm:text-[36px] sm:leading-10">{d.campaign}</h1>
          {(d.start_date || d.end_date) && (
            <p className="num mt-1 text-muted">
              {date(d.start_date)} – {date(d.end_date)}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

export function Share() {
  // новая ссылка вида /s/?t=… отдаётся GitHub Pages как настоящая страница, старая /s/<токен> тоже работает
  const params = useParams()
  const [sp] = useSearchParams()
  const token = params.token ?? sp.get('t') ?? ''
  // «Открыть как клиент» из кабинета: смотреть можно, отметки не сохраняются
  const preview = sp.get('preview') === '1'
  const [d, setD] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'revoked' | 'missing'>('loading')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_share', { p_token: token })
    const res = data as Data | null
    if (error || !res || res.error === 'not_found') return setState('missing')
    if (res.error === 'revoked') return setState('revoked')
    setD(res)
    setState('ok')
  }, [token])
  useEffect(() => {
    load()
  }, [load])

  if (state === 'loading')
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  if (state !== 'ok' || !d)
    return (
      <Frame d={null} title="">
        <Card className="mx-auto max-w-md text-center">
          <h1 className="text-xl">{state === 'revoked' ? 'Ссылка больше не действует' : 'Страница не найдена'}</h1>
          <p className="mt-2 text-muted">{state === 'revoked' ? 'Агентство закрыло доступ по этой ссылке. Попросите у менеджера новую' : 'Проверьте, что ссылка скопирована целиком'}</p>
        </Card>
      </Frame>
    )
  return d.kind === 'shortlist' ? <Shortlist d={d} rows={d.rows as ShortRow[]} token={token} reload={load} preview={preview} /> : <Report d={d} rows={d.rows as ReportRow[]} />
}

function Shortlist({ d, rows, token, reload, preview }: { d: Data; rows: ShortRow[]; token: string; reload: () => void; preview: boolean }) {
  const [local, setLocal] = useState<Record<string, { decision: ShortRow['decision']; comment: string }>>({})
  const state = (r: ShortRow) => local[r.id] ?? { decision: r.decision, comment: r.comment ?? '' }
  const chosen = rows.filter((r) => state(r).decision === 'approved')
  const sum = chosen.reduce((a, r) => a + (r.price ?? 0), 0)
  const reach = chosen.reduce((a, r) => a + (r.avg_reach ?? 0), 0)

  async function decide(r: ShortRow, decision: ShortRow['decision'], comment = state(r).comment) {
    if (preview) return toast('Это просмотр для команды: отметки здесь не сохраняются')
    if (r.locked && decision !== r.decision) return toast('С этим блогером уже оформляют документы. Чтобы изменить решение, напишите менеджеру')
    setLocal((l) => ({ ...l, [r.id]: { decision, comment } }))
    const { data, error } = await supabase.rpc('set_share_decision', { p_token: token, p_integration: r.id, p_decision: decision, p_comment: comment })
    if (error || (data as { error?: string })?.error) {
      toast((data as { error?: string })?.error === 'locked' ? 'С этим блогером уже оформляют документы. Чтобы изменить решение, напишите менеджеру' : 'Выбор не сохранился. Обновите страницу и попробуйте ещё раз')
      reload()
    }
  }

  const excel = () =>
    downloadXlsx(
      `Подборка, ${d.campaign}`,
      rows.map((r) => ({ Блогер: r.nick, Ссылка: r.url, Площадка: platformInfo(r.platform).label, Тематика: r.topic, Подписчики: r.followers, 'Средний охват': r.avg_reach, 'Женщины, %': r.female_pct, Формат: r.format ?? platformInfo(r.platform).format, 'Цена, ₽': r.price, 'CPM, ₽': Math.round(cpm(r.price, r.avg_reach) ?? 0) || null, Решение: state(r).decision === 'approved' ? 'Берём' : state(r).decision === 'rejected' ? 'Не надо' : '' })),
    )

  return (
    <Frame
      d={d}
      title="Подборка блогеров"
      actions={
        <Button onClick={excel}>
          <Download className="size-4" strokeWidth={1.5} />
          Excel
        </Button>
      }
    >
      {preview && <p className="mb-4 max-w-xl rounded-2xl bg-lime/40 px-4 py-3">Так подборку видит клиент. Это просмотр для команды: отметки здесь не сохраняются</p>}
      <p className="mb-4 max-w-xl text-muted">Отметьте, кого берёте в кампанию. Выбор сохраняется сразу, менеджер увидит его без звонка. Передумать можно, пока с блогером не начали оформлять документы</p>
      {rows.length === 0 && <Card className="text-muted">Менеджер ещё собирает подборку. Загляните позже</Card>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const s = state(r)
          const p = platformInfo(r.platform)
          const k = cpm(r.price, r.avg_reach)
          return (
            <li key={r.id} className={cx('rounded-card bg-surface p-5 transition-opacity duration-150', s.decision === 'rejected' && 'opacity-60')}>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex items-center gap-2">
                    <PlatformTag short={p.short} label={p.label} />
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-lg hover:underline">
                        <span className="truncate">{r.nick}</span>
                        <ExternalLink className="size-4 shrink-0 text-faint" strokeWidth={1.5} />
                      </a>
                    ) : (
                      <span className="truncate text-lg">{r.nick}</span>
                    )}
                  </div>
                  {r.topic && <p className="mt-1 text-[13px] text-muted">{r.topic}</p>}
                  <p className="mt-1 text-[13px] text-muted">{r.format ?? p.format}</p>
                </div>
                <dl className="num grid grid-cols-3 gap-x-5 text-right">
                  {[
                    ['Подписчики', count(r.followers)],
                    ['Средний охват', count(r.avg_reach)],
                    ['CPM', k ? money(k) : '—'],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <dt className="text-xs text-muted">{a}</dt>
                      <dd className="mt-0.5">{b}</dd>
                    </div>
                  ))}
                </dl>
                <AudienceBar female={r.female_pct} age={r.age} className="w-36" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <span className="num mr-auto text-xl">{money(r.price)}</span>
                {r.locked && <span className="text-[13px] text-muted">Уже в работе</span>}
                <button
                  disabled={r.locked}
                  onClick={() => decide(r, s.decision === 'rejected' ? 'pending' : 'rejected')}
                  aria-pressed={s.decision === 'rejected'}
                  className={cx('inline-flex h-11 items-center gap-2 rounded-full px-4 transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40', s.decision === 'rejected' ? 'bg-ink/10' : 'text-muted hover:bg-ink/5 hover:text-ink')}
                >
                  <X className="size-4" strokeWidth={1.5} />
                  Не надо
                </button>
                <button
                  disabled={r.locked}
                  onClick={() => decide(r, s.decision === 'approved' ? 'pending' : 'approved')}
                  aria-pressed={s.decision === 'approved'}
                  className={cx('inline-flex h-11 items-center gap-2 rounded-full px-5 transition-colors duration-150 disabled:pointer-events-none', s.decision === 'approved' ? 'bar-lime text-ink' : 'bg-ink text-white hover:bg-ink/85')}
                >
                  <Check className="size-4" strokeWidth={2} />
                  Берём
                </button>
              </div>
              {s.decision !== 'pending' && (
                <input
                  className="mt-3 h-10 w-full rounded-2xl bg-soft px-4 placeholder:text-faint focus:ring-1 focus:ring-ink/25 focus:outline-none"
                  placeholder="Комментарий для менеджера, если нужен"
                  aria-label="Комментарий"
                  value={s.comment}
                  maxLength={500}
                  onChange={(e) => setLocal((l) => ({ ...l, [r.id]: { ...s, comment: e.target.value } }))}
                  onBlur={() => s.comment !== (r.comment ?? '') && decide(r, s.decision, s.comment)}
                />
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
          <div className="num mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3">
            <span className="text-lg">
              {chosen.length ? `Берёте ${chosen.length} ${plural(chosen.length, 'блогера', 'блогеров', 'блогеров')} на ${money(sum)}` : 'Пока никого не выбрали'}
            </span>
            {chosen.length > 0 && (
              <span className="text-[13px] text-muted">
                охват {count(reach)}, CPM {money(cpm(sum, reach))}
              </span>
            )}
          </div>
        </div>
      )}
    </Frame>
  )
}

function Report({ d, rows }: { d: Data; rows: ReportRow[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [view, setView] = useState<{ url: string; name: string } | null>(null)
  const reach = rows.reduce((a, r) => a + (r.fact_reach ?? 0), 0)
  const guarantee = rows.reduce((a, r) => a + (r.guaranteed_reach ?? 0), 0)
  const spent = rows.reduce((a, r) => a + (r.price ?? 0), 0)
  const max = Math.max(1, ...rows.map((r) => Math.max(r.fact_reach ?? 0, r.guaranteed_reach ?? 0)))

  useEffect(() => {
    const paths = rows.flatMap((r) => r.shots.map((s) => s.path).filter(Boolean)) as string[]
    if (!paths.length) return
    Promise.all(paths.map((p) => supabase.storage.from('documents').createSignedUrl(p, 3600))).then((res) => {
      const m: Record<string, string> = {}
      res.forEach((r, i) => r.data && (m[paths[i]] = r.data.signedUrl))
      setUrls(m)
    })
  }, [rows.length])

  const excel = () =>
    downloadXlsx(
      `Отчёт, ${d.campaign}`,
      rows.map((r) => ({ Дата: r.date, Блогер: r.nick, 'Ссылка на выход': r.ad_url, 'Цена, ₽': r.price, Гарант: r.guaranteed_reach, 'Охват по факту': r.fact_reach, 'CPM, ₽': Math.round(cpm(r.price, r.fact_reach) ?? 0) || null, erid: r.erid })),
    )

  return (
    <Frame
      d={d}
      title="Отчёт по кампании"
      actions={
        <>
          <Button onClick={excel}>
            <Download className="size-4" strokeWidth={1.5} />
            Excel
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="size-4" strokeWidth={1.5} />
            PDF
          </Button>
        </>
      }
    >
      <p className="-mt-3 mb-5 text-[13px] text-muted">Данные на {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Вышло интеграций', `${rows.length}`, d.planned ? `из ${d.planned} запланированных` : ''],
          ['Охват', count(reach), guarantee ? `гарант ${count(guarantee)}, ${Math.round((reach / guarantee) * 100)}%` : ''],
          ['Средний CPM', reach ? money(cpm(spent, reach)) : '—', 'за тысячу просмотров'],
          ['Потрачено', money(spent), d.budget ? `из ${money(d.budget)}` : ''],
        ].map(([k, v, n]) => (
          <Card key={k} className="print-card">
            <div className="text-[13px] text-muted">{k}</div>
            <div className="num mt-1 text-2xl sm:text-[28px] sm:leading-8">{v}</div>
            <div className="num mt-1 text-xs text-muted">{n}</div>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="mt-3 text-muted">Выходов пока не было. Отчёт обновится сам, когда блогеры опубликуют рекламу</Card>
      ) : (
        <>
          <Card className="print-card mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base">Охват по блогерам</h2>
              <div className="flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="bar-lime h-2 w-5 rounded-full" />
                  по факту
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="hatch h-2 w-5 rounded-full" />
                  гарант
                </span>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {[...rows]
                .sort((a, b) => (b.fact_reach ?? 0) - (a.fact_reach ?? 0))
                .map((r) => (
                  <li key={r.id} className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-3">
                    <span className="truncate text-[13px]">{r.nick}</span>
                    <span className="relative h-5">
                      <span className="hatch absolute inset-y-0 left-0 rounded-full" style={{ width: `${((r.guaranteed_reach ?? 0) / max) * 100}%` }} />
                      <span className="bar-lime absolute inset-y-0 left-0 rounded-full" style={{ width: `${((r.fact_reach ?? 0) / max) * 100}%` }} />
                    </span>
                    <span className="num text-right text-[13px]">{count(r.fact_reach)}</span>
                  </li>
                ))}
            </ul>
          </Card>

          <div className="print-card mt-3 overflow-hidden rounded-card bg-surface">
            <div className="overflow-x-auto">
              <table className="num w-full min-w-[720px] text-left text-[13px] [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th]:px-3 [&_th]:py-3 [&_th]:font-normal [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
                <thead className="text-faint">
                  <tr>
                    <th>Дата</th>
                    <th>Блогер</th>
                    <th>Выход</th>
                    <th className="text-right">Цена</th>
                    <th className="text-right">Гарант</th>
                    <th className="text-right">Охват</th>
                    <th className="text-right">CPM</th>
                    <th>erid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="whitespace-nowrap">{date(r.date)}</td>
                      <td>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {r.nick}
                          </a>
                        ) : (
                          r.nick
                        )}
                      </td>
                      <td>
                        {r.ad_url ? (
                          <a href={r.ad_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                            смотреть
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">{money(r.price)}</td>
                      <td className="text-right text-muted">{count(r.guaranteed_reach)}</td>
                      <td className="text-right">{count(r.fact_reach)}</td>
                      <td className="text-right whitespace-nowrap text-muted">{cpm(r.price, r.fact_reach) ? money(cpm(r.price, r.fact_reach)) : '—'}</td>
                      <td className="text-muted">{r.erid ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {rows.some((r) => r.shots.length) && (
            <Card className="print-card mt-3">
              <h2 className="text-base">Скрины статистики</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {rows.flatMap((r) =>
                  r.shots.map((s, i) => {
                    const u = s.path ? urls[s.path] : s.url
                    return (
                      <figure key={`${r.id}${i}`}>
                        {s.path ? (
                          <button onClick={() => u && setView({ url: u, name: `${r.nick}, статистика` })} className="hatch block aspect-[3/4] w-full overflow-hidden rounded-inner">
                            {u && <img src={u} alt={`Статистика ${r.nick}`} className="size-full object-cover" />}
                          </button>
                        ) : (
                          <a href={u ?? '#'} target="_blank" rel="noreferrer" className="flex aspect-[3/4] items-center justify-center rounded-inner bg-soft text-[13px] underline underline-offset-4">
                            открыть скрин
                          </a>
                        )}
                        <figcaption className="mt-1 truncate text-xs text-muted">{r.nick}</figcaption>
                      </figure>
                    )
                  }),
                )}
              </div>
            </Card>
          )}
        </>
      )}
      {view && <ImageViewer url={view.url} name={view.name} onClose={() => setView(null)} />}
    </Frame>
  )
}
