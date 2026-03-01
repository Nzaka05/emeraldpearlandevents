const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const AdminNotification = require('../models/AdminNotification');
const Staff = require('../models/Staff');
const Gallery = require('../models/Gallery');
const Testimonial = require('../models/Testimonial');
const AdminSettings = require('../models/AdminSettings');
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
        console.log('\n🔐 ═══════════════════════════════════════════');
        console.log('🔐 LOGIN REQUEST RECEIVED');
        console.log('🔐 ═══════════════════════════════════════════');
        console.log('Body:', req.body);

        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            console.log('❌ Missing email or password');
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        console.log('📧 Looking up admin:', email);

        // Find admin
        const admin = await Admin.findOne({ email: email.toLowerCase() });
        if (!admin) {
            console.log('❌ Admin not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        console.log('✓ Admin found:', admin.email);
        console.log('🔐 Comparing password...');

        // Compare password
        const isPasswordValid = await admin.comparePassword(password);
        if (!isPasswordValid) {
            console.log('❌ Invalid password');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        console.log('✓ Password valid');
        console.log('🎫 Generating token...');

        // Generate token
        const token = generateAdminToken(admin._id, admin.email);

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Set httpOnly cookie
        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        console.log('✅ Login successful!');
        console.log('🔐 ═══════════════════════════════════════════\n');

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

// ═══════════════════════════════════════════════════════════
// BOOKINGS ROUTES (PROTECTED)
// ═══════════════════════════════════════════════════════════

// GET /api/admin/bookings
router.get('/bookings', verifyAdminJWT, async (req, res) => {
    try {
        const { status, eventType, search, page = 1, limit = 20 } = req.query;
        const query = {};

        if (status) query.status = status;
        if (eventType) query.eventType = eventType;
        if (search) {
            query.$or = [
                { 'customerId.name': { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { bookingReference: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const bookings = await Booking.find(query)
            .
            populate('customerId')
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
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (status) booking.status = status;
        if (isPaid !== undefined) booking.isPaid = isPaid;
        if (assignedStaff) booking.assignedStaff = assignedStaff;

        if (notes) {
            booking.adminNotes.push({
                note: notes,
                addedBy: req.admin.adminId
            });
        }

        await booking.save();

        // Create notification
        await AdminNotification.create({
            type: 'system',
            message: `Booking ${booking.bookingReference} updated`,
            bookingRef: booking._id
        });

        res.json({
            success: true,
            message: 'Booking updated successfully',
            booking
        });
    } catch (error) {
        console.error('Error updating booking:', error);
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
        const query = category ? { category } : {};

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
            notes: bio || ''
        });

        await staff.save();

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
            message: 'Profile updated successfully',
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

        if (!url) {
            return res.status(400).json({ success: false, message: 'Image data (url) is required.' });
        }

        const lastItem = await Gallery.findOne().sort({ order: -1 });
        const nextOrder = lastItem ? (lastItem.order + 1) : 0;

        const item = new Gallery({
            filename: filename || `upload_${Date.now()}`,
            url,
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

// DELETE /api/admin/customers/:id
router.delete('/customers/:id', verifyAdminJWT, async (req, res) => {
    try {
        await Customer.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Customer deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting customer' });
    }
});

module.exports = router;
