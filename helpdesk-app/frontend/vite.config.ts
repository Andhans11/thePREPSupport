import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
