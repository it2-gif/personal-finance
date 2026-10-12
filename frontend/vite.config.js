import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = globalThis.process?.env?.BACKEND_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    },
    allowedHosts: [
      'localhost',
      'spend-wise.up.railway.app',
      globalThis.process?.env?.RAILWAY_PUBLIC_DOMAIN || 'localhost',
    ],
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
