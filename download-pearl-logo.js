const https = require('https');
const fs = require('fs');
const url = 'https://i.ibb.co/0R6f9BCB/pearl-logo.png';
const dest = 'staff-system/public/images/pearl-logo.png';

https.get(url, (res) => {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => { file.close(); console.log('Downloaded!'); });
}).on('error', (err) => console.error(err.message));
