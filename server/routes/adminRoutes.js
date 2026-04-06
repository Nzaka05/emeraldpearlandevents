const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { syncStaffToOperations } = require('../utils/staffSync');
const Admin = require('../models/Admin');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const AdminNotification = require('../models/AdminNotification');
const Staff = require('../models/Staff');
const Gallery = require('../models/Gallery');
const Testimonial = require('../models/Testimonial');
const AdminSettings = require('../models/AdminSettings');
const ClientAccount = require('../models/ClientAccount');
const ClientAuditLog = require('../models/ClientAuditLog');
const ClientSession = require('../models/ClientSession');
const { verifyAdminJWT, generateAdminToken } = require('../middleware/adminAuth');


// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// PUSH NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════════════

// GET /api/admin/vapid-public-key
router.get('/vapid-public-key', verifyAdminJWT, (req, res) => {
    res.json({
        success: true,
        publicKey: process.env.VAPID_PUBLIC_KEY
    });
});

// POST /api/admin/push-subscribe
router.post('/push-subscribe', verifyAdminJWT, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription) {
            return res.status(400).json({ success: false, message: 'Missing subscription object' });
        }

        const admin = await Admin.findById(req.admin.adminId);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

        // Check if the exact subscription endpoint already exists
        const exists = admin.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);

        if (!exists) {
            admin.pushSubscriptions.push(subscription);
            await admin.save();
            console.log(`✅ Push subscription added for admin ${admin.email}`);
        } else {
            console.log(`ℹ️ Push subscription already exists for admin ${admin.email}`);
        }

        res.json({ success: true, message: 'Subscription saved successfully' });
    } catch (error) {
        console.error('❌ Error saving push subscription:', error);
        res.status(500).json({ success: false, message: 'Server error saving subscription' });
    }
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            console.log('❌ Missing email or password');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                errors: ['Invalid email or password']
            });
        }

        // Find admin
        let admin = await Admin.findOne({ email: email.toLowerCase() });

        if (!admin) {
            console.log('❌ Admin not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                errors: ['Invalid email or password']
            });
        }

        // Compare password — bcrypt only
        const isPasswordValid = await admin.comparePassword(password);

        if (!isPasswordValid) {
            console.log('❌ Invalid password');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                errors: ['Invalid email or password']
            });
        }

        console.log('✓ Password valid');

        // Generate token
        const token = generateAdminToken(admin._id, admin.email);

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Set httpOnly cookies for backward compatibility and PRD/test expectations
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        };
        res.cookie('adminToken', token, cookieOptions);
        res.cookie('portal_token', token, cookieOptions);

        console.log('✅ Login successful!');

        res.json({
            success: true,
            message: 'Login successful',
            admin: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                avatar: admin.avatar
            }
        });
    } catch (error) {
        console.error('❌ Admin login error:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Server error during login: ' + error.message
        });
    }
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.clearCookie('portal_token');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// GET /api/admin/me (protected)
router.get('/me', verifyAdminJWT, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.adminId).select('-passwordHash');
        res.json({
            success: true,
            admin
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching admin data'
        });
    }
});

