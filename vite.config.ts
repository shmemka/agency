import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// На GitHub Pages сайт живёт в подпапке /agency/ — её передаёт сборка (BASE_PATH).
// Со своим доменом или на Vercel подпапки нет, остаётся '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
})
