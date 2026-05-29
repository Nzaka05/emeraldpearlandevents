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
            if (req.originalUrl.includes('/api/')) {
                return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
            }
            return res.redirect('/client/login');
        }

        try {
            const decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
            req.client = decoded;
        } catch (err) {
            if (req.originalUrl.includes('/api/')) {
                return res.status(401).json({ success: false, error: 'access token expired, please refresh.' });
            }
            return res.redirect('/client/login');
        }

        // Update last_active asynchronously (don't block request)
        ClientAccount.findOneAndUpdate({ client_id: req.client.client_id }, { last_active: new Date() }).exec();

        next();
    } catch (err) {
        if (req.originalUrl.includes('/api/')) {
            return res.status(500).json({ success: false, error: 'Server Error' });
        }
        return res.redirect('/client/login');
    }
};

exports.enforceDataOwnership = async (req, res, next) => {
    try {
        const clientId = req.client.client_id;
        const clientIdStr = String(clientId);
        
        // Check Event/Assignment Ownership
        const eventId = req.params.eventId || req.query.eventId || req.body.eventId;
        if (eventId) {
            let bookingEvent = null;
            let assignedEvent = null;
            try {
                bookingEvent = await Booking.findOne({ _id: eventId, customerId: clientId }).select('_id').lean();
            } catch(e) {} // Ignore CastError

            if (!bookingEvent && Assignment) {
                try {
                    assignedEvent = await Assignment.findById(eventId).select('client_id').lean();
                } catch(e) {} // Ignore CastError
            }

            const assignmentClientId = assignedEvent && assignedEvent.client_id ? String(assignedEvent.client_id) : null;
            
            if (!bookingEvent && assignmentClientId !== clientIdStr) {
                if (req.originalUrl.includes('/api/')) {
                    return res.status(403).json({ success: false, error: 'access denied' });
                }
                return res.redirect('/client/dashboard');
            }
        }

        // Check Invoice Ownership
        const invoiceId = req.params.invoiceId || req.query.invoiceId || req.body.invoiceId;
        if (invoiceId) {
            let invoice;
            try {
                if (ClientInvoice) {
                    invoice = await ClientInvoice.findById(invoiceId).select('client_id clientId').lean();
                }
            } catch(e) {} // Ignore CastError

            const invoiceClientId = invoice
                ? String(invoice.client_id || invoice.clientId || '')
                : null;
            
            if (!invoice || invoiceClientId !== clientIdStr) {
                if (req.originalUrl.includes('/api/')) {
                    return res.status(403).json({ success: false, error: 'access denied' });
                }
                return res.redirect('/client/dashboard');
            }
        }

        next();
    } catch (err) {
        console.error(err);
        if (req.originalUrl.includes('/api/')) {
            return res.status(500).json({ success: false, error: 'Server Error' });
        }
        return res.redirect('/client/dashboard');
    }
};