// PATCH /api/admin/me - Update admin profile
router.patch('/me', verifyAdminJWT, async (req, res) => {
    try {
        const { name, avatar } = req.body;
        const admin = await Admin.findById(req.admin.adminId);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (name) admin.name = name;
        if (avatar !== undefined) admin.avatar = avatar;
        admin.updatedAt = Date.now();

        await admin.save();

        res.json({
            success: true,
            message: 'Profile updated',
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                avatar: admin.avatar,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Error updating admin profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
});

// ═══════════════════════════════════════════════════════════
// BOOKINGS ROUTES (PROTECTED)
// ═══════════════════════════════════════════════════════════

// GET /api/admin/bookings
router.get('/bookings', verifyAdminJWT, async (req, res) => {
    try {
        const { status, eventType, search, clientEmail, clientPhone, page = 1, limit = 20 } = req.query;
        const query = {};

        if (status) query.status = status;
        if (eventType) query.eventType = eventType;
        
        // Search by client email
        if (clientEmail) {
            query.customerEmail = { $regex: clientEmail, $options: 'i' };
        }
        
        // Search by client phone
        if (clientPhone) {
            query.customerPhone = { $regex: clientPhone.replace(/\s|-/g, ''), $options: 'i' };
        }
        
        if (search) {
            query.$or = [
                { 'customerId.name': { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { bookingReference: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const bookings = await Booking.find(query)
            .populate('customerId')
            .populate('assignedStaff')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Booking.countDocuments(query);

        res.json({
            success: true,
            bookings,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching bookings'
        });
    }
});

// GET /api/admin/bookings/:id
router.get('/bookings/:id', verifyAdminJWT, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('customerId')
            .populate('assignedStaff')
            .populate('adminNotes.addedBy', 'name');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching booking'
        });
    }
});

// PATCH /api/admin/bookings/:id
router.patch('/bookings/:id', verifyAdminJWT, async (req, res) => {
    try {
        const { status, isPaid, notes, assignedStaff } = req.body;
        let responseAssignedStaff = undefined;
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        const updatePayload = {};
        if (status) updatePayload.status = status;
        if (isPaid !== undefined) updatePayload.isPaid = isPaid;

        if (Array.isArray(assignedStaff)) {
            responseAssignedStaff = assignedStaff;
            const validObjectIds = assignedStaff
                .filter(item => typeof item === 'string' && /^[a-fA-F0-9]{24}$/.test(item));
            if (validObjectIds.length > 0) {
                updatePayload.assignedStaff = validObjectIds;
            }
        }

        if (typeof notes === 'string' && notes.trim()) {
            updatePayload.notes = notes;
            updatePayload.$push = {
                adminNotes: {
                    note: notes,
                    addedBy: req.admin.adminId
                }
            };
        }

        const updatedBooking = await Booking.findByIdAndUpdate(
            req.params.id,
            updatePayload,
            {
                new: true,
                runValidators: true
            }
        );

        if (!updatedBooking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Auto-sync confirmed booking to port 3001 as assignment
        if (updatedBooking.status === 'confirmed') {
            try {
                const axios = require('axios');
                const axiosRetry = require('axios-retry').default || require('axios-retry');
                axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
                const syncSecret = process.env.SYNC_SECRET;
                await axios.post(
                    `${process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001'}/internal/sync-booking`,
                    {
                        title: updatedBooking.eventType || 'Event',
                        description: updatedBooking.notes || 'Synced from client booking',
                        location: updatedBooking.location || 'TBD',
                        date: updatedBooking.eventDate,
                        start_time: '09:00',
                        end_time: '17:00',
                        pay_rate: await (async () => {
                            try {
                                const PricingSettings = require('../models/PricingSettings');
                                const pricing = await PricingSettings.findOne().lean();
                                if (pricing && pricing.categories) {
                                    const eventType = (updatedBooking.eventType || '').toLowerCase();
                                    const match = pricing.categories.find(c => c.isActive && eventType.includes(c.name.toLowerCase().split('/')[0].trim().toLowerCase()));
                                    if (match) return match.staffPayRate || 1000;
                                }
                            } catch(e) { console.log('Pricing lookup failed:', e.message); }
                            return 1000;
                        })(),
                        usherCount: updatedBooking.usherCount || 0,
                        required_staff_count: updatedBooking.selectedServices?.reduce((sum, s) => sum + (s.quantity || 0), 0) || updatedBooking.usherCount || 1,
                        booking_ref: updatedBooking._id.toString(),
                        client_name: updatedBooking.customerId?.name || '',
                        client_email: updatedBooking.customerId?.email || ''
                    },
                    { headers: { 'x-sync-secret': syncSecret } }
                );
                console.log('Booking synced to port 3001:', updatedBooking._id);
            } catch (syncErr) {
                console.log('Port 3001 sync skipped:', syncErr.message);
            }
        }

        // Create notification
        await AdminNotification.create({
            type: 'system',
            message: `Booking ${updatedBooking.bookingReference} updated`,
            bookingRef: updatedBooking._id
        });

        const bookingResponse = updatedBooking.toObject();
        if (responseAssignedStaff) {
            bookingResponse.assignedStaff = responseAssignedStaff;
        }

        res.json({
            success: true,
            message: 'Booking updated',
            booking: bookingResponse
        });
    } catch (error) {
        console.error('Error updating booking:', {
            name: error.name,
            message: error.message,
            errors: error.errors,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: 'Error updating booking'
        });
    }
});

// PATCH /api/admin/bookings/:id/pay
router.patch('/bookings/:id/pay', verifyAdminJWT, async (req, res) => {
    try {
        const { amountPaid, isPaid } = req.body;
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (amountPaid !== undefined) {
            booking.amountPaid = Number(amountPaid);
        }
        if (isPaid !== undefined) {
            booking.isPaid = isPaid;
        }

        await booking.save();

        await AdminNotification.create({
            type: 'payment_received',
            message: `Payment updated for booking ${booking.bookingReference}`,
            bookingRef: booking._id,
            icon: 'money-bill'
        });

        res.json({
            success: true,
            message: 'Payment details updated successfully',
            booking
        });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing payment'
        });
    }
});


// POST /api/admin/bookings/:id/payment
router.post('/bookings/:id/payment', verifyAdminJWT, async (req, res) => {
    try {
        const { amount, paymentMethod, transactionId, paymentDate, notes } = req.body;
        const booking = await Booking.findById(req.params.id).populate('customerId');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const ClientPayment = require('../models/ClientPayment');

        // Create the payment record
        const payment = await ClientPayment.create({
            bookingId: booking._id,
            clientId: booking.customerId ? booking.customerId._id : null,
            clientName: booking.customerId ? booking.customerId.name : '',
            clientEmail: booking.customerId ? booking.customerId.email : '',
            amount: Number(amount),
            paymentMethod: paymentMethod || 'MPesa',
            transactionId: transactionId || '',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            notes: notes || '',
            recordedBy: req.admin.adminId
        });

        // Update the booking's amountPaid
        booking.amountPaid = (booking.amountPaid || 0) + Number(amount);
        booking.isPaid = true; // Mark as paid
        await booking.save();

        await AdminNotification.create({
            type: 'payment_received',
            message: `Payment of KES ${amount} recorded for booking ${booking.bookingReference}`,
            bookingRef: booking._id,
            icon: 'money-bill'
        });

        // SYNC PAYMENT & PROFORMA INVOICE
        try {
            const axios = require('axios');
            const syncSecret = process.env.SYNC_SECRET;
            // Sync payment amount to staff portal
            await axios.post(
                `${process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001'}/internal/sync-payment`,
                { booking_ref: booking._id.toString(), clientPaymentAmount: amount, paymentMethod, transactionId },
                { headers: { 'x-sync-secret': syncSecret } }
            );

            // Send proforma invoice email directly from main portal
            const PricingSettings = require('../models/PricingSettings');
            const pricing = await PricingSettings.findOne().lean();
            const vatRate = pricing?.vatRate || 16;
            const subtotal = parseFloat(amount) || 0;
            const vatAmount = Math.round(subtotal * vatRate / 100);
            const totalAmount = subtotal + vatAmount;
            const emailService = require('../services/emailService');
            
            const proformaHtml = `
                <p style="color:#334155;">Dear <strong>${booking.customerId?.name || 'Client'}</strong>,</p>
                <p style="color:#334155;margin-bottom:20px;">Thank you for your payment. Please find your invoice details below.</p>
                <div style="background:#f8fafc;border-radius:8px;padding:20px;border-left:4px solid #C9A84C;">
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="padding:6px 0;color:#64748b;">Event</td><td style="padding:6px 0;font-weight:700;color:#0D2B1F;text-align:right;">${booking.eventType}</td></tr>
                        <tr><td style="padding:6px 0;color:#64748b;">Event Date</td><td style="padding:6px 0;text-align:right;">${booking.eventDate ? new Date(booking.eventDate).toLocaleDateString('en-KE') : 'TBD'}</td></tr>
                        <tr><td style="padding:6px 0;color:#64748b;">Payment Method</td><td style="padding:6px 0;text-align:right;">${paymentMethod}</td></tr>
                        <tr><td style="padding:6px 0;color:#64748b;">Transaction ID</td><td style="padding:6px 0;text-align:right;">${transactionId || 'N/A'}</td></tr>
                        <tr><td style="padding:6px 0;color:#64748b;">Amount Paid</td><td style="padding:6px 0;text-align:right;">KSh ${subtotal.toLocaleString()}</td></tr>
                        <tr><td style="padding:6px 0;color:#64748b;">VAT (${vatRate}%)</td><td style="padding:6px 0;text-align:right;">KSh ${vatAmount.toLocaleString()}</td></tr>
                        <tr style="border-top:2px solid #e2e8f0;"><td style="padding:10px 0;font-weight:900;color:#0D2B1F;">TOTAL</td><td style="padding:10px 0;font-weight:900;color:#059669;text-align:right;">KSh ${totalAmount.toLocaleString()}</td></tr>
                    </table>
                </div>
                <p style="color:#64748b;font-size:0.85rem;margin-top:16px;">Booking Reference: <strong>${booking.bookingReference}</strong></p>`;
            
            const wrapper = emailService.brandedWrapper || ((title, body) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;"><div style="background:#0D2B1F;padding:20px;color:white;text-align:center;"><h2>${title}</h2></div><div style="padding:30px;">${body}</div></div>`);
            await emailService.sendEmail({
                to: [{ email: booking.customerId?.email, name: booking.customerId?.name }],
                subject: `Payment Confirmation & Invoice — ${booking.eventType} | Emerald Pearland Events`,
                htmlContent: wrapper('PAYMENT CONFIRMATION', proformaHtml)
            });
            console.log('Proforma invoice sent to:', booking.customerId?.email);
        } catch (invErr) { 
            console.log('Proforma invoice/sync skip:', invErr.message); 
        }

        res.json({
            success: true,
            message: 'Payment recorded successfully',
            payment,
            booking
        });
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(500).json({ success: false, message: 'Error recording payment' });
    }
});

// POST /api/admin/bookings/:id/send-appreciation
router.post('/bookings/:id/send-appreciation', verifyAdminJWT, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('customerId');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const emailService = require('../services/emailService');
        await emailService.sendClientAppreciationEmail(booking, booking.customerId);

        // Optionally record that we sent the email
        booking.adminNotes.push({
            note: 'Sent Client Appreciation & Feedback Email',
            addedBy: req.admin.adminId
        });
        await booking.save();

        await AdminNotification.create({
            type: 'system',
            message: `Sent appreciation email to ${booking.customerId.name} for ${booking.bookingReference}`,
            bookingRef: booking._id,
        });

        res.json({ success: true, message: 'Appreciation email sent successfully!' });
    } catch (error) {
        console.error('Error sending appreciation email:', error);
        res.status(500).json({ success: false, message: 'Failed to send appreciation email. Ensure SMTP is configured.' });
    }
});

// POST /api/admin/bookings/:id/message-staff
router.post('/bookings/:id/message-staff', verifyAdminJWT, async (req, res) => {
    try {
        const { customMessage, staffIds } = req.body;
        if (!customMessage || !staffIds || !staffIds.length) {
            return res.status(400).json({ success: false, message: 'Message and selected staff are required.' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const emailService = require('../services/emailService');
        let successCount = 0;
        let failCount = 0;

        for (const staffId of staffIds) {
            const staff = await Staff.findById(staffId);
            if (staff && staff.email) {
                try {
                    await emailService.sendStaffFeedbackRequestEmail(staff.email, staff.name, booking, customMessage);
                    successCount++;
                } catch (e) {
                    console.error(`Failed sending to staff ${staff.name}:`, e.message);
                    failCount++;
                }
            } else {
                failCount++;
            }
        }

        booking.adminNotes.push({
            note: `Sent staff feedback request to ${staffIds.length} members. (Success: ${successCount}, Fail: ${failCount})`,
            addedBy: req.admin.adminId
        });
        await booking.save();

        if (successCount === 0) {
            return res.status(400).json({ success: false, message: 'Failed to send emails. Selected staff might not have valid email addresses.' });
        }

        res.json({
            success: true,
            message: `Sent successfully to ${successCount} staff member(s). ${failCount > 0 ? `Failed for ${failCount}.` : ''}`
        });

    } catch (error) {
        console.error('Error messaging staff:', error);
        res.status(500).json({ success: false, message: 'Server error processing staff messages.' });
    }
});

// DELETE /api/admin/bookings/:id
router.delete('/bookings/:id', verifyAdminJWT, async (req, res) => {
    try {
        const booking = await Booking.findByIdAndDelete(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            message: 'Booking deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting booking'
        });
    }
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS ROUTES (PROTECTED)
// ═══════════════════════════════════════════════════════════

// GET /api/admin/analytics/overview
router.get('/analytics/overview', verifyAdminJWT, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // All-time total bookings
        const totalBookings = await Booking.countDocuments({});

        // This month bookings
        const thisMonthBookings = await Booking.countDocuments({
            createdAt: { $gte: startOfMonth }
        });

        // Last month bookings
        const lastMonthBookings = await Booking.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
        });

        // Pending confirmations
        const pendingConfirmations = await Booking.countDocuments({
            status: { $in: ['new', 'contacted'] }
        });

        // Upcoming events this week
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const upcomingEvents = await Booking.countDocuments({
            eventDate: { $gte: weekStart, $lte: weekEnd },
            status: { $ne: 'cancelled' }
        });

        // Calculate Revenue This Month and Last Month
        const thisMonthRevenueAgg = await Booking.aggregate([
            { $match: { createdAt: { $gte: startOfMonth }, $or: [{ isPaid: true }, { status: 'completed' }] } },
            { $group: { _id: null, total: { $sum: "$amountPaid" } } }
        ]);
        const revenueThisMonth = thisMonthRevenueAgg.length > 0 ? thisMonthRevenueAgg[0].total : 0;

        const lastMonthRevenueAgg = await Booking.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, $or: [{ isPaid: true }, { status: 'completed' }] } },
            { $group: { _id: null, total: { $sum: "$amountPaid" } } }
        ]);
        const revenueLastMonth = lastMonthRevenueAgg.length > 0 ? lastMonthRevenueAgg[0].total : 0;

        // Calculate 6-month Revenue Trend for Chart.js
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const trendAgg = await Booking.aggregate([
            { $match: { createdAt: { $gte: trendStart }, $or: [{ isPaid: true }, { status: 'completed' }] } },
            {
                $group: {
                    _id: { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } },
                    total: { $sum: "$amountPaid" },
                    bookings: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Map trendData to month labels
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let labels = [];
        let revenueData = [];

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(monthNames[d.getMonth()]);
            // find if agg exists
            const match = trendAgg.find(t => t._id.month === (d.getMonth() + 1) && t._id.year === d.getFullYear());
            revenueData.push(match ? match.total : 0);
        }

        // Calculate percentage changes
        const bookingChangePercent = lastMonthBookings ? ((thisMonthBookings - lastMonthBookings) / lastMonthBookings * 100).toFixed(1) : 0;
        const revenueChangePercent = revenueLastMonth ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : 0;

        // Calculate Projected Revenue (Confirmed but unpaid)
        const projectedRevenueAgg = await Booking.aggregate([
            { $match: { status: 'confirmed', isPaid: false } },
            { $group: { _id: null, total: { $sum: "$estimatedTotal" } } }
        ]);
        const projectedRevenue = projectedRevenueAgg.length > 0 ? projectedRevenueAgg[0].total : 0;

        // Count VIP clients
        const vipCount = await Customer.countDocuments({ isVIP: true });

        res.json({
            success: true,
            stats: {
                totalBookings,
                totalBookingsThisMonth: thisMonthBookings,
                bookingChangePercent,
                pendingConfirmations,
                upcomingEventsThisWeek: upcomingEvents,
                revenue: revenueThisMonth,
                revenueChangePercent,
                projectedRevenue,
                vipCount,
                chartData: {
                    labels,
                    revenue: revenueData
                }
            }
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics'
        });
    }
});

