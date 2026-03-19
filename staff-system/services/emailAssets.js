const fs = require('fs');
const path = require('path');

let logoBase64 = '';

try {
    const logoPath = path.join(__dirname, '..', 'public', 'logo2_email.png');
    if (fs.existsSync(logoPath)) {
        logoBase64 = fs.readFileSync(logoPath).toString('base64');
    }
} catch (err) {
    console.error('Failed to load email logo asset:', err.message);
}

module.exports = { logoBase64 };
