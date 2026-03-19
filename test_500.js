const axios = require('axios');
async function run() {
    try {
        const login = await axios.post('http://127.0.0.1:3001/portal/auth/login', {email:'testadmin@emerald.com', password:'TestAdmin123!'}, {headers:{'Content-Type':'application/json'}});
        const token = login.headers['set-cookie'][0].split(';')[0];
        
        const res = await axios.get('http://127.0.0.1:3001/portal/admin-staff/events/dummy/prediction', {
            headers:{ Cookie: token, 'Content-Type': 'application/json' },
            validateStatus: () => true
        });
        console.log("STATUS:", res.status);
        console.log(typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.error("SCRIPT ERROR:", e.message);
    }
}
run();
