const sharp = require('sharp');
const path = require('path');

sharp(path.join(__dirname, 'public/logo2.png'))
    .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(__dirname, 'public/logo2_email.png'))
    .then(info => console.log('Resized successfully:', info))
    .catch(err => console.error('Resize error:', err));