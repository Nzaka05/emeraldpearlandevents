const sharp = require('sharp');
sharp('images/logo 2.png')
  .resize(32, 32)
  .toFile('public/favicon.ico', (err) => {
    if (err) console.error(err);
    else console.log('favicon created');
  });
