import { useRef, useState } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Avatar, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'

const BUCKET = 'avatars'
const SIZE = 512

/** Квадрат по центру, 512×512, webp: аватарка весит десятки килобайт, а не мегабайты с телефона */
async function squareImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(SIZE, side)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обработать фото'))), 'image/webp', 0.88))
}

/** Путь файла внутри бакета из публичной ссылки */
function pathFromUrl(url: string | null | undefined) {
  const i = url?.indexOf(`/${BUCKET}/`) ?? -1
  return url && i >= 0 ? decodeURIComponent(url.slice(i + BUCKET.length + 2).split('?')[0]) : null
}

export function Profile() {
  const { profile, isAdmin, reloadProfile, reloadTeam } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  if (!profile) return null
  const display = profile.full_name || profile.email || ''

  async function setAvatar(url: string | null) {
    const old = pathFromUrl(profile!.avatar_url)
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile!.id)
    if (error) return toast(error.message)
    if (old) await supabase.storage.from(BUCKET).remove([old])
    await Promise.all([reloadProfile(), reloadTeam()])
  }

  async function upload(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Нужна картинка: JPG, PNG или WebP')
    setBusy(true)
    try {
      const blob = await squareImage(file)
      const path = `${profile!.id}/${Date.now()}.webp`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
      if (error) throw error
      await setAvatar(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
      toast('Фото обновлено')
    } catch (e) {
      const msg = (e as Error).message
      toast(/bucket not found/i.test(msg) ? 'В базе ещё нет хранилища для фото: нужно запустить миграцию 003_avatars.sql' : msg)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function saveName() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id)
    setSaving(false)
    if (error) return toast(error.message)
    await Promise.all([reloadProfile(), reloadTeam()])
    toast('Имя сохранено')
  }

  return (
    <>
      <PageHeader title="Мой профиль" sub={isAdmin ? 'Учредитель' : 'Специалист'} />
      <div className="grid max-w-3xl gap-3">
        <Card>
          <h2 className="mb-4 text-base">Фото</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              upload(e.dataTransfer.files[0])
            }}
            className={`-m-3 flex flex-col items-start gap-5 rounded-inner p-3 transition-colors duration-150 sm:flex-row sm:items-center ${drag ? 'bg-soft' : ''}`}
          >
            <Avatar name={display} src={profile.avatar_url} className="size-24 text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="text-muted">Коллеги увидят фото рядом с вашими задачами, блогерами и комментариями. Подойдёт квадратное или любое другое: обрежем по центру</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" loading={busy} onClick={() => input.current?.click()}>
                  <ImageUp className="size-4" strokeWidth={1.5} />
                  {profile.avatar_url ? 'Заменить фото' : 'Загрузить фото'}
                </Button>
                {profile.avatar_url && (
                  <Button variant="ghost" disabled={busy} onClick={() => setAvatar(null).then(() => toast('Фото удалено'))}>
                    <Trash2 className="size-4" strokeWidth={1.5} />
                    Удалить
                  </Button>
                )}
              </div>
            </div>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-base">Данные</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя, которое видят коллеги">
              <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && name !== profile.full_name && saveName()} />
            </Field>
            <Field label="Почта для входа">
              <Input value={profile.email ?? ''} readOnly className="text-muted focus:bg-soft focus:ring-transparent" />
            </Field>
          </div>
          <Button className="mt-4" variant="primary" loading={saving} disabled={!name.trim() || name.trim() === profile.full_name} onClick={saveName}>
            Сохранить
          </Button>
        </Card>
      </div>
    </>
  )
}
