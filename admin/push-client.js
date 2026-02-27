// Web Push Client Logic

// Simple fallback sound generator if no MP3 is provided
function playDefaultChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 1); // Drop to A4

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 1);
    } catch (e) {
        console.log("AudioContext not supported or blocked");
    }
}

function playNotificationSound() {
    // Attempt to play a custom sound, fallback to Web Audio API
    const audio = new Audio('/admin/notification.mp3');
    audio.play().catch(e => {
        console.log("Could not play custom audio, using fallback chime", e);
        playDefaultChime();
    });
}

// Convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Initialize Push Notifications
async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push messaging isn\'t supported.');
        return;
    }

    try {
        // Register Service Worker
        const registration = await navigator.serviceWorker.register('/admin/sw.js');
        console.log('ServiceWorker registered:', registration);

        // Request Permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission not granted');
            return;
        }

        // Get VAPID public key from backend
        const res = await fetch('/api/admin/vapid-public-key');
        const data = await res.json();

        if (!data.success || !data.publicKey) return;

        const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        // Send subscription to backend
        await fetch('/api/admin/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription })
        });

        console.log('Subscribed to push notifications');

    } catch (error) {
        console.error('Error in push init:', error);
    }
}

// Listen for messages from the service worker to play sound while app is open
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PLAY_NOTIFICATION_SOUND') {
            playNotificationSound();
        }
    });
}

// Ensure user interaction has happened before calling init
document.addEventListener('DOMContentLoaded', () => {
    // A quick check if permission is already granted so we don't have to wait for click
    if (Notification.permission === 'granted') {
        initPushNotifications();
    } else {
        // Many browsers require user gesture to show permission prompt
        document.body.addEventListener('click', initPushNotifications, { once: true });
    }
});