// GET /api/admin/notifications
router.get('/notifications', verifyAdminJWT, async (req, res) => {
    try {
        const { unreadOnly = false } = req.query;
        const query = unreadOnly ? { isRead: false } : {};

        const notifications = await AdminNotification.find(query)
            .populate('bookingRef', 'bookingReference eventType')
            .sort({ createdAt: -1 })
            .limit(20);

        const unreadCount = await AdminNotification.countDocuments({ isRead: false });

        res.json({
            success: true,
            notifications,
            unreadCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications'
        });
    }
});

// PATCH /api/admin/notifications/:id/read
router.patch('/notifications/:id/read', verifyAdminJWT, async (req, res) => {
    try {
        const notification = await AdminNotification.findByIdAndUpdate(
            req.params.id,
            { isRead: true },
            { new: true }
        );

        res.json({
            success: true,
            notification
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating notification'
        });
    }
});

// DELETE /api/admin/notifications/:id
router.delete('/notifications/:id', verifyAdminJWT, async (req, res) => {
    try {
        const notification = await AdminNotification.findByIdAndDelete(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting notification'
        });
    }
});

// GET /api/admin/staff
router.get('/staff', verifyAdminJWT, async (req, res) => {
    try {
        const { category } = req.query;
        const query = category ? { category } : { category: { $exists: true, $ne: null } };

        const staff = await Staff.find(query)
            .populate('assignedBookings', 'bookingReference eventDate')
            .sort({ name: 1 });

        res.json({
            success: true,
            staff
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching staff'
        });
    }
});

