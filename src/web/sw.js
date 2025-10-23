// Service Worker for AI Trading Platform PWA
const CACHE_NAME = 'ai-trading-platform-v1.0.0';
const urlsToCache = [
  '/',
  '/mobile-enhanced-dashboard.html',
  '/exchange-dashboard.html',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.message,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.id
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/images/checkmark.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/images/xmark.png'
      }
    ],
    requireInteraction: data.type === 'CRITICAL',
    tag: data.id
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    // Open the app to specific page
    event.waitUntil(
      clients.openWindow('/mobile-enhanced-dashboard.html#' + event.notification.data.primaryKey)
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default click - open app
    event.waitUntil(
      clients.openWindow('/mobile-enhanced-dashboard.html')
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-trades') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Handle offline actions when back online
  try {
    // Sync any pending trades, alerts, or settings changes
    const pendingActions = await getPendingActions();

    for (const action of pendingActions) {
      await syncAction(action);
    }

    console.log('Background sync completed');
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

async function getPendingActions() {
  // Get pending actions from IndexedDB
  return [];
}

async function syncAction(action) {
  // Sync individual action with server
  console.log('Syncing action:', action);
}

// Periodic background sync for real-time data
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-dashboard-data') {
    event.waitUntil(updateDashboardData());
  }
});

async function updateDashboardData() {
  // Fetch latest dashboard data in background
  try {
    // This would typically call your API
    console.log('Updating dashboard data in background');
  } catch (error) {
    console.error('Failed to update dashboard data:', error);
  }
}