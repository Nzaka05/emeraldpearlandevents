/**
 * Payments Service
 * All payment business logic — STK push, callback processing, status checks
 * No HTTP concerns enter here
 */

const axios = require('axios');
const repositoryPath = './payments.repository';
const repository = require(repositoryPath);

const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();

class PaymentsService {
  /**
   * Build payment filter query
   */
  buildFilter(filters = {}) {
    const filter = {};

    if (filters.payment_status) filter.payment_status = filters.payment_status;
    if (filters.staff_id) filter.staffId = filters.staff_id;

    if (filters.start_date || filters.end_date) {
      filter.createdAt = {};
      if (filters.start_date) {
        filter.createdAt.$gte = new Date(filters.start_date);
      }
      if (filters.end_date) {
        const endDate = new Date(filters.end_date);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    return filter;
  }

  /**
   * Get all payments with search/filter
   */
  async getAllPayments(filters = {}, page = 1, limit = 20) {
    const filter = this.buildFilter(filters);
    return await repository.findAll(filter, page, limit);
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId) {
    return await repository.findById(paymentId);
  }

  /**
   * Process M-Pesa B2C callback
   * Called by Safaricom after STK push → user enters PIN
   */
  async processMpesaCallback(payload) {
    if (!payload || !payload.Result) {
      throw new Error('Invalid M-Pesa callback payload');
    }

    const result = payload.Result;
    const { ResultCode, ResultDesc, ConversationID, OriginatorConversationID } = result;
    
    // Extract idempotency key to prevent duplicate processing
    const idempotencyKey = payload.idempotencyKey || OriginatorConversationID;

    try {
      // Check if already processed
      const existingTransaction = await repository.findTransaction(idempotencyKey);
      if (existingTransaction) {
        console.log('M-Pesa callback already processed:', idempotencyKey);
        return { success: true, duplicate: true };
      }

      // Process based on result code
      if (ResultCode === 0) {
        // Success
        await this.handleMpesaSuccess(result, idempotencyKey);
      } else {
        // Failure
        await this.handleMpesaFailure(result, idempotencyKey);
      }

      return { success: true };
    } catch (error) {
      console.error('M-Pesa callback processing error:', error);
      throw error;
    }
  }

  /**
   * Handle successful M-Pesa B2C transaction
   */
  async handleMpesaSuccess(result, idempotencyKey) {
    const { 
      ConversationID, 
      TransactionAmount,
      ReceiverParty,
      TransactionDate,
      TransactionID
    } = result;

    // Create transaction record
    const transaction = await repository.upsertTransaction({
      transactionId: idempotencyKey,
      mpesaTransactionId: TransactionID,
      conversationId: ConversationID,
      amount: TransactionAmount,
      recipientPhone: ReceiverParty,
      transactionDate: new Date(TransactionDate),
      status: 'completed',
      type: 'b2c_payment'
    });

    // Extract assignment ID from metadata (stored in conversation)
    // This would be set when initiating STK push
    // For now, log the transaction for manual follow-up
    console.log('✅ M-Pesa B2C success:', {
      transactionId: idempotencyKey,
      amount: TransactionAmount,
      recipient: ReceiverParty,
      mpesaTxnId: TransactionID
    });

    return transaction;
  }

  /**
   * Handle failed M-Pesa B2C transaction
   */
  async handleMpesaFailure(result, idempotencyKey) {
    const { 
      ConversationID,
      ResultCode,
      ResultDesc,
      OriginatorConversationID
    } = result;

    // Create transaction record with failed status
    const transaction = await repository.upsertTransaction({
      transactionId: idempotencyKey,
      conversationId: ConversationID,
      originatorConversationId: OriginatorConversationID,
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      status: 'failed',
      type: 'b2c_payment'
    });

    console.log('❌ M-Pesa B2C failure:', {
      transactionId: idempotencyKey,
      resultCode: ResultCode,
      resultDesc: ResultDesc
    });

    return transaction;
  }

  /**
   * Check M-Pesa transaction status
   */
  async checkTransactionStatus(conversationId) {
    try {
      const accessToken = await this.getMpesaAccessToken();
      
      const response = await axios.post(
        'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query',
        {
          Initiator: process.env.MPESA_INITIATOR_NAME,
          SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
          CommandID: 'TransactionStatusQuery',
          TransactionID: conversationId,
          PartyA: process.env.MPESA_SHORTCODE,
          IdentifierType: 4, // shortcode
          ResultURL: `${process.env.STAFF_SYSTEM_BASE_URL}/api/mpesa/status-callback`,
          QueueTimeOutURL: `${process.env.STAFF_SYSTEM_BASE_URL}/api/mpesa/timeout`
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('M-Pesa status check error:', error.message);
      throw error;
    }
  }

  /**
   * Initiate M-Pesa B2C STK push (C2B flow)
   */
  async initiateStkPush(phoneNumber, amount, accountReference, description = '') {
    try {
      const accessToken = await this.getMpesaAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword();

      const response = await axios.post(
        'https://api.safaricom.co.ke/mpesa/stkpush/v1/processmessage',
        {
          BusinessShortCode: process.env.MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: Math.ceil(amount),
          PartyA: phoneNumber.replace(/^0/, '254'),
          PartyB: process.env.MPESA_SHORTCODE,
          PhoneNumber: phoneNumber.replace(/^0/, '254'),
          CallBackURL: `${process.env.STAFF_SYSTEM_BASE_URL}/api/mpesa/callback`,
          AccountReference: accountReference || 'Payment',
          TransactionDesc: description || 'Payment for event staffing'
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ STK push initiated:', response.data);
      return response.data;
    } catch (error) {
      console.error('STK push error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get M-Pesa access token
   */
  async getMpesaAccessToken() {
    try {
      const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
      ).toString('base64');

      const response = await axios.get(
        'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.access_token;
    } catch (error) {
      console.error('M-Pesa token error:', error.message);
      throw error;
    }
  }

  /**
   * Generate M-Pesa password
   */
  generatePassword() {
    const timestamp = this.getTimestamp();
    const passkey = process.env.MPESA_PASSKEY;
    const shortcode = process.env.MPESA_SHORTCODE;
    const crypto = require('crypto');

    const str = `${shortcode}${passkey}${timestamp}`;
    return crypto.createHash('sha256').update(str).digest('base64');
  }

  /**
   * Get current timestamp in YYYYMMDDHHmmss format
   */
  getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(paymentId, status, updateData = {}) {
    return await repository.updatePaymentStatus(paymentId, status, updateData);
  }

  /**
   * Mark payment as received by staff
   */
  async markPaymentReceived(assignmentId, staffPaymentId) {
    const assignment = await repository.markPaymentReceived(assignmentId, staffPaymentId);
    if (assignment) {
      console.log('✅ Payment marked as received:', { assignmentId, staffPaymentId });
    }
    return assignment;
  }
}

module.exports = new PaymentsService();
