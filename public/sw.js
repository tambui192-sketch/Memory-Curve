self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '🔥 MemoryCurve: Đến giờ ôn tập!';
  const options = {
    body: data.body || 'Bạn có các thẻ ưu tiên cần ôn hôm nay để không bị quên kiến thức.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});