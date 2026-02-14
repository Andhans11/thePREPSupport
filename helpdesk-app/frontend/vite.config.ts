import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Copy vercel.json and 404.html into dist so Vercel applies SPA config and serves app on 404
    {
      name: 'vercel-spa-fallback',
      closeBundle() {
        const outDir = resolve(__dirname, 'dist')
        const vercelJson = resolve(__dirname, 'vercel.json')
        if (existsSync(vercelJson)) {
          copyFileSync(vercelJson, resolve(outDir, 'vercel.json'))
        }
        copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
      },
    },
  ],
  server: {
    port: 5173,
  },
})
