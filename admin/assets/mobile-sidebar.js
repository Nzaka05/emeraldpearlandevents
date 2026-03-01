(function () {
  function initSidebar() {
    var sidebar = document.querySelector('.sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var toggleBtn = document.getElementById('menu-toggle');

    if (!sidebar) {
      console.warn('[Sidebar] .sidebar element not found');
      return;
    }

    // Inject overlay styles directly — no external CSS dependency
    if (overlay) {
      overlay.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100vw',
        'height:100vh',
        'background:rgba(0,0,0,0.55)',
        'z-index:1999',
        'display:none',
        'opacity:0',
        'transition:opacity 0.3s ease'
      ].join(';');
    }

    // Force clean state on every page load
    sidebar.classList.remove('active');
    document.body.style.overflow = '';
    if (overlay) {
      overlay.style.display = 'none';
      overlay.style.opacity = '0';
    }

    function openSidebar() {
      sidebar.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (overlay) {
        overlay.style.display = 'block';
        setTimeout(function () {
          overlay.style.opacity = '1';
        }, 10);
      }
      console.log('[Sidebar] opened');
    }

    function closeSidebar() {
      sidebar.classList.remove('active');
      document.body.style.overflow = '';
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(function () {
          overlay.style.display = 'none';
        }, 300);
      }
      console.log('[Sidebar] closed');
    }

    // Expose globally for any inline onclick fallback
    window.toggleSidebar = function () {
      if (sidebar.classList.contains('active')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    };

    // Attach to toggle button
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.toggleSidebar();
      });
    } else {
      console.warn('[Sidebar] #menu-toggle button not found');
    }

    // Click overlay to close
    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }

    // Close when any nav link is tapped
    var navLinks = sidebar.querySelectorAll('a');
    navLinks.forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });

    // Escape key closes sidebar
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSidebar();
    });

    console.log('[Sidebar] initialized successfully');
    console.log('[Sidebar] sidebar el:', sidebar);
    console.log('[Sidebar] overlay el:', overlay);
    console.log('[Sidebar] toggle btn:', toggleBtn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }
})();
