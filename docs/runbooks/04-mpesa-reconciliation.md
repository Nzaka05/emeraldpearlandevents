# M-Pesa Reconciliation & Failure Recovery Runbook

**Purpose:** Handle failed M-Pesa transactions, reconcile payments, and recover from transaction loss.  
**RTO:** <30 minutes  
**Owner:** Finance / Payment Operations

---

## Prerequisites

- M-Pesa business account dashboard access (STK reporting)
- Emerald API admin credentials
- MongoDB direct access or Compass for queries (optional)
- Safaricom support contact (for transaction details)

---

## SCENARIO 1: Single Payment Failed to Process

**When:** Customer reports "payment didn't go through" but SMS received "request sent"  
**Impact:** Single booking affected, customer waiting for confirmation

### Step 1: Verify M-Pesa Transaction Status

1. **Check M-Pesa business dashboard**
   - Log in to https://stk.safaricom.co.ke (or Safaricom portal)
   - Filter transactions: Date range = last 24 hours
   - Search by customer phone number or booking reference
   - Look for status: "Completed", "Pending", or "Failed"

2. **If transaction shows "Completed" on M-Pesa side:**
   - M-Pesa payment succeeded but callback didn't reach us
   - Proceed to **Step 3: Manual Payment Update**

3. **If transaction shows "Failed" on M-Pesa side:**
   - Customer actually declined in STK prompt or insufficient balance
   - Proceed to **Step 2: Customer Communication**

### Step 2: Customer Communication

1. **Inform customer of actual status**
   - "Your payment request expired/failed. Please retry with sufficient balance."

2. **Send payment retry link**
   - Generate new STK push request via admin dashboard
   - Customer receives SMS with new prompt
   - Allow 2-3 retries before escalating

3. **If retries fail:**
   - Suggest alternative payment method (Bank Transfer, Card, etc.)
   - Create manual payment record with notes

### Step 3: Manual Payment Update (if M-Pesa shows Completed)

1. **Locate booking**
   ```bash
   # Option A: Via API
   curl -H "Authorization: Bearer $TOKEN" \
     https://api.emerald.local/api/v1/bookings?search=$phone_or_email

   # Option B: Via MongoDB
   db.bookings.findOne({ "customer.phone": "+254712345678" })
   ```

2. **Check current payment status**
   - Should see payment record with status: "Pending" or "Failed"
   - Note the transaction ID from M-Pesa dashboard

3. **Manual payment trigger** (if admin endpoint exists)
   ```bash
   POST /api/v1/admin/bookings/$bookingId/mark-paid

   {
     "amount": 250000,
     "transactionId": "MPE123456789",
     "paymentMethod": "MPesa",
     "notes": "Manual reconciliation - M-Pesa callback delayed"
   }
   ```

4. **If no admin endpoint:**
   - Use MongoDB directly (require 2-person approval):
   ```javascript
   db.clientpayments.updateOne(
     { transactionId: "MPE123456789" },
     {
       $set: {
         status: "Confirmed",
         updatedAt: new Date()
       }
     }
   );

   db.bookings.updateOne(
     { _id: ObjectId("...") },
     {
       $set: {
         isPaid: true,
         amountPaid: 250000
       }
     }
   );
   ```

