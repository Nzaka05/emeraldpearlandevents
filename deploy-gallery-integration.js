const fs   = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname);

// ── 1. Patch adminRoutes.js with public endpoints ──────────────────────────
const routesPath = path.normalize(path.join(baseDir, 'server', 'routes', 'adminRoutes.js'));
if (!routesPath.startsWith(baseDir + path.sep)) {
  throw new Error('Path traversal detected');
}
let routes = fs.readFileSync(routesPath, 'utf8');

const PUBLIC_ROUTES = "\n// \u2500\u2500 PUBLIC (no auth) endpoints for homepage \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n// GET /api/admin/public/gallery\nrouter.get('/public/gallery', async (req, res) => {\n    try {\n        const gallery = await Gallery.find()\n            .sort({ order: 1, uploadedAt: -1 })\n            .limit(9)\n            .lean();\n        res.json({ success: true, gallery });\n    } catch (err) {\n        res.status(500).json({ success: false, message: 'Error fetching gallery' });\n    }\n});\n\n// GET /api/admin/public/testimonials\nrouter.get('/public/testimonials', async (req, res) => {\n    try {\n        const Testimonial = require('../models/Testimonial');\n        const testimonials = await Testimonial.find({\n            $or: [{ displayOnWebsite: true }, { status: 'approved' }]\n        })\n        .sort({ createdAt: -1 })\n        .limit(6)\n        .lean();\n        res.json({ success: true, testimonials });\n    } catch (err) {\n        res.status(500).json({ success: false, message: 'Error fetching testimonials' });\n    }\n});\n";
const MARKER = '// GET /api/admin/gallery';

if (routes.includes('/public/gallery')) {
  console.log('adminRoutes.js already patched — skipping');
} else {
  // Insert before the existing gallery route
  if (routes.includes(MARKER)) {
    routes = routes.replace(MARKER, PUBLIC_ROUTES + '\n' + MARKER);
  } else {
    // Append before module.exports or at end
    routes = routes + '\n' + PUBLIC_ROUTES;
  }
  fs.writeFileSync(routesPath, routes, 'utf8');
  console.log('Patched: server/routes/adminRoutes.js — added public gallery + testimonials endpoints');
}

// ── 2. Patch index.html to load live data ──────────────────────────────────
const indexPath = path.normalize(path.join(baseDir, 'index.html'));
if (!indexPath.startsWith(baseDir + path.sep)) {
  throw new Error('Path traversal detected');
}
let html = fs.readFileSync(indexPath, 'utf8');

const INJECT_JS = "\n  // \u2500\u2500 LIVE GALLERY from database \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  (async function loadGallery() {\n    try {\n      const res  = await fetch('/api/v1/admin/public/gallery');\n      const data = await res.json();\n      if (!data.success || !data.gallery.length) return;\n\n      const grid = document.querySelector('.port-grid');\n      if (!grid) return;\n\n      // Keep existing placeholder structure, replace backgrounds with real images\n      const items = grid.querySelectorAll('.port-item');\n      data.gallery.forEach((item, i) => {\n        if (!items[i]) return;\n        const bg = items[i].querySelector('.port-bg');\n        if (bg) {\n          bg.style.background = 'none';\n          bg.style.backgroundImage = `url('${item.url}')`;\n          bg.style.backgroundSize  = 'cover';\n          bg.style.backgroundPosition = 'center';\n          // Remove placeholder icon if present\n          const ph = bg.querySelector('.port-ph');\n          if (ph) ph.style.display = 'none';\n        }\n        // Update overlay label\n        const label = items[i].querySelector('.port-label');\n        if (label && item.caption) {\n          const small = label.querySelector('small');\n          if (small && item.eventType) small.textContent = item.eventType;\n          // Set the main label text (keep the small tag)\n          label.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = item.caption; });\n        }\n      });\n    } catch (e) { /* silently fall back to placeholders */ }\n  })();\n\n  // \u2500\u2500 LIVE TESTIMONIALS from database \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  (async function loadTestimonials() {\n    try {\n      const res  = await fetch('/api/v1/admin/public/testimonials');\n      const data = await res.json();\n      if (!data.success || !data.testimonials.length) return;\n\n      const grid = document.querySelector('.testi-grid');\n      if (!grid) return;\n\n      grid.innerHTML = '';\n      data.testimonials.forEach(t => {\n        const stars = '\u2605'.repeat(t.rating || 5) + '\u2606'.repeat(5 - (t.rating || 5));\n        const initials = (t.name || 'C').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);\n        const avatarHtml = t.avatar\n          ? `<img src=\"${t.avatar}\" alt=\"${t.name}\" style=\"width:42px;height:42px;border-radius:50%;object-fit:cover;\">`\n          : `<div class=\"testi-av\">${initials}</div>`;\n\n        grid.insertAdjacentHTML('beforeend', `\n          <div class=\"testi-card reveal\">\n            <div class=\"testi-quote\">&ldquo;</div>\n            <div class=\"testi-stars\">${stars}</div>\n            <p class=\"testi-text\">${t.text}</p>\n            <div class=\"testi-author\">\n              ${avatarHtml}\n              <div>\n                <div class=\"testi-name\">${t.name}</div>\n                <div class=\"testi-role\">${t.role || 'Client'}${t.eventType ? ' &middot; ' + t.eventType : ''}</div>\n              </div>\n            </div>\n          </div>`);\n      });\n\n      // Re-run scroll reveal on new elements\n      document.querySelectorAll('.testi-card.reveal').forEach(el => revObs.observe(el));\n    } catch (e) { /* silently fall back to static testimonials */ }\n  })();\n";
const INJECT_MARKER = '// Navbar scroll';

if (html.includes('loadGallery')) {
  console.log('index.html already patched — skipping');
} else {
  if (html.includes(INJECT_MARKER)) {
    html = html.replace(INJECT_MARKER, INJECT_JS + '\n  ' + INJECT_MARKER);
  } else {
    // Inject before closing </script>
    const lastScript = html.lastIndexOf('</script>');
    html = html.substring(0, lastScript) + INJECT_JS + '\n</script>' + html.substring(lastScript + 9);
  }
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Patched: index.html — live gallery + testimonials injection added');
}

console.log('\nDone! Gallery and testimonials now load live from your database.');
console.log('Upload images via your admin panel and they appear on the homepage automatically.');
