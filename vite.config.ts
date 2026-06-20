import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { ksaAssets } from './vite/ksaAssets'

// https://vite.dev/config/
export default defineConfig({
  // Served under https://meow.science.fail/flexo/ in production; also used in dev.
  base: '/flexo/',
  plugins: [
    tailwindcss(),
    react(),
    // React Compiler. plugin-react@6 dropped the inline `babel` option, so the
    // compiler runs via @rolldown/plugin-babel using the preset that ships with
    // plugin-react (targets React 19, client-only, infer mode). Rules of React
    // are enforced at lint time by eslint-plugin-react-hooks (see .oxlintrc.json).
    babel({ presets: [reactCompilerPreset()] }),
    ksaAssets(),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
  server: {
    host: '0.0.0.0',
  },
})
