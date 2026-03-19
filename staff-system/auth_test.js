const http = require('http');

const postData = JSON.stringify({
    email: 'teststaff@emerald.com',
    password: 'TestStaff123!'
});

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/portal/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers, null, 2)}`);
        console.log(`BODY: ${rawData}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
