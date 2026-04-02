const jwt = require('jsonwebtoken');
const ClientAccount = require('../models/ClientAccount');
const Booking = require('../models/Booking');

// staff-models loaded lazily — not available in all deployments
let Assignment = null;
let ClientInvoice = null;
try { Assignment = require('../../staff-system/models/Assignment'); } catch(e) { console.warn('[ClientAuth] Assignment model unavailable'); }
try { ClientInvoice = require('../../staff-system/models/ClientInvoice'); } catch(e) { console.warn('[ClientAuth] ClientInvoice model unavailable'); }

exports.protectClient = async (req, res, next) => {
    try {
        let token;
        
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.client_token) {
            token = req.cookies.client_token;
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
        }

        try {
            const decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
            req.client = decoded;
        } catch (err) {
            return res.status(401).json({ success: false, error: 'access token expired, please refresh.' });
        }

        // Update last_active asynchronously (don't block request)
        ClientAccount.findOneAndUpdate({ client_id: req.client.client_id }, { last_active: new Date() }).exec();

        next();
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Server Error' });
    }
};

exports.enforceDataOwnership = async (req, res, next) => {
    try {
        const clientId = req.client.client_id;
        
        // Check Event/Assignment Ownership
        const eventId = req.params.eventId || req.query.eventId || req.body.eventId;
        if (eventId) {
            let assignedEvent;
            try {
                assignedEvent = await Assignment.findById(eventId);
            } catch(e) {} // Ignore CastError
            
            if (!assignedEvent || assignedEvent.client_id.toString() !== clientId) {
                return res.status(403).json({ success: false, error: 'access denied' });
            }
        }

        // Check Invoice Ownership
        const invoiceId = req.params.invoiceId || req.query.invoiceId || req.body.invoiceId;
        if (invoiceId) {
            let invoice;
            try {
                invoice = await ClientInvoice.findById(invoiceId);
            } catch(e) {} // Ignore CastError
            
            if (!invoice || invoice.client_id.toString() !== clientId) {
                return res.status(403).json({ success: false, error: 'access denied' });
            }
        }

        next();
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server Error' });
    }
};