// POST /api/admin/staff
router.post('/staff', verifyAdminJWT, async (req, res) => {
    try {
        const { name, category, email, phone, whatsapp, bio, photo } = req.body;

        if (!name || !category || !phone) {
            return res.status(400).json({ success: false, message: 'Name, category and phone are required.' });
        }
        const staff = new Staff({
            name,
            category,
            email: email || null,
            phone,
            whatsapp: whatsapp || null,
            photo: photo || null,
            notes: bio || '',
            password: email || null,
            role: 'Staff',
            status: 'Active',
            mustChangePassword: true
        });
        await staff.save();
        syncStaffToOperations('create', staff.toObject()).catch(() => {});

        res.status(201).json({
            success: true,
            message: 'Staff member added successfully',
            staff
        });
    } catch (error) {
        console.error('Error adding staff:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding staff member: ' + (error.message || 'Unknown error')
        });
    }
});

// DELETE /api/admin/staff/:id
router.delete('/staff/:id', verifyAdminJWT, async (req, res) => {
    try {
        const staff = await Staff.findByIdAndDelete(req.params.id);

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Staff member not found'
            });
        }

        // Sync to port 3001
        syncStaffToOperations('delete', { email: staff.email }).catch(() => {});

        res.json({
            success: true,
            message: 'Staff member deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting staff member'
        });
    }
});


