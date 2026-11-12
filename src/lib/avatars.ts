import { supabase } from './supabase'

export const AVATAR_BUCKET = 'avatars'
const SIZE = 512

/** Квадрат по центру, до 512×512, webp: фото весит десятки килобайт, а не мегабайты с телефона */
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
export function avatarPath(url: string | null | undefined) {
  const i = url?.indexOf(`/${AVATAR_BUCKET}/`) ?? -1
  return url && i >= 0 ? decodeURIComponent(url.slice(i + AVATAR_BUCKET.length + 2).split('?')[0]) : null
}

/** Загружает фото в папку и возвращает публичную ссылку. Ошибки — понятным текстом */
export async function uploadAvatar(folder: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Нужна картинка: JPG, PNG или WebP')
  const blob = await squareImage(file)
  const path = `${folder}/${Date.now()}.webp`
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('В базе ещё нет хранилища для фото: нужно запустить миграцию 003_avatars.sql')
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new Error('Нет прав на загрузку фото: нужно запустить миграцию 005_blogger_avatars.sql')
    throw error
  }
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function removeAvatar(url: string | null | undefined) {
  const path = avatarPath(url)
  if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path])
}
