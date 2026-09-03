import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

import { buildInfo } from './scripts/build-info.ts';

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
        .filter(
          (name) =>
            !name.endsWith('.map') && !name.startsWith('_') && !name.startsWith('.') && name !== 'sw.js',
        )
        .map((name) => `/${name}`);
      precache.push(
        '/',
        '/manifest.webmanifest',
        '/icons/icon.svg',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
      );
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
      this.emitFile({ type: 'asset', fileName: '_headers', source: staticHeaders() });
    },
  };
}

/**
 * Cloudflare Static Assets `_headers` file for the client build: a strict CSP
 * for the SPA, hardening headers and immutable caching for fingerprinted assets.
 * API responses get their headers from the Worker itself (src/worker/http.ts).
 */
function staticHeaders(): string {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY
  Cache-Control: public, max-age=0, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache
`;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: 'worker' } }),
    serviceWorkerPlugin(),
  ],
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
