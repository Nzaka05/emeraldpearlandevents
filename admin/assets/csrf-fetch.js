/**
 * csrf-fetch.js
 * Shared CSRF-aware fetch helper for all Emerald Admin portal pages.
 * Depends on ensureCsrfToken() defined in push-client.js (loaded before this file).
 *
 * Usage:
 *   const res = await fetchWithCsrf('/api/v1/admin/something', { method: 'POST', ... });
 *
 * Load order in HTML:
 *   <script src="/admin/push-client.js"></script>
 *   <script src="/admin/assets/csrf-fetch.js"></script>
 */

/**
 * Fetch wrapper that:
 *  1. Calls ensureCsrfToken() to get (or lazily fetch) the current CSRF token.
 *  2. Injects X-CSRF-Token into request headers.
 *  3. On a 403 with a CSRF error body, force-refreshes the token and retries once.
 *  4. Always sets credentials: 'include' so the adminToken cookie is sent.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithCsrf(url, options = {}) {
    let csrfToken = await ensureCsrfToken();

    options.credentials = 'include';
    options.headers = options.headers || {};

    if (options.headers instanceof Headers) {
        options.headers.set('X-CSRF-Token', csrfToken || '');
    } else {
        options.headers = { ...options.headers, 'X-CSRF-Token': csrfToken || '' };
    }

    let response = await fetch(url, options);

    // If CSRF token was stale, refresh once and retry
    if (response.status === 403) {
        try {
            const clone = response.clone();
            const data = await clone.json();
            if (data && data.message && data.message.toLowerCase().includes('csrf')) {
                console.warn('[csrf-fetch] CSRF rejected — refreshing token and retrying:', url);
                csrfToken = await ensureCsrfToken(true);

                if (options.headers instanceof Headers) {
                    options.headers.set('X-CSRF-Token', csrfToken || '');
                } else {
                    options.headers['X-CSRF-Token'] = csrfToken || '';
                }

                response = await fetch(url, options);
            }
        } catch (_) { /* body not JSON — fall through */ }
    }

    return response;
}

/**
 * Show a brief dismissible toast notification.
 * Falls back gracefully if the page has no #toast-container.
 * Pages that already have their own toast() function keep using theirs.
 *
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
function showCsrfToast(message, type = 'error') {
    // If the page already has a toast() function use it
    if (typeof window.toast === 'function') {
        window.toast(message, type);
        return;
    }

    // Minimal inline toast
    const container = document.getElementById('toast-container') || (() => {
        const el = document.createElement('div');
        el.id = 'toast-container';
        el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(el);
        return el;
    })();

    const colors = {
        success: '#1a3c2e',
        error: '#7a1c1c',
        warning: '#5c4800',
        info: '#1a2e3c'
    };

    const el = document.createElement('div');
    el.style.cssText = `padding:12px 18px;border-radius:6px;color:#f5f0e8;background:${colors[type] || colors.error};font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.35);opacity:0;transition:opacity .3s;max-width:320px;`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 350);
    }, 4000);
}