5. **Verify update**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     https://api.emerald.local/api/v1/bookings/$bookingId | jq '.data.booking.isPaid'
   # Expected: true
   ```

6. **Monitor staff portal sync**
   - Check if booking now appears on staff portal
   - May take 60 seconds for reconciliation job to run

---

## SCENARIO 2: Multiple Payments Failed (Systematic Issue)

**When:** 10+ payment callbacks missing within 1 hour window  
**Impact:** Batch of bookings stuck in pending, customers contacted multiple times

### Step 1: Identify Affected Transactions

1. **Check Emerald payment queue**
   ```bash
   GET /api/v1/admin/security/queue-health

   # Look for: syncQueue.failed count increasing
   # If > 5, indicates systematic issue
   ```

2. **Query failed payments in database**
   ```bash
   # Via MongoDB or API
   db.clientpayments.find({
     status: "Pending",
     createdAt: { $gte: new Date(Date.now() - 3600000) }
   }).count()

   # If result > 10, systematic issue confirmed
   ```

3. **Check API error logs**
   - Render logs → Filter for "callback" or "payment"
   - Look for errors: "Connection timeout", "Invalid signature", "Duplicate key"

### Step 2: Investigate Root Cause

| Error | Cause | Solution |
|-------|-------|----------|
| "Connection refused on callback" | Firewall blocked M-Pesa IPs | Whitelist 165.225.x.x in Render network settings |
| "Duplicate key error 11000" | idempotencyKey mismatch | Check if M-Pesa retried callback; verify dedup logic |
| "Invalid signature" | SYNC_SECRET changed | Verify SYNC_SECRET matches M-Pesa config |
| "Queue overflow" | BullMQ Redis full | Check Redis memory: `redis-cli info memory` |

### Step 3: Emergency Queue Flush

1. **If Redis is full (Queue overflow)**
   ```bash
   # SSH to Render
   render ssh --service emerald-api

   # Check Redis status
   redis-cli --url $REDIS_URL info memory

   # If memory > 90%, flush pending payments queue
   redis-cli --url $REDIS_URL FLUSHDB ASYNC
   # ⚠️ WARNING: This clears all queues - only as last resort
   ```

2. **Restart payment processor**
   ```bash
   pm2 restart worker  # Restart BullMQ workers
   # or
   Render dashboard → Manual Restart
   ```

### Step 4: Trigger Reconciliation of Failed Transactions

1. **Access reconciliation endpoint**
   ```bash
   POST /api/v1/admin/payments/reconcile
   {
     "startDate": "2024-01-15T10:00:00Z",
     "endDate": "2024-01-15T11:00:00Z"
   }
   ```

2. **Monitor reconciliation progress**
   - Check logs: `pm2 logs reconciliationJob`
   - Should show: "Reconciling 15 failed payments..."
   - Watch for completion: "Reconciliation complete. 12 recovered, 3 still pending."

3. **Verify payment status update**
   ```bash
   db.clientpayments.countDocuments({ 
     status: "Confirmed",
     createdAt: { $gte: ISODate("2024-01-15T10:00:00Z") }
   })
   ```

### Step 5: Notify Customers

1. **Generate affected customer list**
   ```bash
   db.clientpayments.find({
     status: "Pending",
     createdAt: { $gte: ISODate("2024-01-15T10:00:00Z") }
   }).project({ clientEmail: 1, amount: 1 })
   ```

2. **Send batch notification email**
   - Subject: "Your Emerald Pearl Events booking needs payment confirmation"
   - Include: Retry payment link, booking reference, amount
   - Offer alternative payment methods

---

## SCENARIO 3: Dead Letter Queue (DLQ) - Retry Failed Payments

**When:** Payments stuck in failed state after 3+ retry attempts  
**Impact:** Bookings permanently unpaid unless manually recovered

### Step 1: Identify DLQ Payments

1. **Check BullMQ failed job count**
   ```bash
   GET /api/v1/admin/security/queue-health
   # Look for: paymentQueue.failed > 0
   ```

2. **Query permanently failed payments**
   ```bash
   db.clientpayments.find({
     status: "Failed",
     createdAt: { $gte: ISODate("2024-01-15T00:00:00Z") }
   }).sort({ createdAt: -1 }).limit(20)
   ```

### Step 2: Analyze Failure Reason

1. **Check payment metadata for error**
   ```bash
   db.clientpayments.findOne({
     transactionId: "MPE123456"
   }, { lastError: 1, notes: 1 })

   # Output example: "M-Pesa declined: Insufficient balance"
   ```

2. **Categorize failures:**
   - **Customer error** (insufficient balance, wrong PIN): Contact customer
   - **System error** (timeout, connection lost): Manually retry
   - **Invalid transaction** (duplicate, expired): Mark as unrecoverable

### Step 3: Manual Retry for System Errors

1. **Re-queue failed payment for processing**
   ```bash
   # If payment is genuinely recoverable:
   db.clientpayments.updateOne(
     { transactionId: "MPE123456" },
     {
       $set: {
         status: "Pending",
         lastRetryTime: new Date(),
         retryCount: 0,
         lastError: null
       }
     }
   );
   ```

2. **Trigger payment job again**
   - System will automatically retry
   - Monitor: `GET /api/v1/admin/security/queue-health`
   - paymentQueue.waiting should decrease over 5 minutes

### Step 4: Archive Unrecoverable Payments

1. **For duplicate/invalid transactions**
   ```bash
   db.clientpayments.updateOne(
     { transactionId: "MPE999999" },
     {
       $set: {
         status: "Failed",
         archived: true,
         archiveReason: "Duplicate transaction - manual deduplication",
         archivedDate: new Date()
       }
     }
   );
   ```

2. **Update booking as payment failed**
   ```bash
   db.bookings.updateOne(
     { _id: ObjectId("...") },
     {
       $set: {
         isPaid: false,
         paymentStatus: "failed",
         notes: "Payment reconciliation: M-Pesa duplicate transaction. Customer notified."
       }
     }
   );
   ```

---

## SCENARIO 4: M-Pesa Service Outage

**When:** M-Pesa API down, callbacks not arriving, STK pushes failing  
**Impact:** All new payments blocked temporarily  

### Step 1: Confirm Outage

1. **Check Safaricom status page**
   - https://safaricom.co.ke/business/m-pesa/developers
   - Look for: Scheduled maintenance, incident report, status = Operational

2. **Test M-Pesa connectivity**
   ```bash
   # From Render server:
   render ssh --service emerald-api

   curl -X POST https://api.safaricom.co.ke/oauth/v1/generate \
     -H "Authorization: Basic $(echo -n '$CONSUMER_KEY:$CONSUMER_SECRET' | base64)" \
     2>&1 | head -20

   # If connection times out → M-Pesa API unreachable
   ```

### Step 2: Handle Payment Requests During Outage

1. **Pause STK push endpoint** (graceful degradation)
   - POST /api/v1/bookings/:id/pay-now should return:
   ```json
   {
     "success": false,
     "message": "M-Pesa service temporarily unavailable. Please try again in 5 minutes.",
     "retryAfter": 300
   }
   ```

2. **Queue payment requests**
   - Store in temporary queue with timestamp
   - Automatically retry when M-Pesa comes back online

3. **Notify customers**
   - Email/SMS: "Payment processing temporarily delayed. We'll retry automatically."

### Step 3: Resume When M-Pesa Returns

1. **Verify M-Pesa API responding**
   - Repeat connectivity test from Step 1
   - Should succeed with valid oauth token

2. **Process queued payment requests**
   - Trigger batch reconciliation:
   ```bash
   POST /api/v1/admin/payments/batch-reconcile
   {
     "batchSize": 50,
     "retryPending": true
   }
   ```

3. **Monitor for callback surge**
   - M-Pesa may send delayed callbacks for transactions during outage
   - Watch error logs for "duplicate" errors (expected)
   - Idempotency key dedup should handle gracefully

---

## M-Pesa Callback Debugging

### Verify Callback Endpoint

```bash
# Test endpoint publicly accessible
curl -X GET https://api.emerald.local/api/v1/mpesa/callback

