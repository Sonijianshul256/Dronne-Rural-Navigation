import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({ 
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Dronne RuralNav',
        short_name: 'RuralNav',
        description: 'Offline navigation with sensor-fusion dead reckoning',
        theme_color: '#854d0e',
        background_color: '#fafaf9',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Cache the app shell (JS, CSS, HTML, Fonts)
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Don't cache the map tiles here; offlineMapService.ts handles that manually via Cache API
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
})