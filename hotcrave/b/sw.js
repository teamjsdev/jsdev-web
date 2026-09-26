const API_BASE = 'https://hotcrave-api-staging-274560140811.southamerica-east1.run.app';
const DB_NAME = 'calentitos-notifications';
const DB_VERSION = 1;
const NOTIFICATION_SCHEDULE_KEY = '__notification_schedule__';
const DEFAULT_NOTIFICATION_START_MINUTES = 8 * 60;
const DEFAULT_NOTIFICATION_END_MINUTES = 22 * 60;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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

async function getNotificationSchedule() {
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore('businesses', { keyPath: 'businessId' });
    request.onsuccess = () => {
      const db = request.result;
      const getRequest = db.transaction('businesses', 'readonly').objectStore('businesses').get(NOTIFICATION_SCHEDULE_KEY);
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      getRequest.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

function currentMinutes(now) {
  return now.getHours() * 60 + now.getMinutes();
}

function isWithinNotificationSchedule(schedule, now = new Date()) {
  const start = Number(schedule?.notificationStartMinutes ?? DEFAULT_NOTIFICATION_START_MINUTES);
  const end = Number(schedule?.notificationEndMinutes ?? DEFAULT_NOTIFICATION_END_MINUTES);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 1439 || end < 1 || end > 1439 || start >= end) {
    return currentMinutes(now) >= DEFAULT_NOTIFICATION_START_MINUTES && currentMinutes(now) < DEFAULT_NOTIFICATION_END_MINUTES;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

async function resolveProductId(data) {
  if (data.productId) return data.productId;
  if (!data.hotEventId) return null;

  try {
    const response = await fetch(`${API_BASE}/hot-events`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const event = (payload.hotEvents || []).find(item =>
      item.hotEvent?.id === data.hotEventId ||
      item.hotEventId === data.hotEventId
    );
    return event?.hotEvent?.productId || event?.productId || event?.product?.id || null;
  } catch (error) {
    console.warn('[HotCrave SW] No se pudo resolver el producto del Hot Event', error);
    return null;
  }
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
    const schedule = await getNotificationSchedule();

    if (!isWithinNotificationSchedule(schedule)) {
      console.log('[HotCrave SW] Hot Event ignorado fuera del horario de alertas', {
        businessId: data.businessId,
        notificationStartMinutes: schedule?.notificationStartMinutes,
        notificationEndMinutes: schedule?.notificationEndMinutes,
      });
      return;
    }

    const productId = await resolveProductId(data);

    // Older saved subscriptions have no explicit selection, so preserve
    // the existing behavior and allow every product.
    if (Array.isArray(productIds) && productId && !productIds.includes(productId)) {
      console.log('[HotCrave SW] Hot Event ignorado por selección de producto', {
        businessId: data.businessId,
        productId,
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
  })());
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
