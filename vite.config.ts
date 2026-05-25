import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ksaAssets } from './vite/ksaAssets'

// https://vite.dev/config/
export default defineConfig({
  // Served under https://meow.science.fail/flexo/ in production; also used in dev.
  base: '/flexo/',
  plugins: [
    tailwindcss(),
    react(),
    ksaAssets(),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
  server: {
    host: "0.0.0.0",
  },
})
