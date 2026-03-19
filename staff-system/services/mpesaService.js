const axios = require('axios');

const getAccessToken = async () => {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const env = process.env.MPESA_ENVIRONMENT || 'sandbox';
    const url = env === 'production'
        ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
        : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const res = await axios.get(url, { headers: { Authorization: `Basic ${auth}` } });
    return res.data.access_token;
};

const b2cPayment = async ({ phone, amount, assignmentId, staffPaymentId, remarks }) => {
    const env = process.env.MPESA_ENVIRONMENT || 'sandbox';
    const url = env === 'production'
        ? 'https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest'
        : 'https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest';

    // Normalize phone: 07XXXXXXXX -> 2547XXXXXXXX
    let normalizedPhone = String(phone).replace(/\s+/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1);
    if (normalizedPhone.startsWith('+')) normalizedPhone = normalizedPhone.slice(1);

    const token = await getAccessToken();

    const payload = {
        OriginatorConversationID: `EP-${assignmentId}-${staffPaymentId}-${Date.now()}`,
        InitiatorName: process.env.MPESA_B2C_INITIATOR_NAME,
        SecurityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
        CommandID: 'BusinessPayment',
        Amount: Math.round(amount),
        PartyA: process.env.MPESA_B2C_SHORT_CODE,
        PartyB: normalizedPhone,
        Remarks: remarks || 'Staff Payment',
        QueueTimeOutURL: process.env.MPESA_B2C_QUEUE_TIMEOUT_URL,
        ResultURL: process.env.MPESA_B2C_RESULT_URL,
        Occasion: `${assignmentId}|${staffPaymentId}`
    };

    const res = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return res.data;
};

module.exports = { b2cPayment };