// ── PUBLIC (no auth) endpoints for homepage ──────────────────────────────────

// GET /api/admin/public/gallery
router.get('/public/gallery', async (req, res) => {
    try {
        const gallery = await Gallery.find()
            .sort({ order: 1, uploadedAt: -1 })
            .limit(9)
            .lean();
        res.json({ success: true, gallery });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching gallery' });
    }
});

// GET /api/admin/public/testimonials
router.get('/public/testimonials', async (req, res) => {
    try {
        const Testimonial = require('../models/Testimonial');
        const testimonials = await Testimonial.find({
            $or: [{ displayOnWebsite: true }, { status: 'approved' }]
        })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
        res.json({ success: true, testimonials });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching testimonials' });
    }
});

// GET /api/admin/gallery
router.get('/gallery', verifyAdminJWT, async (req, res) => {
    try {
        const gallery = await Gallery.find()
            .sort({ order: 1 });

        res.json({
            success: true,
            gallery
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching gallery'
        });
    }
});

// GET /api/admin/testimonials
router.get('/testimonials', verifyAdminJWT, async (req, res) => {
    try {
        const { status } = req.query;
        const query = status ? { status } : {};

        const testimonials = await Testimonial.find(query)
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            testimonials
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching testimonials'
        });
    }
});

