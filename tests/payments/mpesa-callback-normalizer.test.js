const { normalizeMpesaCallback } = require('../../utils/mpesaCallbackNormalizer');

describe('M-Pesa callback normalizer', () => {
  it('normalizes STK callback into canonical shape', () => {
    const payload = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'mid-123',
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 0,
          ResultDesc: 'Success',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 2500 },
              { Name: 'MpesaReceiptNumber', Value: 'RCP12345' },
              { Name: 'TransactionDate', Value: 20240101120030 },
              { Name: 'PhoneNumber', Value: 254712345678 }
            ]
          }
        }
      }
    };

    const normalized = normalizeMpesaCallback(payload);
    expect(normalized).toBeTruthy();
    expect(normalized.flow).toBe('stk');
    expect(normalized.idempotencyKey).toBe('ws_CO_123');
    expect(normalized.resultCode).toBe(0);
    expect(normalized.amount).toBe(2500);
    expect(normalized.phoneNumber).toBe('254712345678');
    expect(normalized.identifiers.checkoutRequestId).toBe('ws_CO_123');
    expect(normalized.identifiers.merchantRequestId).toBe('mid-123');
    expect(normalized.identifiers.mpesaReceiptNumber).toBe('RCP12345');
    expect(normalized.transactionDate instanceof Date).toBe(true);
  });

  it('normalizes B2C callback into canonical shape', () => {
    const payload = {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        OriginatorConversationID: 'OC-12345',
        ConversationID: 'AG_20240101_ABC',
        TransactionID: 'QGH123XYZ',
        TransactionAmount: 8000,
        ReceiverParty: '254799001122',
        TransactionDate: 20240101132520,
        Occasion: 'assignment-123|payment-456'
      }
    };

    const normalized = normalizeMpesaCallback(payload);
    expect(normalized).toBeTruthy();
    expect(normalized.flow).toBe('b2c');
    expect(normalized.idempotencyKey).toBe('OC-12345');
    expect(normalized.resultCode).toBe(0);
    expect(normalized.amount).toBe(8000);
    expect(normalized.phoneNumber).toBe('254799001122');
    expect(normalized.identifiers.occasion).toBe('assignment-123|payment-456');
    expect(normalized.identifiers.transactionId).toBe('QGH123XYZ');
    expect(normalized.transactionDate instanceof Date).toBe(true);
  });

  it('uses explicit idempotency key when provided', () => {
    const payload = {
      idempotencyKey: 'explicit-idem-key',
      Body: {
        stkCallback: {
          MerchantRequestID: 'mid-123',
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 0,
          ResultDesc: 'Success'
        }
      }
    };

    const normalized = normalizeMpesaCallback(payload);
    expect(normalized).toBeTruthy();
    expect(normalized.idempotencyKey).toBe('explicit-idem-key');
  });

  it('returns null for unsupported payloads', () => {
    expect(normalizeMpesaCallback({})).toBeNull();
    expect(normalizeMpesaCallback({ foo: 'bar' })).toBeNull();
  });
});