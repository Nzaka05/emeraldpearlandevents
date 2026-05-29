function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirstNonEmpty(values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
}

function parseMpesaTimestamp(value) {
  if (!value && value !== 0) return null;
  const raw = String(value).trim();
  if (!/^\d{14}$/.test(raw)) return null;

  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6)) - 1;
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));

  return new Date(year, month, day, hour, minute, second);
}

function normalizeMpesaCallback(payload = {}) {
  const explicitIdempotencyKey = pickFirstNonEmpty([
    payload.idempotencyKey,
    payload.IdempotencyKey
  ]);

  const b2cResult = payload.Result;
  if (b2cResult && typeof b2cResult === 'object') {
    const resultCode = toFiniteNumber(b2cResult.ResultCode);
    const identifiers = {
      transactionId: pickFirstNonEmpty([b2cResult.TransactionID]),
      conversationId: pickFirstNonEmpty([b2cResult.ConversationID, b2cResult.ConversationId]),
      originatorConversationId: pickFirstNonEmpty([
        b2cResult.OriginatorConversationID,
        b2cResult.OriginatorConversationId
      ]),
      occasion: pickFirstNonEmpty([b2cResult.Occasion])
    };

    const idempotencyKey = pickFirstNonEmpty([
      explicitIdempotencyKey,
      identifiers.originatorConversationId,
      identifiers.conversationId,
      identifiers.transactionId,
      identifiers.occasion && resultCode !== null
        ? `mpesa:b2c:${identifiers.occasion}:${resultCode}`
        : null
    ]);

    return {
      flow: 'b2c',
      idempotencyKey,
      resultCode,
      resultDesc: pickFirstNonEmpty([b2cResult.ResultDesc]) || '',
      amount: toFiniteNumber(b2cResult.TransactionAmount),
      phoneNumber: pickFirstNonEmpty([b2cResult.ReceiverParty, b2cResult.PhoneNumber]),
      transactionDate: parseMpesaTimestamp(b2cResult.TransactionDate),
      identifiers,
      raw: payload
    };
  }

  const stkCallback = payload.Body?.stkCallback;
  if (stkCallback && typeof stkCallback === 'object') {
    const callbackItems = Array.isArray(stkCallback.CallbackMetadata?.Item)
      ? stkCallback.CallbackMetadata.Item
      : [];
    const metadataByName = callbackItems.reduce((acc, item) => {
      const name = item?.Name;
      if (!name) return acc;
      acc[name] = item.Value;
      return acc;
    }, {});

    const resultCode = toFiniteNumber(stkCallback.ResultCode);
    const identifiers = {
      merchantRequestId: pickFirstNonEmpty([stkCallback.MerchantRequestID]),
      checkoutRequestId: pickFirstNonEmpty([stkCallback.CheckoutRequestID]),
      mpesaReceiptNumber: pickFirstNonEmpty([metadataByName.MpesaReceiptNumber])
    };

    const idempotencyKey = pickFirstNonEmpty([
      explicitIdempotencyKey,
      identifiers.checkoutRequestId,
      identifiers.merchantRequestId,
      identifiers.mpesaReceiptNumber,
      resultCode !== null
        ? `mpesa:stk:${identifiers.checkoutRequestId || identifiers.merchantRequestId || 'unknown'}:${resultCode}`
        : null
    ]);

    return {
      flow: 'stk',
      idempotencyKey,
      resultCode,
      resultDesc: pickFirstNonEmpty([stkCallback.ResultDesc]) || '',
      amount: toFiniteNumber(metadataByName.Amount),
      phoneNumber: pickFirstNonEmpty([metadataByName.PhoneNumber]),
      transactionDate: parseMpesaTimestamp(metadataByName.TransactionDate),
      identifiers,
      raw: payload
    };
  }

  return null;
}

module.exports = {
  normalizeMpesaCallback
};