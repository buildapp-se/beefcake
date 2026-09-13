import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/beefcake/',
  plugins: [
    preact(),
    VitePWA({
      // 'prompt': en ny version väntar tills användaren trycker Ladda om (UpdateBanner), aldrig mitt i ett pass
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Beefcake',
        short_name: 'Beefcake',
        description: 'Träningslogg för styrketräning',
        theme_color: '#1b2634',
        background_color: '#1b2634',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/beefcake/',
        start_url: '/beefcake/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff2}'],
        // Firebase-SDK:n laddas från gstatic vid start; utan cache startar appen inte offline
        runtimeCaching: [{
          urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\//,
          handler: 'CacheFirst',
          options: { cacheName: 'firebase-sdk', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 } }
        }, {
          // Övningsdatabasens bilder (jsDelivr, låst commit): sedda bilder finns kvar offline
          urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/yuhonas\/free-exercise-db@/,
          handler: 'CacheFirst',
          options: { cacheName: 'exercise-images', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 }, cacheableResponse: { statuses: [0, 200] } }
        }]
      }
    })
  ],
  build: {
    // Övningsdatabasen är en egen chunk på 770 kB (150 kB gzip) som bara laddas på /ovningar
    chunkSizeWarningLimit: 800,
    target: 'es2020',
    minify: 'esbuild'
  }
})