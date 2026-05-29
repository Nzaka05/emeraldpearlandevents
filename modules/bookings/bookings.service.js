/**
 * Records Service
 * All business logic stays here and avoids HTTP concerns
 */

const axios = require('axios');
const axiosRetry = require('axios-retry').default || require('axios-retry');
const repositoryPath = './bookings.repository';
const repository = require(repositoryPath);
const AdminNotification = require('../../server/models/AdminNotification');
const PricingSettings = require('../../server/models/PricingSettings');
const queues = require('../../config/queues');
const bookingQueue = queues.bookingQueue;
const notificationQueue = queues.notificationQueue;
const logger = require('../../server/utils/logger');
const emailService = require('../../server/services/emailService');
const { createSyncHeaders } = require('../../staff-system/middleware/syncAuth');
const { sendClientAppreciationEmail, sendStaffFeedbackRequestEmail, sendEmail } = emailService;
const Staff = require('../../server/models/Staff');

const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

class RecordsService {
  /**
   * Build booking search query from filters
   */
  buildQuery(filters = {}) {
    const query = {};

    if (filters.status) query.status = filters.status;
    if (filters.eventType) query.eventType = filters.eventType;
    
    if (filters.clientEmail) {
      query.customerEmail = { $regex: filters.clientEmail, $options: 'i' };
    }
    
    if (filters.clientPhone) {
      query.customerPhone = { $regex: filters.clientPhone.replace(/\s|-/g, ''), $options: 'i' };
    }
    
    if (filters.search) {
      query.$or = [
        { 'customerId.name': { $regex: filters.search, $options: 'i' } },
        { location: { $regex: filters.search, $options: 'i' } },
        { bookingReference: { $regex: filters.search, $options: 'i' } }
      ];
    }

    return query;
  }

  /**
   * Get all bookings with search/filter
   */
  async getAllRecords(filters = {}, page = 1, limit = 25) {
    const query = this.buildQuery(filters);
    return await repository.findAll({ page, limit, ...query });
  }

  /**
   * Get single booking by ID
   */
  async getRecordById(recordId) {
    return await repository.findById(recordId);
  }

  /**
   * Update booking (status, notes, assignedStaff)
   */
  async updateRecord(recordId, updateData, adminId) {
    const record = await repository.findById(recordId);
    if (!record) return null;

    const updatePayload = {};
    if (updateData.status) updatePayload.status = updateData.status;
    if (updateData.isPaid !== undefined) updatePayload.isPaid = updateData.isPaid;

    if (Array.isArray(updateData.assignedStaff)) {
      const validObjectIds = updateData.assignedStaff
        .filter(item => typeof item === 'string' && /^[a-fA-F0-9]{24}$/.test(item));
      if (validObjectIds.length > 0) {
        updatePayload.assignedStaff = validObjectIds;
      }
    }

    if (typeof updateData.notes === 'string' && updateData.notes.trim()) {
      updatePayload.notes = updateData.notes;
      updatePayload.$push = {
        adminNotes: {
          note: updateData.notes,
          addedBy: adminId
        }
      };
    }

    const updatedRecord = await repository.updateById(recordId, updatePayload);
    
    // Handle confirmation workflow
    if (updatedRecord && updatedRecord.status === 'confirmed') {
      await this.handleRecordConfirmation(updatedRecord);
    }

    // Create notification
    if (updatedRecord) {
      await AdminNotification.create({
        type: 'system',
        message: `Record ${updatedRecord.bookingReference} updated`,
        bookingRef: updatedRecord._id
      });
    }

    return updatedRecord;
  }

  /**
   * Handle booking confirmation (queue or inline sync)
   */
  async handleRecordConfirmation(record) {
    if (queueMode === 'async') {
      // Queue for background worker
      await bookingQueue.add('confirmed', { bookingId: record._id.toString() });
      return;
    }

    // Inline fallback: sync directly to staff portal
    try {
      const syncSecret = process.env.SYNC_SECRET;
      const staffPayRate = await this.getStaffPayRate(record.eventType);

      await axios.post(
        `${process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001'}/internal/sync-booking`,
        {
          title: record.eventType || 'Event',
          description: record.notes || 'Synced from client booking',
          location: record.location || 'TBD',
          date: record.eventDate,
          start_time: '09:00',
          end_time: '17:00',
          pay_rate: staffPayRate,
          usherCount: record.usherCount || 0,
          required_staff_count: record.selectedServices?.reduce((sum, s) => sum + (s.quantity || 0), 0) || record.usherCount || 1,
          booking_ref: record._id.toString(),
          client_name: record.customerId?.name || '',
          client_email: record.customerId?.email || ''
        },
        { headers: createSyncHeaders(syncSecret, {
            title: record.eventType || 'Event',
            description: record.notes || 'Synced from client booking',
            location: record.location || 'TBD',
            date: record.eventDate,
            start_time: '09:00',
            end_time: '17:00',
            pay_rate: staffPayRate,
            usherCount: record.usherCount || 0,
            required_staff_count: record.selectedServices?.reduce((sum, s) => sum + (s.quantity || 0), 0) || record.usherCount || 1,
            booking_ref: record._id.toString(),
            client_name: record.customerId?.name || '',
            client_email: record.customerId?.email || ''
        }) }
      );

      await repository.updateSyncStatus(record._id, 'synced');
      logger.info({ bookingId: record._id?.toString() }, 'Record synced to staff portal');
    } catch (syncErr) {
      await repository.updateSyncStatus(record._id, 'pending', syncErr.message);
      logger.warn({ err: syncErr, bookingId: record._id?.toString() }, 'Staff portal sync failed (inline mode)');
    }
  }

