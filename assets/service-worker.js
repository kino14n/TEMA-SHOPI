// Service Worker para Shopify Theme
// Versión: 1.0.0
// Estrategia: Cache First para assets, Network First para páginas

const CACHE_VERSION = 'shopify-theme-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const MAX_DYNAMIC_CACHE_SIZE = 50;

// Recursos estáticos a cachear en instalación
const STATIC_ASSETS = [
  // CSS crítico
  '/cdn/shop/t/*/assets/base.css',
  
  // JavaScript esencial
  '/cdn/shop/t/*/assets/shrine.null.js',
  '/cdn/shop/t/*/assets/secondary.js',
  
  // Fuentes (si son locales)
  // '/cdn/shop/t/*/assets/font.woff2',
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Cacheando recursos estáticos');
        // No cachear en instalación para evitar errores
        // Los recursos se cachearán en la primera petición
        return Promise.resolve();
      })
      .then(() => self.skipWaiting()) // Activar inmediatamente
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              // Eliminar cachés antiguos
              return cacheName.startsWith('shopify-theme-') && 
                     cacheName !== STATIC_CACHE && 
                     cacheName !== DYNAMIC_CACHE;
            })
            .map(cacheName => {
              console.log('[SW] Eliminando caché antiguo:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim()) // Tomar control inmediatamente
  );
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo cachear peticiones GET
  if (request.method !== 'GET') {
    return;
  }
  
  // No cachear peticiones a Shopify admin o checkout
  if (url.pathname.includes('/admin') || 
      url.pathname.includes('/checkout') ||
      url.pathname.includes('/cart/add') ||
      url.pathname.includes('/cart/update')) {
    return;
  }
  
  // Estrategia según tipo de recurso
  if (isStaticAsset(url)) {
    // Cache First para assets estáticos
    event.respondWith(cacheFirst(request));
  } else if (isImage(url)) {
    // Cache First para imágenes
    event.respondWith(cacheFirst(request));
  } else {
    // Network First para páginas HTML
    event.respondWith(networkFirst(request));
  }
});

// Estrategia Cache First
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    console.log('[SW] Sirviendo desde caché:', request.url);
    return cached;
  }
  
  try {
    const response = await fetch(request);
    
    // Solo cachear respuestas exitosas
    if (response.status === 200) {
      const clonedResponse = response.clone();
      cache.put(request, clonedResponse);
      console.log('[SW] Cacheando nuevo recurso:', request.url);
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Error en fetch:', error);
    // Retornar respuesta offline si existe
    return cache.match(request) || new Response('Offline', { status: 503 });
  }
}

// Estrategia Network First
async function networkFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    const response = await fetch(request);
    
    // Cachear respuesta exitosa
    if (response.status === 200) {
      const clonedResponse = response.clone();
      cache.put(request, clonedResponse);
      
      // Limitar tamaño del caché dinámico
      limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network falló, intentando caché:', request.url);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    // Página offline básica
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Sin conexión</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
              text-align: center;
              padding: 20px;
            }
            .offline-message {
              max-width: 400px;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 16px;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #000;
              color: #fff;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
            }
          </style>
        </head>
        <body>
          <div class="offline-message">
            <h1>📱 Sin conexión</h1>
            <p>No hay conexión a internet. Por favor, verifica tu conexión e intenta nuevamente.</p>
            <button onclick="location.reload()">Reintentar</button>
          </div>
        </body>
      </html>
    `, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/html'
      })
    });
  }
}

// Limitar tamaño del caché
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxSize) {
    // Eliminar las entradas más antiguas
    const keysToDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
    console.log(`[SW] Limpiado caché ${cacheName}, eliminadas ${keysToDelete.length} entradas`);
  }
}

// Verificar si es un asset estático
function isStaticAsset(url) {
  return url.pathname.match(/\.(css|js|woff2?|ttf|eot)$/);
}

// Verificar si es una imagen
function isImage(url) {
  return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)$/);
}

// Mensaje de Service Worker
self.addEventListener('message', event => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data.action === 'clearCache') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});
