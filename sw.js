const CACHE_NAME = 'egybev-v5'; // تغيير النسخة لتحديث الكاش
const ASSETS = [
  './',
  './index.html',
  // الموارد الخارجية
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdn-icons-png.flaticon.com/512/2942/2942813.png'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching app shell');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Strategy
self.addEventListener('fetch', (event) => {
  // استراتيجية الشبكة أولاً للملفات الأساسية (HTML, JS) لضمان التحديث
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    // استراتيجية الكاش أولاً للموارد الثابتة (صور، خطوط)
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});