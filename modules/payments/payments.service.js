/**
 * Payments Service
 * All payment business logic — STK push, callback processing, status checks
 * No HTTP concerns enter here
 */

const axios = require('axios');
const repositoryPath = './payments.repository';
const repository = require(repositoryPath);
const logger = require('../../server/utils/logger');
const { normalizeMpesaCallback } = require('../../utils/mpesaCallbackNormalizer');

class PaymentsService {
  /**
   * Normalize STK/B2C callback payloads into one canonical contract.
   */
  normalizeMpesaCallback(payload = {}) {
    return normalizeMpesaCallback(payload);
  }

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
  async getAllPayments(filters = {}, page = 1, limit = 25) {
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
   * Process M-Pesa callback payload (supports STK and B2C forms)
   */
  async processMpesaCallback(payload) {
    const normalized = this.normalizeMpesaCallback(payload);
    if (!normalized) {
      throw new Error('Invalid M-Pesa callback payload');
    }

    const { idempotencyKey, resultCode } = normalized;
    if (!idempotencyKey) {
      throw new Error('Unable to derive callback idempotency key');
    }

    try {
      // Check if already processed
      const existingTransaction = await repository.findTransaction(idempotencyKey);
      if (existingTransaction) {
        logger.info('M-Pesa callback already processed');
        logger.debug({ idempotencyKey }, 'Duplicate callback ignored');
        return { success: true, duplicate: true };
      }

      // Process based on result code
      if (resultCode === 0) {
        // Success
        await this.handleMpesaSuccess(normalized);
      } else {
        // Failure
        await this.handleMpesaFailure(normalized);
      }

      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'M-Pesa callback processing error');
      throw error;
    }
  }

  /**
   * Handle successful M-Pesa callback
   */
  async handleMpesaSuccess(normalized) {
    const { idempotencyKey, flow, amount, phoneNumber, transactionDate, identifiers, resultCode, resultDesc } = normalized;

    // Create transaction record
    const transaction = await repository.upsertTransaction({
      transactionId: idempotencyKey,
      type: flow === 'b2c' ? 'staffPayroll' : 'clientPayment',
      sourceSystem: 'main-portal',
      amount: amount || 0,
      currency: 'KES',
      direction: flow === 'b2c' ? 'out' : 'in',
      description: resultDesc || `M-Pesa ${flow.toUpperCase()} callback`,
      paymentMethod: 'MPesa',
      status: 'Completed',
      referenceCollection: flow === 'b2c' ? 'Assignment' : 'ClientPayment',
      referenceId: identifiers.occasion || identifiers.checkoutRequestId || '',
      metadata: {
        flow,
        resultCode,
        transactionDate,
        phoneNumber,
        ...identifiers
      }
    });

    logger.info('M-Pesa callback success recorded');
    logger.debug({
      transactionId: idempotencyKey,
      flow,
      amount,
      phoneNumber,
      resultCode
    }, 'M-Pesa callback success details');

    return transaction;
  }

  /**
   * Handle failed M-Pesa callback
   */
  async handleMpesaFailure(normalized) {
    const { idempotencyKey, flow, resultCode, resultDesc, identifiers, amount, phoneNumber, transactionDate } = normalized;

    // Create transaction record with failed status
    const transaction = await repository.upsertTransaction({
      transactionId: idempotencyKey,
      type: flow === 'b2c' ? 'staffPayroll' : 'clientPayment',
      sourceSystem: 'main-portal',
      amount: amount || 0,
      currency: 'KES',
      direction: flow === 'b2c' ? 'out' : 'in',
      description: resultDesc || `M-Pesa ${flow.toUpperCase()} callback failed`,
      paymentMethod: 'MPesa',
      status: 'Failed',
      referenceCollection: flow === 'b2c' ? 'Assignment' : 'ClientPayment',
      referenceId: identifiers.occasion || identifiers.checkoutRequestId || '',
      metadata: {
        flow,
        resultCode,
        resultDesc,
        transactionDate,
        phoneNumber,
        ...identifiers
      }
    });

    logger.info({ resultCode }, 'M-Pesa callback failure recorded');
    logger.debug({ transactionId: idempotencyKey, resultCode, resultDesc, flow }, 'M-Pesa callback failure details');

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
      logger.error({ err: error }, 'M-Pesa status check error');
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

      logger.info('STK push initiated');
      logger.debug({ response: response.data }, 'STK push response details');
      return response.data;
    } catch (error) {
      logger.error({ err: error, responseData: error.response?.data }, 'STK push error');
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
      logger.error({ err: error }, 'M-Pesa token error');
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
      logger.info({ assignmentId }, 'Payment marked as received');
      logger.debug({ assignmentId, staffPaymentId }, 'Payment receipt identifiers');
    }
    return assignment;
  }
}

module.exports = new PaymentsService();
