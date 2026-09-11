self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch (_) { data = {}; }
  if (data.type !== 'HOT_EVENT') return;

  const available = data.status === 'AVAILABLE_NOW';
  const title = available ? '🔥 Hot Event disponible' : '🔥 Nuevo Hot Event';
  const body = data.businessName && data.productName
    ? `${data.businessName}: ${data.productName}`
    : 'Hay una novedad de un negocio que seguís.';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: `hot-event-${data.hotEventId || data.businessId || 'unknown'}`,
    renotify: true,
    data: {
      businessId: data.businessId || '',
      hotEventId: data.hotEventId || '',
    },
  }));
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
