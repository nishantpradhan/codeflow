import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import sveltePreprocess from 'svelte-preprocess'

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess({
        typescript: {
          compilerOptions: {
            dev: true
          }
        }
      })
    })
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.svelte']
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:5174',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist/ui',
    emptyOutDir: true
  }
})