  /**
   * Get staff pay rate from pricing settings
   */
  async getStaffPayRate(eventType) {
    try {
      const pricing = await PricingSettings.findOne().lean();
      if (pricing && pricing.categories) {
        const eventTypeNorm = (eventType || '').toLowerCase();
        const match = pricing.categories.find(c => 
          c.isActive && eventTypeNorm.includes(c.name.toLowerCase().split('/')[0].trim().toLowerCase())
        );
        if (match) return match.staffPayRate || 1000;
      }
    } catch (e) {
      logger.warn({ err: e }, 'Pricing lookup failed');
    }
    return 1000;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(recordId, amountPaid, isPaid) {
    const record = await repository.updatePayment(recordId, amountPaid, isPaid);
    
    if (!record) return null;

    // Create notification
    if (isPaid) {
      const customer = await repository.getCustomer(record.customerId);
      await AdminNotification.create({
        type: 'payment_received',
        title: 'Payment Received',
        message: `Payment of KES ${record.amountPaid?.toLocaleString() || 0} received from ${customer?.name || 'client'} for record ${record.bookingReference}`,
        bookingRef: record._id,
        icon: 'money-bill',
        isRead: false
      });
    } else {
      await AdminNotification.create({
        type: 'payment_received',
        message: `Payment updated for record ${record.bookingReference}`,
        bookingRef: record._id,
        icon: 'money-bill'
      });
    }

    return record;
  }

  /**
   * Record payment for booking
   */
  async recordPayment(recordId, paymentData, adminId) {
    const record = await repository.findById(recordId);
    if (!record) return null;

    // Create payment record
    const payment = await repository.createPayment({
      bookingId: record._id,
      clientId: record.customerId ? record.customerId._id : null,
      clientName: record.customerId ? record.customerId.name : '',
      clientEmail: record.customerId ? record.customerId.email : '',
      amount: Number(paymentData.amount),
      paymentMethod: paymentData.paymentMethod || 'MPesa',
      transactionId: paymentData.transactionId || '',
      paymentDate: paymentData.paymentDate ? new Date(paymentData.paymentDate) : new Date(),
      notes: paymentData.notes || '',
      recordedBy: adminId
    });

    // Update record
    record.amountPaid = (record.amountPaid || 0) + Number(paymentData.amount);
    record.isPaid = true;
    await record.save();

    // Notification
    await AdminNotification.create({
      type: 'payment_received',
      message: `Payment of KES ${paymentData.amount} recorded for record ${record.bookingReference}`,
      bookingRef: record._id,
      icon: 'money-bill'
    });

    // Sync payment and send proforma
    await this.syncPaymentAndSendProforma(record, paymentData);

    return { payment, record };
  }

  /**
   * Sync payment to staff portal and send proforma invoice
   */
  async syncPaymentAndSendProforma(record, paymentData) {
    try {
      const axios = require('axios');
      const syncSecret = process.env.SYNC_SECRET;
      
      // Sync payment to staff portal
      await axios.post(
        `${process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001'}/internal/sync-payment`,
        {
          booking_ref: record._id.toString(),
          clientPaymentAmount: paymentData.amount,
          paymentMethod: paymentData.paymentMethod,
          transactionId: paymentData.transactionId
        },
        { headers: createSyncHeaders(syncSecret, {
            booking_ref: record._id.toString(),
            clientPaymentAmount: paymentData.amount,
            paymentMethod: paymentData.paymentMethod,
            transactionId: paymentData.transactionId
        }) }
      );

      // Build proforma HTML
      const pricing = await PricingSettings.findOne().lean();
      const vatRate = pricing?.vatRate || 16;
      const subtotal = parseFloat(paymentData.amount) || 0;
      const vatAmount = Math.round(subtotal * vatRate / 100);
      const totalAmount = subtotal + vatAmount;
      
      const proformaHtml = `
        <p style="color:#334155;">Dear <strong>${record.customerId?.name || 'Client'}</strong>,</p>
        <p style="color:#334155;margin-bottom:20px;">Thank you for your payment. Please find your invoice details below.</p>
        <div style="background:#f8fafc;border-radius:8px;padding:20px;border-left:4px solid #C9A84C;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#64748b;">Event</td><td style="padding:6px 0;font-weight:700;color:#0D2B1F;text-align:right;">${record.eventType}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Event Date</td><td style="padding:6px 0;text-align:right;">${record.eventDate ? new Date(record.eventDate).toLocaleDateString('en-KE') : 'TBD'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Payment Method</td><td style="padding:6px 0;text-align:right;">${paymentData.paymentMethod}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Transaction ID</td><td style="padding:6px 0;text-align:right;">${paymentData.transactionId || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Amount Paid</td><td style="padding:6px 0;text-align:right;">KSh ${subtotal.toLocaleString()}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">VAT (${vatRate}%)</td><td style="padding:6px 0;text-align:right;">KSh ${vatAmount.toLocaleString()}</td></tr>
            <tr style="border-top:2px solid #e2e8f0;"><td style="padding:10px 0;font-weight:900;color:#0D2B1F;">TOTAL</td><td style="padding:10px 0;font-weight:900;color:#059669;text-align:right;">KSh ${totalAmount.toLocaleString()}</td></tr>
          </table>
        </div>
        <p style="color:#64748b;font-size:0.85rem;margin-top:16px;">Record Reference: <strong>${record.bookingReference}</strong></p>`;

      // Send proforma email (queue or inline)
      if (queueMode === 'async') {
        await notificationQueue.add('email', {
          type: 'server.payment.proforma_email',
          payload: {
            to: [{ email: record.customerId?.email, name: record.customerId?.name }],
            subject: `Payment Confirmation & Invoice — ${record.eventType} | Emerald Pearland Events`,
            htmlBody: proformaHtml,
            title: 'PAYMENT CONFIRMATION'
          }
        });
      } else {
        await sendEmail({
          to: [{ email: record.customerId?.email, name: record.customerId?.name }],
          subject: `Payment Confirmation & Invoice — ${record.eventType} | Emerald Pearland Events`,
          htmlContent: proformaHtml
        });
      }
      logger.info({ bookingId: record._id?.toString() }, 'Proforma invoice sent');
    } catch (invErr) { 
      logger.warn({ err: invErr, bookingId: record._id?.toString() }, 'Proforma invoice/sync skipped');
    }
  }

  /**
   * Send appreciation email to client
   */
  async sendAppreciationEmail(recordId, adminId) {
    const record = await repository.findById(recordId);
    if (!record) return null;

    if (queueMode === 'async') {
      await notificationQueue.add('email', {
        type: 'server.booking.appreciation',
        payload: {
          bookingId: record._id.toString(),
          customerId: record.customerId?._id?.toString() || null
        }
      });
    } else {
      await sendClientAppreciationEmail(record, record.customerId);
    }

    // Record in admin notes
    await repository.addAdminNote(recordId, 'Sent Client Appreciation & Feedback Email', adminId);

    await AdminNotification.create({
      type: 'system',
      message: `Sent appreciation email to ${record.customerId.name} for ${record.bookingReference}`,
      bookingRef: record._id,
    });

    return record;
  }

  /**
   * Send feedback request to staff members
   */
  async sendStaffFeedbackRequest(recordId, staffIds, customMessage, adminId) {
    const record = await repository.findById(recordId);
    if (!record) return null;

    let successCount = 0;
    let failCount = 0;

    for (const staffId of staffIds) {
      const staff = await Staff.findById(staffId);
      if (staff && staff.email) {
        try {
          if (queueMode === 'async') {
            await notificationQueue.add('email', {
              type: 'server.staff.feedback_request',
              payload: {
                bookingId: record._id.toString(),
                staffEmail: staff.email,
                staffName: staff.name,
                customMessage
              }
            });
          } else {
            await sendStaffFeedbackRequestEmail(staff.email, staff.name, record, customMessage);
          }
          successCount++;
        } catch (e) {
          logger.error({ err: e, staffId: staff._id?.toString(), staffName: staff.name }, 'Failed sending staff feedback request');
          failCount++;
        }
      } else {
        failCount++;
      }
    }

    // Record in admin notes
    await repository.addAdminNote(
      recordId,
      `Sent staff feedback request to ${staffIds.length} members. (Success: ${successCount}, Fail: ${failCount})`,
      adminId
    );

    return { successCount, failCount };
  }

  /**
   * Assign staff (supervisor + team) to a booking
   * @returns {{ booking, assignedNames: string[] } | null}
   */
  async assignStaff(bookingId, { supervisorId, staffIds }) {
    const booking = await repository.assignStaff(bookingId, { supervisorId, staffIds });
    if (!booking) return null;

    // Build human-readable names for the notification
    const assignedNames = [];
    if (supervisorId) {
      const sup = await repository.findStaffById(supervisorId);
      if (sup) assignedNames.push(`Supervisor: ${sup.name}`);
    }
    if (staffIds && staffIds.length) {
      const team = await repository.findStaffByIds(staffIds);
      team.forEach(s => assignedNames.push(s.name));
    }

    await AdminNotification.create({
      type: 'staff_assigned',
      title: 'Staff Assigned to Booking',
      bookingRef: booking._id,
      message: `Staff assigned to booking #${booking.bookingReference || booking._id}: ${assignedNames.join(', ') || 'None'}`,
      isRead: false
    });

    return { booking, assignedNames };
  }

  /**
   * Delete booking
   */
  async deleteRecord(recordId) {
    return await repository.deleteById(recordId);
  }
}

module.exports = new RecordsService();
