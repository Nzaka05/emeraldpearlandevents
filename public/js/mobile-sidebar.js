javascript(function () {
  function initSidebar() {
    var sidebar = document.querySelector('.sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var toggleBtn = document.getElementById('menu-toggle');

    if (!sidebar) { console.warn('[Sidebar] .sidebar not found'); return; }

    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);z-index:1999;display:none;opacity:0;transition:opacity 0.3s ease';

    sidebar.classList.remove('active');
    document.body.style.overflow = '';
    overlay.style.display = 'none';
    overlay.style.opacity = '0';

    function openSidebar() {
      sidebar.classList.add('active');
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'block';
      setTimeout(function () { overlay.style.opacity = '1'; }, 10);
    }

    function closeSidebar() {
      sidebar.classList.remove('active');
      document.body.style.overflow = '';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.style.display = 'none'; }, 300);
    }

    window.toggleSidebar = function () {
      sidebar.classList.contains('active') ? closeSidebar() : openSidebar();
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.toggleSidebar();
      });
    }

    overlay.addEventListener('click', closeSidebar);
    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSidebar();
    });

    console.log('[Sidebar] ready ✅');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', initSidebar)
    : initSidebar();
})();
