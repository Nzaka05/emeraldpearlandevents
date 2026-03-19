const http = require('http');

http.get('http://localhost:3001/staff-admin/sso-login?token=something', (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(`Body: ${data.substring(0, 100)}...`));
}).on('error', (err) => {
    console.error('Error:', err.message);
});
