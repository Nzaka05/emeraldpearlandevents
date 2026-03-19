self.addEventListener('push', function(event) {
    if (!event.data) return;
    const payload = event.data.json();
    const options = {
        body: payload.body || '',
        icon: '/images/logo2.png',
        badge: '/images/logo2.png',
        vibrate: [100, 50, 100],
        data: { url: payload.url || '/portal/staff/dashboard' },
        actions: [
            { action: 'view', title: '👁 View' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };
    event.waitUntil(
        self.registration.showNotification(payload.title || 'Emerald Events', options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/portal/staff/dashboard';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url.includes('localhost') && 'focus' in client) {
                    client.focus();
                    return client.navigate(url);
                }
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
