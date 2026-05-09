import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import sveltePreprocess from 'svelte-preprocess'

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess({ typescript: true }),
      hot: false
    })
  ],
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [['tests/frontend/**', 'jsdom']],
    setupFiles: ['tests/setup.ts']
  }
})
