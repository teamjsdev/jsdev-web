const DB_NAME = 'calentitos-notifications';
const DB_VERSION = 1;

async function getProductNotificationSelection(businessId) {
  if (!businessId) return null;
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore('businesses', { keyPath: 'businessId' });
    request.onsuccess = () => {
      const db = request.result;
      const getRequest = db.transaction('businesses', 'readonly').objectStore('businesses').get(businessId);
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      getRequest.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (_) {
    return;
  }

  if (data.type !== 'HOT_EVENT') return;

  event.waitUntil((async () => {
    const selection = await getProductNotificationSelection(data.businessId);
    const productIds = selection?.productIds;

    // Older saved subscriptions have no explicit selection, so preserve
    // the existing behavior and allow every product.
    if (Array.isArray(productIds) && data.productId && !productIds.includes(data.productId)) {
      console.log('[HotCrave SW] Hot Event ignorado por selección de producto', {
        businessId: data.businessId,
        productId: data.productId,
      });
      return;
    }

    const available = data.status === 'AVAILABLE_NOW';
    const title = available ? '🔥 Hot Event disponible' : '🔥 Nuevo Hot Event';
    const body = data.businessName && data.productName
      ? `${data.businessName}: ${data.productName}`
      : 'Hay una novedad de un negocio que seguís.';

    await self.registration.showNotification(title, {
      body,
      tag: `hot-event-${data.hotEventId || data.businessId || 'unknown'}`,
      renotify: true,
      data: {
        businessId: data.businessId || '',
        hotEventId: data.hotEventId || '',
      },
    });
  })();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const businessId = event.notification.data?.businessId;
  if (!businessId) return;

  const url = `/hotcrave/b/${encodeURIComponent(businessId)}`;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openWindows => {
    const existing = openWindows.find(client => 'focus' in client);
    if (existing) {
      existing.navigate(url);
      return existing.focus();
    }
    return clients.openWindow(url);
  }));
});
