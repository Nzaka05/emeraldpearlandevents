const https = require('https');
const http = require('http');
const { createSyncHeaders } = require('../../staff-system/middleware/syncAuth');

async function syncStaffToOperations(action, staffData) {
  const baseUrl = process.env.STAFF_SYSTEM_BASE_URL || 
    'http://localhost:3001';
  const syncSecret = process.env.SYNC_SECRET;
  
  const payload = JSON.stringify({
    action,
    staff: {
      name: staffData.name,
      email: staffData.email,
      phone: staffData.phone || '',
      photo: '' // exclude photo to avoid payload size issues
    }
  });
  
  const url = new URL('/internal/sync-staff', baseUrl);
  const lib = url.protocol === 'https:' ? https : http;
  
  return new Promise((resolve) => {
    const body = JSON.parse(payload);
    const hmacHeaders = createSyncHeaders(syncSecret, body);
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        ...hmacHeaders,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      resolve({ status: res.statusCode });
    });
    
    req.on('error', (err) => {
      // Sync failure should NOT break main admin operations
      console.warn('Staff sync warning:', err.message);
      resolve({ error: err.message });
    });
    
    req.setTimeout(8000, () => {
      req.destroy();
      console.warn('Staff sync timeout');
      resolve({ error: 'timeout' });
    });
    
    req.write(payload);
    req.end();
  });
}

module.exports = { syncStaffToOperations };
