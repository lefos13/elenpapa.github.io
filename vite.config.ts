import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import viteCompression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'
// Import vite-ssg to get augmented types for ssgOptions
import 'vite-ssg'

// Check if running vite-ssg build (set via VITE_SSG=true in package.json scripts)
const isSSGBuild = process.env.VITE_SSG === 'true'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  // Base URL for GitHub Pages / custom domain
  base: '/',
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      // Disable PWA during SSG to prevent regeneration issues with workbox paths
      disable: isSSGBuild || Boolean(isSsrBuild),
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,json,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    // Image optimizer & compression only run on client build, never during ephemeral SSR server passes
    !isSsrBuild &&
      ViteImageOptimizer({
        cache: true,
        cacheLocation: '.cache/image-optimizer',
        png: {
          quality: 80,
        },
        jpeg: {
          quality: 80,
        },
        jpg: {
          quality: 80,
        },
        webp: {
          quality: 80,
        },
      }),
    !isSsrBuild &&
      viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
      }),
    !isSsrBuild &&
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
      }),
    !isSsrBuild &&
      visualizer({
        filename: './dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    !isSsrBuild && {
      name: 'copy-backoffice-plugin',
      closeBundle() {
        try {
          const sourceDir = fileURLToPath(new URL('./backoffice/public', import.meta.url))
          const targetDir = fileURLToPath(new URL('./dist/backoffice', import.meta.url))
          if (existsSync(sourceDir)) {
            mkdirSync(targetDir, { recursive: true })
            cpSync(sourceDir, targetDir, { recursive: true })
          }
        } catch (e) {
          console.warn('Could not copy backoffice assets in closeBundle:', e)
        }
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // SSG Configuration
  ssgOptions: {
    script: 'async',
    formatting: 'none', // Disable formatting to avoid issues with Instagram embed HTML
    mock: true,
    // Include all static routes plus dynamic post routes (0-9 based on posts.json)
    includedRoutes: async (paths) => {
      // Filter out dynamic route patterns and add concrete post routes
      const staticRoutes = paths.filter((path) => !path.includes(':'))
      const postRoutes = Array.from({ length: 10 }, (_, i) => `/posts/${i}`)
      return [...staticRoutes, ...postRoutes]
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Only apply manualChunks for client build (not SSR)
        manualChunks(id) {
          // Skip chunking during SSR build
          if (process.env.VITE_SSG) return undefined

          if (id.includes('node_modules')) {
            if (id.includes('vue')) return 'vendor'
            if (id.includes('vee-validate') || id.includes('zod')) return 'forms'
            if (id.includes('@vueuse')) return 'utils'
          }
          return undefined
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
  },
}))
