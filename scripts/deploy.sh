#!/usr/bin/env bash
# Собирает сайт и выкладывает готовые файлы в ветку gh-pages.
# GitHub Pages: Settings → Pages → Source: Deploy from a branch → gh-pages, папка / (root).
# Запуск: npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "Нет файла .env.production с адресом и ключом Supabase (образец — .env.example)" >&2
  exit 1
fi

# /agency/ — подпапка на shmemka.github.io. Со своим доменом: BASE_PATH=/ npm run deploy
export BASE_PATH="${BASE_PATH:-/agency/}"
npm run build
node scripts/brand.mjs   # название агентства из настроек — во вкладку и превью ссылок
cp dist/index.html dist/404.html   # прямые ссылки (/bloggers, старые /s/токен) открываются через 404.html
# ссылки для клиентов и блогеров (/s/?t=…, /o/?t=…) — настоящие страницы с кодом 200, чтобы мессенджеры показывали превью
mkdir -p dist/s dist/o && cp dist/index.html dist/s/index.html && cp dist/index.html dist/o/index.html
touch dist/.nojekyll

REMOTE="$(git remote get-url origin)"
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. log -1 --format=%an)" -c user.email="$(git -C .. log -1 --format=%ae)" commit -qm "Сайт из $(git -C .. rev-parse --short HEAD)"
git push -qf "$REMOTE" gh-pages
rm -rf .git
echo "Готово. Через 1–2 минуты сайт обновится на GitHub Pages"
