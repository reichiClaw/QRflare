import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

import { buildInfo } from './scripts/build-info';

/**
 * Emits a small service worker for the client build that pre-caches the
 * fingerprinted application shell. API routes are deliberately excluded so QR
 * payloads are never written to the cache.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'edgeqr-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (this.environment.name !== 'client') return;
      const precache = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((name) => !name.endsWith('.map') && !name.endsWith('_headers'))
        .map((name) => `/${name}`);
      precache.push('/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png');
      const source = `/* EdgeQR Studio service worker (generated at build time) */
const CACHE = 'edgeqr-${buildInfo.version}-${buildInfo.commit}';
const PRECACHE = ${JSON.stringify([...new Set(precache)])};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API responses or dynamic redirects: they may contain QR payloads.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/r/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.pathname.startsWith('/assets/')) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare({ viteEnvironment: { name: 'worker' } }), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __APP_COMMIT__: JSON.stringify(buildInfo.commit),
    __APP_BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