// POST /api/admin/testimonials
router.post('/testimonials', verifyAdminJWT, async (req, res) => {
    try {
        const { name, role, text, rating, eventType, status, displayOnWebsite } = req.body;
        const testimonial = await Testimonial.create({
            name, role, text, rating: rating || 5,
            eventType, status: status || 'pending',
            displayOnWebsite: displayOnWebsite || false
        });
        res.status(201).json({ success: true, testimonial });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/admin/testimonials/:id
router.patch('/testimonials/:id', verifyAdminJWT, async (req, res) => {
    try {
        const testimonial = await Testimonial.findByIdAndUpdate(
            req.params.id, req.body, { new: true }
        );
        res.json({ success: true, testimonial });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/testimonials/:id
router.delete('/testimonials/:id', verifyAdminJWT, async (req, res) => {
    try {
        await Testimonial.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Testimonial deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/settings
router.get('/settings', verifyAdminJWT, async (req, res) => {
    try {
        let settings = await AdminSettings.findOne();
        if (!settings) {
            settings = await AdminSettings.create({});
        }

        res.json({
            success: true,
            settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching settings'
        });
    }
});

// PATCH /api/admin/settings
router.patch('/settings', verifyAdminJWT, async (req, res) => {
    try {
        const { businessName, businessPhone, businessEmail, businessAddress, notifyOnNewBooking, notifyOnWhatsApp, darkMode, instagramHandle, instagramUrl, facebookUrl, beholdfeedId, profileImage } = req.body;

        let settings = await AdminSettings.findOne();
        if (!settings) {
            settings = new AdminSettings();
        }

        if (businessName !== undefined) settings.businessName = businessName;
        if (businessPhone !== undefined) settings.businessPhone = businessPhone;
        if (businessEmail !== undefined) settings.businessEmail = businessEmail;
        if (businessAddress !== undefined) settings.businessAddress = businessAddress;
        if (notifyOnNewBooking !== undefined) settings.notifyOnNewBooking = notifyOnNewBooking;
        if (notifyOnWhatsApp !== undefined) settings.notifyOnWhatsApp = notifyOnWhatsApp;
        if (darkMode !== undefined) settings.darkMode = darkMode;
        if (instagramHandle !== undefined) settings.instagramHandle = instagramHandle;
        if (instagramUrl !== undefined) settings.instagramUrl = instagramUrl;
        if (facebookUrl !== undefined) settings.facebookUrl = facebookUrl;
        if (beholdfeedId !== undefined) settings.beholdfeedId = beholdfeedId;
        if (profileImage !== undefined) settings.profileImage = profileImage;

        await settings.save();

        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating settings'
        });
    }

});

// ------------------------------------------------------
// PRICING & RATES ROUTES
// ------------------------------------------------------
// GET /api/admin/pricing
router.get('/pricing', verifyAdminJWT, async (req, res) => {
    try {
        const PricingSettings = require('../models/PricingSettings');
        let pricing = await PricingSettings.findOne();
        if (!pricing) pricing = await PricingSettings.create({});
        res.json({ success: true, pricing });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error fetching pricing' });
    }
});
// PUT /api/admin/pricing
router.put('/pricing', verifyAdminJWT, async (req, res) => {
    try {
        const PricingSettings = require('../models/PricingSettings');
        const { usherRate, supervisorRate, globalSupervisorRate, vatRate, currency, notes, services, categories, paymentMethods } = req.body;
        let pricing = await PricingSettings.findOne();
        if (!pricing) pricing = new PricingSettings();
        if (globalSupervisorRate !== undefined) pricing.globalSupervisorRate = globalSupervisorRate;
        if (vatRate !== undefined) pricing.vatRate = vatRate;
        if (currency !== undefined) pricing.currency = currency;
        if (notes !== undefined) pricing.notes = notes;
        if (categories !== undefined) pricing.categories = categories;
        if (paymentMethods !== undefined) pricing.paymentMethods = paymentMethods;
        pricing.updatedAt = new Date();
        await pricing.save();
        // Sync pricing to staff portal
        try {
            const axios = require('axios');
            await axios.post(
                `${process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001'}/internal/sync-pricing`,
                { categories: pricing.categories, vatRate: pricing.vatRate, globalSupervisorRate: pricing.globalSupervisorRate, paymentMethods: pricing.paymentMethods },
                { headers: { 'x-sync-secret': process.env.SYNC_SECRET } }
            );
        } catch(e) { console.log('Pricing sync to staff portal skipped:', e.message); }
        res.json({ success: true, pricing });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error saving pricing' });
    }
});


// ═══════════════════════════════════════════════════════════
// ADMIN PROFILE ROUTES
// ═══════════════════════════════════════════════════════════

// GET /api/admin/profile
router.get('/profile', verifyAdminJWT, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.adminId).select('-passwordHash');
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }
        res.json({ success: true, profile: admin });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching profile' });
    }
});

// PATCH /api/admin/profile
router.patch('/profile', verifyAdminJWT, async (req, res) => {
    try {
        const { name, email, avatar } = req.body;
        const admin = await Admin.findById(req.admin.adminId);

        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        if (name) admin.name = name;
        if (email) admin.email = email.toLowerCase().trim();
        if (avatar !== undefined) admin.avatar = avatar;

        await admin.save();

        const updatedAdmin = admin.toObject();
        delete updatedAdmin.passwordHash;

        res.json({
            success: true,
            message: 'Profile updated',
            profile: updatedAdmin
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email is already in use' });
        }
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Error updating profile' });
    }
});

// ═══════════════════════════════════════════════════════════
// CHANGE PASSWORD (PROTECTED)
// ═══════════════════════════════════════════════════════════

// POST /api/admin/change-password
router.post('/change-password', verifyAdminJWT, async (req, res) => {
    try {
        console.log('🔐 Change password request received');
        console.log('Admin ID:', req.admin?.adminId);

        const { currentPassword, newPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword) {
            console.warn('⚠️ Missing password fields');
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 8) {
            console.warn('⚠️ New password too short');
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }

        // Get admin from database
        console.log('Looking up admin:', req.admin.adminId);
        const admin = await Admin.findById(req.admin.adminId);

        if (!admin) {
            console.error('❌ Admin not found:', req.admin.adminId);
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        console.log('✓ Admin found, verifying password');

        // Verify current password using the comparePassword method
        const isPasswordValid = await admin.comparePassword(currentPassword);
        if (!isPasswordValid) {
            console.warn('⚠️ Current password is incorrect');
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        console.log('✓ Current password verified, updating password');

        // Update password (will be hashed by the pre-save hook)
        admin.passwordHash = newPassword;
        await admin.save();

        console.log('✅ Password updated successfully');

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('❌ Error changing password:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Error changing password: ' + error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GALLERY ROUTES
// ═══════════════════════════════════════════════════════════

// GET /api/admin/gallery
router.get('/gallery', verifyAdminJWT, async (req, res) => {
    try {
        const items = await Gallery.find().sort({ order: 1, uploadedAt: -1 });
        console.log(`📸 GET /gallery invoked. Found ${items.length} items`);
        res.json({ success: true, gallery: items });
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).json({ success: false, message: 'Error fetching gallery' });
    }
});

// POST /api/admin/gallery/upload
router.post('/gallery/upload', verifyAdminJWT, async (req, res) => {
    try {
        const { filename, url, eventType, caption } = req.body;
        if (!url) return res.status(400).json({ success: false, message: "Image data (url) is required." });
        const cloudinary = require("cloudinary").v2;
        cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
        const uploadResult = await cloudinary.uploader.upload(url, { folder: "emerald/gallery", resource_type: "image" });
        const cloudinaryUrl = uploadResult.secure_url;
        const lastItem = await Gallery.findOne().sort({ order: -1 });
        const nextOrder = lastItem ? (lastItem.order + 1) : 0;

        const item = new Gallery({
            filename: filename || `upload_${Date.now()}`,
            url: cloudinaryUrl,
            eventType: eventType || null,
            caption: caption || '',
            order: nextOrder,
            uploadedBy: req.admin._id || req.admin.adminId
        });

        await item.save();
        console.log(`✅ Gallery image saved: ${item.filename} with ID: ${item._id}`);

        res.status(201).json({ success: true, message: 'Image uploaded successfully', item });
    } catch (error) {
        console.error('Gallery upload error:', error);
        res.status(500).json({ success: false, message: 'Error uploading image: ' + error.message });
    }
});

// DELETE /api/admin/gallery/:id
router.delete('/gallery/:id', verifyAdminJWT, async (req, res) => {
    try {
        const item = await Gallery.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ success: false, message: 'Image not found' });
        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting image' });
    }
});

// PATCH /api/admin/gallery/:id  (reorder / update caption)
router.patch('/gallery/:id', verifyAdminJWT, async (req, res) => {
    try {
        const { order, caption, eventType } = req.body;
        const update = {};
        if (order !== undefined) update.order = order;
        if (caption !== undefined) update.caption = caption;
        if (eventType !== undefined) update.eventType = eventType;
        const item = await Gallery.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Image not found' });
        res.json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating image' });
    }
});

// ═══════════════════════════════════════════════════════════
// GALLERY — AI CAPTION GENERATION (PEARL)
// ═══════════════════════════════════════════════════════════

// POST /api/admin/gallery/generate-captions
// Body: { eventType: string, filename: string }
// Returns: { success: true, captions: string[] }  (always 5 options)
router.post('/gallery/generate-captions', verifyAdminJWT, async (req, res) => {
    try {
        const { eventType, filename } = req.body;

        const eventLabel = eventType || 'event';
        const nameHint = filename ? ` The image filename is: "${filename}".` : '';

        const prompt = `You are PEARL, the AI assistant for Emerald Pearland Events — a premium event staffing and coordination company in Nairobi, Kenya. 

Generate exactly 5 short, professional image captions for a gallery photo from a ${eventLabel}.${nameHint}

Requirements:
- Each caption should be 5–12 words long
- Tone: elegant, warm, and professional — fitting a luxury Nairobi events company
- Vary the style: some descriptive, some evocative, some action-oriented
- Do not number them or add bullet points
- Return ONLY the 5 captions, one per line, nothing else

Example format:
Elegance in every detail at this stunning wedding
Our team brings warmth and professionalism to every event
A moment of joy captured at the reception
Flawless coordination for an unforgettable evening
Where memories are made and moments become magic`;

        const axios = require('axios');
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 300, temperature: 0.8 }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const raw = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const captions = raw
            .split('\n')
            .map(line => line.replace(/^[\d\.\-\*\s]+/, '').trim())
            .filter(line => line.length > 4)
            .slice(0, 5);

        if (captions.length < 5) {
            return res.status(500).json({ success: false, message: 'Caption generation returned fewer than 5 options.' });
        }

        res.json({ success: true, captions });
    } catch (error) {
        console.error('Caption generation error:', error?.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Error generating captions: ' + error.message });
    }
});

// ═══════════════════════════════════════════════════════════
// STAFF UPDATE (PATCH)
// ═══════════════════════════════════════════════════════════

// PATCH /api/admin/staff/:id  (update staff details including whatsapp)
router.patch('/staff/:id', verifyAdminJWT, async (req, res) => {
    try {
        const { name, category, email, phone, whatsapp, notes, isAvailable, hourlyRate, photo } = req.body;
        const update = {};
        if (name) update.name = name;
        if (category) update.category = category;
        if (email !== undefined) update.email = email;
        if (phone !== undefined) update.phone = phone;
        if (whatsapp !== undefined) update.whatsapp = whatsapp;
        if (notes !== undefined) update.notes = notes;
        if (isAvailable !== undefined) update.isAvailable = isAvailable;
        if (hourlyRate !== undefined) update.hourlyRate = hourlyRate;
        if (photo !== undefined) update.photo = photo;
        update.updatedAt = new Date();

        const staff = await Staff.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
        
        // Sync to port 3001
        syncStaffToOperations('update', staff.toObject()).catch(() => {});
        
        res.json({ success: true, message: 'Staff updated successfully', staff });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating staff' });
    }
});

// ═══════════════════════════════════════════════════════════
// BOOKING — Staff Assignment
// ═══════════════════════════════════════════════════════════

// POST /api/admin/bookings/:id/assign-staff
router.post('/bookings/:id/assign-staff', verifyAdminJWT, async (req, res) => {
    try {
        const { supervisorId, staffIds } = req.body;
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (supervisorId !== undefined) booking.supervisor = supervisorId || null;
        if (staffIds !== undefined) booking.assignedStaff = staffIds;

        await booking.save();

        // Create notification
        const AssignedNames = [];
        if (supervisorId) {
            const sup = await Staff.findById(supervisorId).select('name');
            if (sup) AssignedNames.push(`Supervisor: ${sup.name}`);
        }
        if (staffIds && staffIds.length) {
            const team = await Staff.find({ _id: { $in: staffIds } }).select('name');
            team.forEach(s => AssignedNames.push(s.name));
        }

        const AdminNotification = require('../models/AdminNotification');
        await AdminNotification.create({
            type: 'staff_assigned',
            title: 'Staff Assigned to Booking',
            message: `Staff assigned to booking #${booking._id.toString().slice(-6).toUpperCase()}: ${AssignedNames.join(', ') || 'None'}`,
            isRead: false
        });

        res.json({ success: true, message: 'Staff assigned successfully' });
    } catch (error) {
        console.error('Error assigning staff:', error);
        res.status(500).json({ success: false, message: 'Error assigning staff: ' + error.message });
    }
});

// ═══════════════════════════════════════════════════════════
// BOOKING — Payment Update (fix for 404)
// ═══════════════════════════════════════════════════════════

// PATCH /api/admin/bookings/:id/pay
router.patch('/bookings/:id/pay', verifyAdminJWT, async (req, res) => {
    try {
        const { isPaid, amountPaid } = req.body;
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        booking.isPaid = isPaid;
        booking.amountPaid = amountPaid || 0;
        await booking.save();

        // Create notification if marking as paid
        if (isPaid) {
            const customer = await Customer.findById(booking.customerId);
            const AdminNotification = require('../models/AdminNotification');
            await AdminNotification.create({
                type: 'payment',
                title: 'Payment Received',
                message: `Payment of KES ${amountPaid?.toLocaleString() || 0} received from ${customer?.name || 'client'} for booking #${booking._id.toString().slice(-6).toUpperCase()}`,
                isRead: false
            });
        }

        res.json({ success: true, message: 'Payment status updated', booking });
    } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).json({ success: false, message: 'Error updating payment: ' + error.message });
    }
});

// ═══════════════════════════════════════════════════════════
// CUSTOMER CRM
// ═══════════════════════════════════════════════════════════

// GET /api/admin/customers
router.get('/customers', verifyAdminJWT, async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.json({ success: true, customers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching customers' });
    }
});

// POST /api/admin/customers
router.post('/customers', verifyAdminJWT, async (req, res) => {
    try {
        const { name, email, phone, location, tags, notes } = req.body;
        const newCustomer = new Customer({
            name,
            email,
            phone,
            location,
            tags: tags || ['new'],
            notes: notes || '',
        });
        await newCustomer.save();
        res.json({ success: true, customer: newCustomer });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email or phone already exists' });
        }
        res.status(500).json({ success: false, message: 'Error creating customer: ' + error.message });
    }
});

// GET /api/admin/customers/:id - Get single customer
router.get('/customers/:id', verifyAdminJWT, async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        res.json({ success: true, customer });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching customer' });
    }
});

// PUT /api/admin/customers/:id - Update customer
router.put('/customers/:id', verifyAdminJWT, async (req, res) => {
    try {
        const { name, email, phone, location, notes, isVIP, status, howTheyFoundUs } = req.body;
        
        const updateData = {
            name,
            email,
            phone,
            location,
            notes,
            isVIP,
            status,
            howTheyFoundUs
        };

        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        res.json({ success: true, customer });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email or phone already exists' });
        }
        res.status(500).json({ success: false, message: 'Error updating customer: ' + error.message });
    }
});

// DELETE /api/admin/customers/:id
router.delete('/customers/:id', verifyAdminJWT, async (req, res) => {
    try {
        await Customer.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Customer deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting customer' });
    }
});


// ═══════════════════════════════════════════════════════════
// CLIENT PORTAL MANAGEMENT ROUTES (PROTECTED)
// ═══════════════════════════════════════════════════════════

// GET /api/admin/clients
router.get('/clients', verifyAdminJWT, async (req, res) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        let query = {};
        if (search) {
            query = { email: { $regex: search, $options: 'i' } };
        }
        const skip = (page - 1) * limit;
        const clients = await ClientAccount.find(query).populate('client_id').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 });
        const total = await ClientAccount.countDocuments(query);
        res.json({ success: true, data: { clients, pagination: { total, pages: Math.ceil(total / limit), page: parseInt(page) } } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching client accounts' });
    }
});

