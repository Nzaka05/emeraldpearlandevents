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

async function ensureCsrfToken(forceRefresh = false) {
    if (window.__csrfToken && !forceRefresh) {
        return window.__csrfToken;
    }

    try {
        const profileRes = await fetch('/api/v1/admin/profile', {
            method: 'GET',
            credentials: 'include'
        });

        // 1. Try to read from X-CSRF-Token header first
        let csrfToken = profileRes.headers.get('X-CSRF-Token');

        // 2. Try to read from JSON body as fallback
        if (!csrfToken) {
            const data = await profileRes.json();
            if (data && data.csrfToken) {
                csrfToken = data.csrfToken;
            }
        }

        if (csrfToken) {
            window.__csrfToken = csrfToken;
        }
    } catch (err) {
        console.error('Failed to retrieve CSRF token:', err);
    }

    return window.__csrfToken;
}

// Convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = Uint8Array.from(rawData, (_, i) => rawData.charCodeAt(i));
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
        const res = await fetch('/api/v1/admin/vapid-public-key', {
            credentials: 'same-origin'
        });
        const data = await res.json();

        if (!data.success || !data.publicKey) return;

        const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        // Ensure CSRF token exists before mutating request
        const csrfToken = await ensureCsrfToken();

        // Send subscription to backend
        await fetch('/api/v1/admin/push-subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || ''
            },
            credentials: 'same-origin',
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

// Function called by the "Enable Push" button in Settings
async function setupManualPush() {
    const btn = document.getElementById('btnEnablePush');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Push messaging is not supported by your browser.');
        if (btn) {
            btn.innerHTML = '🔔 Enable on this device';
            btn.disabled = false;
        }
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await initPushNotifications();
            Toastify && Toastify({ text: "Push Notifications Enabled!", duration: 3000, style: { background: "#1a3c2e", color: "#c9a84c" } }).showToast();
            if (btn) {
                btn.innerHTML = '✅ Active on this device';
                btn.classList.replace('btn-primary', 'btn-secondary');
            }
        } else {
            alert('Permission for notifications was denied or dismissed.');
            if (btn) {
                btn.innerHTML = '🔔 Enable on this device';
                btn.disabled = false;
            }
        }
    } catch (e) {
        console.error(e);
        alert('Failed to enable push notifications.');
        if (btn) {
            btn.innerHTML = '🔔 Enable on this device';
            btn.disabled = false;
        }
    }
}

// Run passively in background if permission already granted
document.addEventListener('DOMContentLoaded', () => {
    ensureCsrfToken().catch(() => {});

    if (Notification.permission === 'granted') {
        initPushNotifications();

        // Update Settings page button if user is there
        const btn = document.getElementById('btnEnablePush');
        if (btn) {
            btn.innerHTML = '✅ Active on this device';
            btn.disabled = true;
            btn.classList.replace('btn-primary', 'btn-secondary');
        }
    }
});
