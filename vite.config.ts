import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // GitHub Pages serves at /BinderOS/ — base path needed for asset URLs in production.
  // Dev server uses '/' so local dev is unaffected.
  base: process.env.GITHUB_ACTIONS ? '/BinderOS/' : '/',
  // Cross-origin isolation headers required for SharedArrayBuffer (used by ONNX WASM backend).
  // RESEARCH.md Pitfall 4: without COOP/COEP the WASM backend silently falls back to single-thread.
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  plugins: [
    solid(),
    wasm(),
    topLevelAwait(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BinderOS',
        short_name: 'BinderOS',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        share_target: {
          action: '/share-target',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Precache the small binderos_core WASM but skip the 21.6MB ONNX WASM
        // (ONNX will be fetched on demand when browser LLM is activated)
        globIgnores: ['**/ort-wasm-*'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
