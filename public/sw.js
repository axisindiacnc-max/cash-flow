self.addEventListener('install', (event) => {
  console.log('Service Worker: Installed');
});

self.addEventListener('fetch', (event) => {
  // Pass-through for now, just needed for PWA installability
  event.respondWith(fetch(event.request));
});
