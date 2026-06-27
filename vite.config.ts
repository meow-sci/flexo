import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { ksaAssets } from './vite/ksaAssets'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Served under https://meow.science.fail/flexo/ in production; also used in dev.
  base: '/flexo/',
  experimental: {
    bundledDev: true,
  },
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
    // Expose KSA_ASSETS_DIR (the flexo-private-assets `assets/` tree the ksaAssets
    // plugin serves) to tests on process.env, so real-asset tests read the licensed
    // GLB/XML from the private repo instead of a gitignored thirdparty/ checkout.
    // Absent (e.g. open-source CI without the private repo) ⇒ those tests skip.
    env: { KSA_ASSETS_DIR: loadEnv(mode, process.cwd(), '').KSA_ASSETS_DIR ?? '' },
  },
  server: {
    host: '0.0.0.0',
  },
}))
