self.addEventListener('push', function (event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const title = data.title || 'Emerald Pearland Events';
            const options = {
                body: data.body || 'You have a new notification.',
                icon: data.icon || '/images/logo 2.png',
                badge: '/images/logo 2.png',
                data: data.url || '/admin/dashboard',
                vibrate: [200, 100, 200, 100, 200, 100, 200]
            };

            event.waitUntil(self.registration.showNotification(title, options));

            // Also try to send a message to open dashboard clients to play sound
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'PLAY_NOTIFICATION_SOUND' });
                });
            });

        } catch (e) {
            console.error('Push event data parsing failed:', e);
        }
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const urlToOpen = event.notification.data || '/admin/dashboard';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // First try to find a tab that's already open to the admin panel
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes('/admin/') && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // If no admin tab is found, open a new one
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});

self.addEventListener('fetch', function(event) {
    const url = event.request.url;
    if (!url.startsWith(self.location.origin)) {
        return;
    }
});
