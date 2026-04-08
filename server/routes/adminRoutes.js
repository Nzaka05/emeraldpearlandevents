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

// GET /api/v1/admin/vapid-public-key
router.get('/vapid-public-key', verifyAdminJWT, (req, res) => {
    res.json({
        success: true,
        publicKey: process.env.VAPID_PUBLIC_KEY
    });
});

// POST /api/v1/admin/push-subscribe
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

// POST /api/v1/admin/login
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

// POST /api/v1/admin/logout
router.post('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.clearCookie('portal_token');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// GET /api/v1/admin/me (protected)
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

// PATCH /api/v1/admin/me - Update admin profile
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
// Extracted to modules/bookings/ - see bookings.routes.js
router.use('/bookings', require('../../modules/bookings/bookings.routes'));

// ═══════════════════════════════════════════════════════════
    // PAYMENTS ROUTES
    // ═══════════════════════════════════════════════════════════
    // Extracted to modules/payments/ - see payments.routes.js
    // Note: M-Pesa callbacks are PUBLIC (POST /api/v1/admin/payments/mpesa/callback)
    router.use('/payments', require('../../modules/payments/payments.routes'));

    // ═══════════════════════════════════════════════════════════
    // ANALYTICS ROUTES (PROTECTED)
// ═══════════════════════════════════════════════════════════

// GET /api/v1/admin/analytics/overview
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

// GET /api/v1/admin/notifications
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

// PATCH /api/v1/admin/notifications/:id/read
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

// DELETE /api/v1/admin/notifications/:id
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

// GET /api/v1/admin/staff
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

// POST /api/v1/admin/staff
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

// DELETE /api/v1/admin/staff/:id
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

// GET /api/v1/admin/public/gallery
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

// GET /api/v1/admin/public/testimonials
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

// GET /api/v1/admin/gallery
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

// GET /api/v1/admin/testimonials
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

// POST /api/v1/admin/testimonials
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

// PATCH /api/v1/admin/testimonials/:id
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

// DELETE /api/v1/admin/testimonials/:id
router.delete('/testimonials/:id', verifyAdminJWT, async (req, res) => {
    try {
        await Testimonial.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Testimonial deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/v1/admin/settings
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

// PATCH /api/v1/admin/settings
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
// GET /api/v1/admin/pricing
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
// PUT /api/v1/admin/pricing
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

// GET /api/v1/admin/profile
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

// PATCH /api/v1/admin/profile
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

// POST /api/v1/admin/change-password
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

// GET /api/v1/admin/gallery
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

// POST /api/v1/admin/gallery/upload
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

// DELETE /api/v1/admin/gallery/:id
router.delete('/gallery/:id', verifyAdminJWT, async (req, res) => {
    try {
        const item = await Gallery.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ success: false, message: 'Image not found' });
        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting image' });
    }
});

// PATCH /api/v1/admin/gallery/:id  (reorder / update caption)
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

// POST /api/v1/admin/gallery/generate-captions
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

// PATCH /api/v1/admin/staff/:id  (update staff details including whatsapp)
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

// POST /api/v1/admin/bookings/:id/assign-staff
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
// CUSTOMER CRM
// ═══════════════════════════════════════════════════════════

// GET /api/v1/admin/customers
router.get('/customers', verifyAdminJWT, async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.json({ success: true, customers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching customers' });
    }
});

// POST /api/v1/admin/customers
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

// GET /api/v1/admin/customers/:id - Get single customer
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

// PUT /api/v1/admin/customers/:id - Update customer
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

// DELETE /api/v1/admin/customers/:id
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

// GET /api/v1/admin/clients
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

// GET /api/v1/admin/clients/:clientId
router.get('/clients/:clientId', verifyAdminJWT, async (req, res) => {
    try {
        const client = await ClientAccount.findById(req.params.clientId).populate('client_id');
        if (!client) return res.status(404).json({ success: false, message: 'Client account not found' });
        res.json({ success: true, data: { client } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/v1/admin/clients/:clientId/toggle
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

// GET /api/v1/admin/clients/:clientId/audit
router.get('/clients/:clientId/audit', verifyAdminJWT, async (req, res) => {
    try {
        const logs = await ClientAuditLog.find({ client_id: req.params.clientId }).sort({ timestamp: -1 }).limit(50);
        res.json({ success: true, data: { logs } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching audit logs' });
    }
});

// GET /api/v1/admin/clients/:clientId/sessions
router.get('/clients/:clientId/sessions', verifyAdminJWT, async (req, res) => {
    try {
        const sessions = await ClientSession.find({ client_id: req.params.clientId }).select('-refresh_token_hash').sort({ last_active: -1 });
        res.json({ success: true, data: { sessions } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching sessions' });
    }
});

module.exports = router;




