// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD.EJS — JS PATCH
// Replace the entire loadDashboard function with this version.
// Changes:
//   1. Countdown now uses data.nextEvent (server-computed) instead of guessing
//      from recentEvents[0] — fixes the "—" days display.
//   2. Payment methods section rendered from data.paymentMethods (live from
//      admin PricingSettings — updates whenever admin saves rates).
//   3. totalPaid / totalInvoiced used correctly for progress bar bottom labels.
// ─────────────────────────────────────────────────────────────────────────────

const escapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => {
        switch (tag) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case "'": return '&#39;';
            case '"': return '&quot;';
            default: return tag;
        }
    });
};

const sanitizeClassName = (str) => {
    if (!str) return 'fa-money-bill';
    return str.replace(/[^a-zA-Z0-9_-]/g, '');
};

const safeGet = (obj, key) => {
    if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
    }
    return obj && Object.prototype.hasOwnProperty.call(obj, key) ? Reflect.get(obj, key) : undefined;
};

const loadDashboard = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const ssoRef = urlParams.get('ref');
    if (ssoRef) {
        localStorage.setItem('portal_refresh_token', ssoRef);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
        const res = await fetch('/client/api/dashboard');
        if (!res.ok) {
            if (res.status === 401) window.location.href = '/client/login';
            return;
        }
        const json = await res.json();
        const data = json.data;

        // ── Metric cards ──────────────────────────────────────────────────────
        document.getElementById('metric-active').textContent    = data.active    ?? 0;
        document.getElementById('metric-upcoming').textContent  = data.upcoming  ?? 0;
        document.getElementById('metric-completed').textContent = data.completed ?? 0;

        if (data.active > 0) {
            document.getElementById('live-indicator').classList.remove('hidden');
            document.getElementById('active-label').textContent = 'live now';
        }
        if (data.upcoming > 0) {
            document.getElementById('upcoming-label').textContent = 'scheduled';
        }

        // ── Outstanding balance ───────────────────────────────────────────────
        const bal   = data.outstandingBalance || 0;
        const balEl = document.getElementById('metric-balance');
        balEl.textContent = formatKSh(bal);
        if (bal > 0) {
            balEl.classList.add('text-amber-500');
            document.getElementById('balance-label').textContent = 'due — view invoices';
        } else {
            balEl.classList.add('text-emerald-600');
            document.getElementById('balance-label').textContent = 'all settled';
        }

        // ── Payment progress bar ──────────────────────────────────────────────
        const totalInvoiced = data.totalInvoiced || 0;
        const totalPaid     = data.totalPaid     || 0;
        if (totalInvoiced > 0) {
            const pct = Math.min(100, Math.round((totalPaid / totalInvoiced) * 100));
            document.getElementById('payment-progress-section').classList.remove('hidden');
            document.getElementById('progress-bar').style.width = pct + '%';
            document.getElementById('progress-label').textContent =
                `${pct}% paid — KSh ${totalPaid.toLocaleString('en-KE')} of KSh ${totalInvoiced.toLocaleString('en-KE')}`;
            document.getElementById('progress-outstanding').textContent = formatKSh(bal) + ' outstanding';

            // Update bottom labels (paid / outstanding) correctly
            const paidLabel = document.querySelector('#payment-progress-section .flex.justify-between span:first-child');
            const outstandingLabel = document.querySelector('#payment-progress-section .flex.justify-between span:last-child');
            if (paidLabel) paidLabel.textContent = formatKSh(totalPaid) + ' paid';
            if (outstandingLabel) outstandingLabel.textContent = formatKSh(bal) + ' outstanding';
        }

        // ── Payment methods (live from admin PricingSettings) ─────────────────
        const methods = data.paymentMethods || [];
        if (methods.length > 0) {
            document.getElementById('payment-methods-section').classList.remove('hidden');
            const methodsList = document.getElementById('payment-methods-list');
            methodsList.innerHTML = '';
            methods.forEach(m => {
                const iconClass = sanitizeClassName(m.icon);
                const name = m.name || '';
                const details = m.details || '';
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100';
                
                const iconContainer = document.createElement('div');
                iconContainer.className = 'w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0';
                
                const icon = document.createElement('i');
                icon.className = 'fas ' + iconClass + ' text-emerald-600 text-sm';
                iconContainer.appendChild(icon);
                
                const textContainer = document.createElement('div');
                textContainer.className = 'min-w-0';
                
                const nameP = document.createElement('p');
                nameP.className = 'text-sm font-semibold text-gray-800';
                nameP.textContent = name;
                
                const detailsP = document.createElement('p');
                detailsP.className = 'text-xs text-gray-500 mt-0.5 break-words';
                detailsP.textContent = details;
                
                textContainer.appendChild(nameP);
                textContainer.appendChild(detailsP);
                
                itemDiv.appendChild(iconContainer);
                itemDiv.appendChild(textContainer);
                
                methodsList.appendChild(itemDiv);
            });
        }

        // ── Session label ─────────────────────────────────────────────────────
        document.getElementById('last-seen').textContent = 'Session active · ' +
            new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });

        // ── Countdown — FIX: use server-computed nextEvent ────────────────────
        // Previously used recentEvents[0] which is sorted desc (most recent first)
        // and might be a past event. Server now returns the actual next future event.
        if (data.nextEvent && data.nextEvent.date) {
            const evDate = new Date(data.nextEvent.date);
            const today  = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));
            if (diff >= 0) {
                document.getElementById('countdown-block').classList.remove('hidden');
                document.getElementById('countdown-days').textContent = diff;
                document.getElementById('countdown-label').textContent =
                    diff === 0 ? 'TODAY!' : diff === 1 ? 'day — tomorrow!' : 'days';
            }
        }

        // ── Events list ───────────────────────────────────────────────────────
        const list   = document.getElementById('events-list');
        list.innerHTML = '';
        const events = data.recentEvents || [];
        document.getElementById('events-count').textContent =
            events.length + ' event' + (events.length !== 1 ? 's' : '');

        if (events.length === 0) {
            const noEventsLi = document.createElement('li');
            noEventsLi.className = 'py-10 text-center text-sm text-gray-400';
            noEventsLi.textContent = 'No events found. Your bookings will appear here.';
            list.appendChild(noEventsLi);
            return;
        }

        // ── Timeline: first non-completed event ───────────────────────────────
        const featured = events.find(e => !['COMPLETED', 'FINANCE_SETTLED'].includes(e.status)) || events[0];

        if (featured && featured.status !== 'FINANCE_SETTLED') {
            const statusInfo = safeGet(STATUS_MAP, featured.status) || {};
            document.getElementById('timeline-section').classList.remove('hidden');
            document.getElementById('timeline-event-name').textContent  = featured.title || 'Your Event';
            document.getElementById('timeline-event-date').textContent  = featured.date
                ? new Date(featured.date).toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
                : '';
            const badge = document.getElementById('timeline-badge');
            badge.textContent  = statusInfo.label || featured.status;
            badge.className    = 'text-xs font-bold px-3 py-1 rounded-full ' + (statusInfo.badge || 'bg-gray-100 text-gray-600');
            renderTimeline(featured.status);
            document.getElementById('timeline-message').textContent = safeGet(TIMELINE_MSG, featured.status) || '';
        }

        // ── Events list rows ──────────────────────────────────────────────────
        events.forEach(evt => {
            const statusObj  = safeGet(STATUS_MAP, evt.status) || { label: evt.status || 'Pending', color: 'bg-gray-100 text-gray-600' };
            const isFinished = ['COMPLETED', 'FINANCE_SETTLED'].includes(evt.status);
            const dateStr    = evt.date
                ? new Date(evt.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—';
            
            const title = evt.title || 'Private Event';
            const location = evt.location || '';
            const id = evt._id || '';

            const li = document.createElement('li');
            li.className = 'px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors';

            // Left side container
            const leftContainer = document.createElement('div');
            leftContainer.className = 'flex items-center gap-4 min-w-0';

            // SVG icon container
            const svgContainer = document.createElement('div');
            svgContainer.className = 'w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0';
            
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'w-5 h-5 text-emerald-500');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('d', 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z');
            svg.appendChild(path);
            svgContainer.appendChild(svg);

            // Info container
            const infoContainer = document.createElement('div');
            infoContainer.className = 'min-w-0';

            const titleP = document.createElement('p');
            titleP.className = 'text-sm font-semibold text-gray-900 truncate';
            titleP.textContent = title;

            const descP = document.createElement('p');
            descP.className = 'text-xs text-gray-400 mt-0.5';
            descP.textContent = dateStr + (location ? ' · ' + location : '');

            infoContainer.appendChild(titleP);
            infoContainer.appendChild(descP);

            leftContainer.appendChild(svgContainer);
            leftContainer.appendChild(infoContainer);

            // Right side container
            const rightContainer = document.createElement('div');
            rightContainer.className = 'flex items-center gap-4 flex-shrink-0 ml-4';

            // Status label
            const statusSpan = document.createElement('span');
            statusSpan.className = 'px-2.5 py-1 rounded-full text-xs font-semibold ' + sanitizeClassName(statusObj.color) + ' hidden sm:inline-block';
            statusSpan.textContent = statusObj.label;
            rightContainer.appendChild(statusSpan);

            // Action links/amounts container
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'flex flex-col items-end gap-1';

            const viewLink = document.createElement('a');
            viewLink.className = 'text-xs font-semibold text-emerald-600 hover:text-emerald-700';
            viewLink.href = '/client/events/' + encodeURIComponent(id);
            viewLink.textContent = 'View →';
            actionsContainer.appendChild(viewLink);

            if (evt.estimatedTotal > 0) {
                const priceP = document.createElement('p');
                priceP.className = 'text-xs text-gray-400';
                priceP.textContent = formatKSh(evt.amountPaid) + ' / ' + formatKSh(evt.estimatedTotal);
                actionsContainer.appendChild(priceP);
            }

            if (isFinished) {
                const etrLink = document.createElement('a');
                etrLink.className = 'text-xs text-blue-500 hover:text-blue-700';
                etrLink.href = '/client/etr/' + encodeURIComponent(id);
                etrLink.textContent = 'ETR Report';
                actionsContainer.appendChild(etrLink);
            }

            rightContainer.appendChild(actionsContainer);

            li.appendChild(leftContainer);
            li.appendChild(rightContainer);

            list.appendChild(li);
        });

    } catch(e) {
        console.error('Dashboard load failed:', e);
    }
};
