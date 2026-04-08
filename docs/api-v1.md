# API v1 Contract

Base prefix: `/api/v1`

All API responses use this envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-04-08T00:00:00.000Z"
  }
}
```

Error envelope:

```json
{
  "success": false,
  "data": null,
  "error": "message or object",
  "meta": {
    "timestamp": "2026-04-08T00:00:00.000Z"
  }
}
```

## Core Endpoints

- `GET /api/v1/health`
  - Body: none
  - Returns: health/status details

- `POST /api/v1/analytics/event`
  - Body: `{ eventType: string, bookingId?: string, parameter?: string, timestamp?: string }`
  - Returns: tracking acknowledgment

## Public Booking Endpoints

- `GET /api/v1/gallery`
  - Body: none
  - Returns: gallery items

- `POST /api/v1/book-event`
  - Body: `{ fullName, phone, email, eventType, eventDate, eventDuration, location, guestCount, budgetRange, needUshers?, usherCount?, specialRequests? }`
  - Returns: booking confirmation + reference

- `GET /api/v1/booking/:bookingId`
  - Body: none
  - Returns: booking detail

- `PATCH /api/v1/booking/:bookingId/status`
  - Body: `{ status: string }`
  - Returns: updated booking status

## Admin Endpoints

Base prefix: `/api/v1/admin`

### Auth + Profile
- `POST /api/v1/admin/login` — Body: `{ email, password }`
- `POST /api/v1/admin/logout` — Body: none
- `GET /api/v1/admin/me` — Body: none
- `PATCH /api/v1/admin/me` — Body: `{ name?, avatar? }`
- `POST /api/v1/admin/change-password` — Body: `{ currentPassword, newPassword }`
- `GET /api/v1/admin/profile` — Body: none
- `PATCH /api/v1/admin/profile` — Body: `{ name?, email?, avatar? }`

### Notifications + Push
- `GET /api/v1/admin/vapid-public-key` — Body: none
- `POST /api/v1/admin/push-subscribe` — Body: `{ subscription }`
- `GET /api/v1/admin/notifications` — Body: none
- `PATCH /api/v1/admin/notifications/:id/read` — Body: none
- `DELETE /api/v1/admin/notifications/:id` — Body: none

### Analytics + Settings
- `GET /api/v1/admin/analytics/overview` — Body: none
- `GET /api/v1/admin/settings` — Body: none
- `PATCH /api/v1/admin/settings` — Body: settings payload
- `GET /api/v1/admin/pricing` — Body: none
- `PUT /api/v1/admin/pricing` — Body: `{ categories?, vatRate?, globalSupervisorRate?, paymentMethods?, ... }`

### Staff + Customers + Clients
- `GET /api/v1/admin/staff` — Body: none
- `POST /api/v1/admin/staff` — Body: staff payload
- `PATCH /api/v1/admin/staff/:id` — Body: partial staff payload
- `DELETE /api/v1/admin/staff/:id` — Body: none

- `GET /api/v1/admin/customers` — Body: none
- `POST /api/v1/admin/customers` — Body: customer payload
- `GET /api/v1/admin/customers/:id` — Body: none
- `PUT /api/v1/admin/customers/:id` — Body: customer payload
- `DELETE /api/v1/admin/customers/:id` — Body: none

- `GET /api/v1/admin/clients` — Body: none
- `GET /api/v1/admin/clients/:clientId` — Body: none
- `POST /api/v1/admin/clients/:clientId/toggle` — Body: none
- `GET /api/v1/admin/clients/:clientId/audit` — Body: none
- `GET /api/v1/admin/clients/:clientId/sessions` — Body: none

### Gallery + Testimonials
- `GET /api/v1/admin/public/gallery` — Body: none
- `GET /api/v1/admin/public/testimonials` — Body: none
- `GET /api/v1/admin/gallery` — Body: none
- `POST /api/v1/admin/gallery/upload` — Body: multipart upload payload
- `PATCH /api/v1/admin/gallery/:id` — Body: gallery update payload
- `DELETE /api/v1/admin/gallery/:id` — Body: none
- `POST /api/v1/admin/gallery/generate-captions` — Body: `{ imageIds: string[] }`

- `GET /api/v1/admin/testimonials` — Body: none
- `POST /api/v1/admin/testimonials` — Body: testimonial payload
- `PATCH /api/v1/admin/testimonials/:id` — Body: testimonial update payload
- `DELETE /api/v1/admin/testimonials/:id` — Body: none

### Booking Subdomain

Base prefix: `/api/v1/admin/bookings`

- `GET /api/v1/admin/bookings`
- `GET /api/v1/admin/bookings/:id`
- `PATCH /api/v1/admin/bookings/:id`
- `PATCH /api/v1/admin/bookings/:id/pay`
- `POST /api/v1/admin/bookings/:id/payment`
- `POST /api/v1/admin/bookings/:id/send-appreciation`
- `POST /api/v1/admin/bookings/:id/message-staff`
- `POST /api/v1/admin/bookings/:id/assign-staff`
- `DELETE /api/v1/admin/bookings/:id`

Body notes (brief):
- Update: `{ status?, isPaid?, notes?, assignedStaff? }`
- Pay: `{ amountPaid?, isPaid? }`
- Payment record: `{ amount, paymentMethod, transactionId?, paymentDate?, notes? }`
- Message staff: `{ customMessage, staffIds: string[] }`

### Payment Subdomain

Base prefix: `/api/v1/admin/payments`

- `GET /api/v1/admin/payments`
- `GET /api/v1/admin/payments/:id`
- `PUT /api/v1/admin/payments/:id/status`
- `PUT /api/v1/admin/payments/:assignmentId/mark-received/:staffPaymentId`
- `POST /api/v1/admin/payments/stk-push`
- `GET /api/v1/admin/payments/status/:conversationId`
- `POST /api/v1/admin/payments/mpesa/callback` (public callback)
- `POST /api/v1/admin/payments/mpesa/timeout` (public callback)

Body notes (brief):
- Status update: `{ status, updateData? }`
- STK push: `{ phoneNumber, amount, accountReference?, description? }`
- M-Pesa callback: Safaricom callback payload

## Notes

- This document freezes the current v1 surface for external consumers.
- Do not introduce `/api/v2` until a formal versioning plan is approved.
