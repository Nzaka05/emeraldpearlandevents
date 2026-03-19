const express = require('express');
const {
    getDashboard, updateAvailability, respondToAssignment,
    clockInOut, getAttendanceHistory, getNotifications,
    confirmPayment, disputePayment, getPaymentHistory,
    subscribePush, updateProfile, changeOwnPassword,
    uploadProfilePhoto
} = require('../staff-controllers/staffController');
const { protect, authorize } = require('../staff-middleware/auth');
const { validatePasswordChange, sanitizeRequestBody } = require('../staff-middleware/validation');
const { uploadStaffPhoto } = require('../staff-middleware/upload');

const router = express.Router();

router.use(protect);
router.use(authorize('Staff', 'Supervisor'));

router.get('/dashboard', getDashboard);
router.put('/profile', sanitizeRequestBody, updateProfile);
router.post('/change-password', validatePasswordChange, changeOwnPassword);
router.post('/availability', sanitizeRequestBody, updateAvailability);
router.post('/assignments/:id/response', sanitizeRequestBody, respondToAssignment);
router.post('/profile/photo', uploadStaffPhoto, uploadProfilePhoto);
router.post('/attendance', sanitizeRequestBody, clockInOut);
router.get('/attendance-history', getAttendanceHistory);
router.get('/notifications', getNotifications);
router.post('/assignments/:id/payment/confirm', confirmPayment);
router.post('/assignments/:id/payment/dispute', sanitizeRequestBody, disputePayment);
router.get('/payment-history', getPaymentHistory);
router.post('/push-subscribe', subscribePush);

module.exports = router;