# Should return 405 (POST only) or 400 (missing data), NOT 404
```

### Check Whitelist Rules

```bash
# M-Pesa Business config must include:
# - Callback URL: https://api.emerald.local/api/v1/mpesa/callback
# - IP Whitelist: Safaricom M-Pesa IPs (165.225.x.x, etc.)
```

### Test Callback Manually

```bash
# Simulate M-Pesa callback:
curl -X POST https://api.emerald.local/api/v1/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "test123",
        "CheckoutRequestID": "test456",
        "ResultCode": 0,
        "ResultDesc": "The service request is processed successfully.",
        "CallbackMetadata": {
          "Item": [
            { "Name": "Amount", "Value": 250000 },
            { "Name": "MpesaReceiptNumber", "Value": "MPE123456" },
            { "Name": "TransactionDate", "Value": "20240115120000" }
          ]
        }
      }
    }
  }'

# Monitor logs: Should see "Payment processed successfully"
```

---

## Reconciliation Verification Checklist

After any reconciliation:

- [ ] Failed payment count decreased
- [ ] Confirmed payment count increased  
- [ ] Affected bookings marked as paid (isPaid=true)
- [ ] Staff portal bookings updated (re-sync triggered)
- [ ] Customer emails sent (if auto-notification enabled)
- [ ] No new errors in logs post-reconciliation
- [ ] Queue health stable (no spike in failed jobs)
- [ ] Balance sheet matches M-Pesa dashboard

---

## Related Documents

- [M-Pesa Integration Guide](../integrations/mpesa.md)
- [Booking Payment Flow](../business-logic/payment-flow.md)
- [BullMQ Queue Management](../infrastructure/queues.md)

---

## Emergency Contacts

- **Payment Operations Lead:** [Name] - Slack: @payments-lead
- **Finance Team:** [Email]
- **Safaricom Support:** +254 732 499 000 (Business)
- **API Support:** support@emerald.local
