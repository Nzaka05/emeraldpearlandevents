/**
 * Emerald Staff System - Persistent Notification Manager
 */

(function () {
  const STORAGE_KEY = 'emerald_notifications';
  const MAX_STORED = 20;
  const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  function getStored() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function setStored(notifications) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      // Fail silently if localStorage is restricted
    }
  }

  const NotificationSystem = {
    push: function (type, message, severity, actionUrl = null) {
      const n = {
        id: crypto.randomUUID(),
        type: type,
        message: message,
        severity: severity,
        timestamp: Date.now(),
        read: false,
        actionUrl: actionUrl
      };

      let stored = getStored();
      stored.unshift(n); // Add to beginning

      // Enforce limit
      if (stored.length > MAX_STORED) {
        stored = stored.slice(0, MAX_STORED);
      }

      setStored(stored);
      this.updateBadge();
    },

    getUnread: function () {
      return getStored().filter(n => !n.read);
    },

    markRead: function (id) {
      let stored = getStored();
      let changed = false;
      const now = Date.now();

      stored = stored.filter(n => {
        if (n.id === id) {
          n.read = true;
          changed = true;
        }
        // Discard if read AND older than 30 mins
        if (n.read && (now - n.timestamp > EXPIRY_MS)) {
          return false;
        }
        return true;
      });

      if (changed) {
        setStored(stored);
        this.updateBadge();
      }
    },

    clearExpired: function () {
      let stored = getStored();
      const now = Date.now();
      const initialLength = stored.length;

      stored = stored.filter(n => {
        return (now - n.timestamp) < EXPIRY_MS;
      });

      if (stored.length !== initialLength) {
        setStored(stored);
      }
    },

    updateBadge: function () {
      const badges = document.querySelectorAll('#notification-badge');
      if (badges.length) {
        const unreadCount = this.getUnread().length;
        badges.forEach(badge => {
          badge.textContent = unreadCount;
          badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        });
      }
    },

    showPending: function () {
      const unread = this.getUnread();
      if (!unread.length) return;

      // Show up to 3 unread toasts
      const toShow = unread.slice(0, 3);
      
      toShow.forEach((n, index) => {
        setTimeout(() => {
          this.renderToast(n);
        }, index * 400); // Stagger 400ms apart
      });
    },

    renderToast: function (notification) {
      const container = document.getElementById('toast-container') || this.createToastContainer();
      
      const toast = document.createElement('div');
      
      // Determine severity colors based on user spec
      let bgColor, borderColor, textColor, icon;
      switch (notification.severity) {
        case 'success':
          bgColor = 'rgba(16, 185, 129, 0.15)';
          borderColor = 'rgba(16, 185, 129, 0.3)';
          textColor = '#10b981'; // emerald-500
          icon = 'fa-circle-check';
          break;
        case 'warning':
          bgColor = 'rgba(245, 158, 11, 0.15)';
          borderColor = 'rgba(245, 158, 11, 0.3)';
          textColor = '#f59e0b'; // amber-500
          icon = 'fa-triangle-exclamation';
          break;
        case 'critical':
          bgColor = 'rgba(239, 68, 68, 0.15)';
          borderColor = 'rgba(239, 68, 68, 0.3)';
          textColor = '#ef4444'; // red-500
          icon = 'fa-circle-xmark';
          break;
        case 'info':
        default:
          bgColor = 'rgba(59, 130, 246, 0.15)';
          borderColor = 'rgba(59, 130, 246, 0.3)';
          textColor = '#3b82f6'; // blue-500
          icon = 'fa-circle-info';
          break;
      }

      toast.style.cssText = `
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 18px;
        border-radius: 12px;
        font-size: 0.84rem;
        font-weight: 500;
        background: ${bgColor};
        border: 1px solid ${borderColor};
        color: ${textColor};
        animation: toastIn 0.35s ease-out;
        max-width: 380px;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transform: translateX(0);
        transition: transform 0.2s ease, opacity 0.2s ease;
        touch-action: pan-y;
      `;

      const iconEl = document.createElement('i');
      iconEl.className = 'fa-solid ' + icon;
      toast.appendChild(iconEl);

      const msgSpan = document.createElement('span');
      msgSpan.style.flexGrow = '1';
      msgSpan.textContent = notification.message;
      toast.appendChild(msgSpan);

      if (notification.actionUrl) {
        const actionLink = document.createElement('a');
        actionLink.href = notification.actionUrl;
        actionLink.style.marginLeft = 'auto';
        actionLink.style.color = 'inherit';
        actionLink.style.textDecoration = 'underline';
        actionLink.style.fontSize = '0.75rem';
        actionLink.textContent = 'View';
        toast.appendChild(actionLink);
      }

      // Swipe to dismiss logic
      let startX = 0;
      let currentX = 0;

      toast.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        toast.style.transition = 'none';
      }, { passive: true });

      toast.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX - startX;
        if (currentX > 0) { // Only swipe right
          toast.style.transform = `translateX(${currentX}px)`;
          toast.style.opacity = 1 - (currentX / window.innerWidth);
        }
      }, { passive: true });

      toast.addEventListener('touchend', () => {
        toast.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        if (currentX > 100) {
          this.dismissToast(toast, notification.id);
        } else {
          toast.style.transform = 'translateX(0)';
          toast.style.opacity = '1';
        }
      });

      // Desktop click to dismiss
      toast.addEventListener('click', (e) => {
        // Prevent dismissal if clicking action link
        if (e.target.tagName !== 'A') {
            this.dismissToast(toast, notification.id);
        }
      });

      container.appendChild(toast);

      // Auto dismiss logic
      if (notification.severity !== 'critical') {
        const timeout = notification.severity === 'warning' ? 10000 : 5000;
        setTimeout(() => {
          if (document.body.contains(toast)) {
            this.dismissToast(toast, notification.id);
          }
        }, timeout);
      }
    },

    dismissToast: function (toastEl, id) {
      toastEl.style.animation = 'toastOut 0.35s ease forwards';
      setTimeout(() => {
        if (document.body.contains(toastEl)) {
          toastEl.remove();
        }
      }, 350);
      this.markRead(id);
    },

    createToastContainer: function () {
      const container = document.createElement('div');
      container.id = 'toast-container';
      
      // Check if mobile for top-center, otherwise top-right
      const isMobile = window.innerWidth <= 900;
      
      container.style.cssText = `
        position: fixed;
        top: ${isMobile ? '20px' : '72px'};
        ${isMobile ? 'left: 50%; transform: translateX(-50%); width: 90%; max-width: 400px;' : 'right: 16px;'}
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
      return container;
    }
  };

  // Initialization
  NotificationSystem.clearExpired();
  
  // Expose to window
  window.NotificationSystem = NotificationSystem;
})();