// GET /api/admin/clients/:clientId
router.get('/clients/:clientId', verifyAdminJWT, async (req, res) => {
    try {
        const client = await ClientAccount.findById(req.params.clientId).populate('client_id');
        if (!client) return res.status(404).json({ success: false, message: 'Client account not found' });
        res.json({ success: true, data: { client } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/clients/:clientId/toggle
router.post('/clients/:clientId/toggle', verifyAdminJWT, async (req, res) => {
    try {
        const client = await ClientAccount.findById(req.params.clientId);
        if (!client) return res.status(404).json({ success: false, message: 'Client account not found' });
        client.portal_access_enabled = !client.portal_access_enabled;
        await client.save();
        res.json({ success: true, data: { client } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error toggling client access' });
    }
});

// GET /api/admin/clients/:clientId/audit
router.get('/clients/:clientId/audit', verifyAdminJWT, async (req, res) => {
    try {
        const logs = await ClientAuditLog.find({ client_id: req.params.clientId }).sort({ timestamp: -1 }).limit(50);
        res.json({ success: true, data: { logs } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching audit logs' });
    }
});

// GET /api/admin/clients/:clientId/sessions
router.get('/clients/:clientId/sessions', verifyAdminJWT, async (req, res) => {
    try {
        const sessions = await ClientSession.find({ client_id: req.params.clientId }).select('-refresh_token_hash').sort({ last_active: -1 });
        res.json({ success: true, data: { sessions } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching sessions' });
    }
});

module.exports = router;



