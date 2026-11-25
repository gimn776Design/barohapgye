const APP_VERSION = '59';
const CACHE_PREFIX = 'barohapgye-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v${APP_VERSION}`;
const OCR_CACHE = `${CACHE_PREFIX}ocr-v${APP_VERSION}`;

const APP_SHELL = [
  './', './index.html', `./styles.css?v=${APP_VERSION}`, `./app.js?v=${APP_VERSION}`,
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  `./vendor/tesseract/tesseract.min.js?v=${APP_VERSION}`
];

const OCR_RUNTIME_ASSETS = [
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/core/tesseract-core.wasm.js', './vendor/tesseract/core/tesseract-core.wasm',
  './vendor/tesseract/core/tesseract-core-simd.wasm.js', './vendor/tesseract/core/tesseract-core-simd.wasm',
  './vendor/tesseract/core/tesseract-core-lstm.wasm.js', './vendor/tesseract/core/tesseract-core-lstm.wasm',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', './vendor/tesseract/core/tesseract-core-simd-lstm.wasm',
  './vendor/tesseract/lang/kor.traineddata.gz', './vendor/tesseract/lang/eng.traineddata.gz'
];

const absoluteUrl = (path) => new URL(path, self.registration.scope).href;
const SHELL_URLS = new Set(APP_SHELL.map(absoluteUrl));
const OCR_URLS = new Set(OCR_RUNTIME_ASSETS.map(absoluteUrl));
const APP_ROOT_URL = absoluteUrl('./');
const APP_INDEX_URL = absoluteUrl('./index.html');

function expectedContentType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.js')) return /(?:javascript|ecmascript)/i;
  if (pathname.endsWith('.css')) return /^text\/css\b/i;
  if (pathname.endsWith('.wasm')) return /^application\/wasm\b/i;
  if (pathname.endsWith('.html') || pathname.endsWith('/')) return /^text\/html\b/i;
  if (pathname.endsWith('.json') || pathname.endsWith('.webmanifest')) return /(?:json|manifest)/i;
  if (pathname.endsWith('.png')) return /^image\/png\b/i;
  if (pathname.endsWith('.svg')) return /^image\/svg\+xml\b/i;
  return null;
}

function cacheableResponse(request, response, expectedUrl) {
  if (!request || request.method !== 'GET' || !response || !response.ok
    || response.type === 'opaque' || response.redirected) return false;
  const requested = new URL(request.url);
  const expected = new URL(expectedUrl);
  const finalUrl = new URL(response.url);
  const scope = new URL(self.registration.scope);
  if (requested.href !== expected.href || finalUrl.href !== expected.href) return false;
  if (finalUrl.origin !== scope.origin || !finalUrl.pathname.startsWith(scope.pathname)) return false;
  const contentType = response.headers.get('content-type') || '';
  if (/^text\/html\b/i.test(contentType) && !/\.html$|\/$/i.test(expected.pathname)) return false;
  const requiredType = expectedContentType(expected.href);
  return !requiredType || requiredType.test(contentType);
}

async function cacheFirstAllowed(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheableResponse(request, response, request.url)) {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(APP_SHELL.map(async (path) => {
      const expectedUrl = absoluteUrl(path);
      const request = new Request(expectedUrl, { method: 'GET' });
      const response = await fetch(request);
      if (!cacheableResponse(request, response, expectedUrl)) throw new Error('Invalid app shell response');
      await cache.put(request, response.clone());
    }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'BAROHAPGYE_ACTIVATE_UPDATE') return;
  try { event.ports?.[0]?.postMessage({ type: 'BAROHAPGYE_ACTIVATE_UPDATE_ACK' }); } catch (_) {}
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== OCR_CACHE)
        .map((key) => caches.delete(key)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  const exactUrl = requestUrl.href;
  if (SHELL_URLS.has(exactUrl)) {
    event.respondWith(cacheFirstAllowed(request, SHELL_CACHE));
    return;
  }
  if (OCR_URLS.has(exactUrl)) {
    event.respondWith(cacheFirstAllowed(request, OCR_CACHE));
    return;
  }

  const isAppNavigation = request.mode === 'navigate' && requestUrl.search === ''
    && (exactUrl === APP_ROOT_URL || exactUrl === APP_INDEX_URL);
  if (!isAppNavigation) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (cacheableResponse(request, response, exactUrl)) {
        const cache = await caches.open(SHELL_CACHE);
        try { await cache.put(APP_INDEX_URL, response.clone()); } catch (_) {}
      }
      return response;
    } catch (_) {
      const cache = await caches.open(SHELL_CACHE);
      return (await cache.match(APP_INDEX_URL)) || (await cache.match(APP_ROOT_URL)) || Response.error();
    }
  })());
});
