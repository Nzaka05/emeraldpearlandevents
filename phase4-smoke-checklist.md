# Phase 4 Smoke Check (Pre-Deploy)

Use this checklist to verify Phase 4 changes locally.

## 0) Setup

- [ ] Start API server (the same entrypoint you deploy).
- [ ] Confirm API base URL.
- [ ] Export auth values.

PowerShell setup:

```powershell
$BASE = "http://localhost:3000"

# Preferred (Bearer): paste an existing valid admin JWT
$TOKEN = "PASTE_ADMIN_JWT_HERE"

# Optional fallback (cookie auth) because /api/v1/admin/login sets cookies and does not return token
$EMAIL = "admin@example.com"
$PASSWORD = "your-password"
```

If you need cookie-based auth for curl tests:

```powershell
curl.exe -i -c cookies.txt -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$BASE/api/v1/admin/login"
```

---

## 1) Auto-populate Removal

### 1A. List endpoint should NOT include fully populated customer object

- [ ] Call bookings list.
- [ ] Confirm items do not include a fully populated customer payload (expect reference or reduced projection only).

Bearer version:

```powershell
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/bookings?page=1&limit=5"
```

Cookie fallback:

```powershell
curl.exe -s -b cookies.txt "$BASE/api/v1/admin/bookings?page=1&limit=5"
```

Expected shape (example):

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "customerId": "... or small object",
      "status": "..."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 5,
    "total": 123,
    "totalPages": 25
  }
}
```

### 1B. Detail endpoint should include populated customer where required

- [ ] Fetch one booking ID from list.
- [ ] Call booking detail.
- [ ] Confirm detail has the richer customer info expected by your UI.

```powershell
$BOOKING_ID = "PASTE_BOOKING_ID"
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/bookings/$BOOKING_ID"
```

Expected shape (example):

```json
{
  "success": true,
  "booking": {
    "_id": "...",
    "customerId": {
      "_id": "...",
      "name": "...",
      "email": "..."
    }
  }
}
```

---

## 2) Compound Index Verification (MongoDB Compass / Atlas)

- [ ] Open database -> bookings collection -> Indexes tab.
- [ ] Confirm these indexes exist:
  - { status: 1, eventDate: -1 }
  - { syncStatus: 1, lastSyncAttempt: 1 }
  - { createdAt: -1 }
  - customer/client + status index used in this codebase (field naming may be customerId instead of clientId)
- [ ] Confirm payment indexes in client payments collection:
  - { bookingId: 1, status: 1 }
  - { idempotencyKey: 1 } unique sparse

(Optional shell check):

```javascript
db.bookings.getIndexes()
db.clientpayments.getIndexes()
```

---

## 3) Analytics Aggregation

- [ ] Call analytics overview endpoint.
- [ ] Confirm response includes stats payload.
- [ ] Confirm response time is typically < 500ms locally (warm DB/cache).

```powershell
curl.exe -s -w "\nTotal Time: %{time_total}s\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/analytics/overview"
```

Expected shape (example):

```json
{
  "success": true,
  "stats": {
    "totalBookings": 0,
    "revenue": 0,
    "chartData": {
      "labels": [],
      "revenue": []
    }
  }
}
```

---

## 4) Redis Caching

### 4A. Gallery endpoint speed (miss then hit)

- [ ] First call (cache miss) is slower.
- [ ] Second call (cache hit) is faster and payload matches.

Admin gallery (authenticated):

```powershell
curl.exe -s -w "\n1st call: %{time_total}s\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/gallery?page=1&limit=25" > $null
curl.exe -s -w "\n2nd call: %{time_total}s\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/gallery?page=1&limit=25" > $null
```

Public gallery (no auth):

```powershell
curl.exe -s -w "\n1st public: %{time_total}s\n" "$BASE/api/v1/admin/public/gallery" > $null
curl.exe -s -w "\n2nd public: %{time_total}s\n" "$BASE/api/v1/admin/public/gallery" > $null
```

### 4B. Redis key check

- [ ] Confirm key exists for public gallery cache.

```powershell
redis-cli GET "cache:gallery:list"
```

- [ ] If testing admin paged cache, also check:

```powershell
redis-cli KEYS "cache:gallery:list:admin:*"
```

---

## 5) Pagination

### 5A. Normal pagination response

- [ ] Call with page/limit.
- [ ] Confirm meta.page/meta.total/meta.totalPages present.
- [ ] Confirm X-Total-Count header exists.

Headers + body:

```powershell
curl.exe -i -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/bookings?page=1&limit=5"
```

Expected pagination shape:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 5,
    "total": 0,
    "totalPages": 0
  }
}
```

### 5B. Over-limit request

- [ ] Call with limit=200.
- [ ] Confirm 400 response (or explicit cap behavior).

```powershell
curl.exe -i -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/bookings?limit=200"
```

Expected status:

```text
HTTP/1.1 400
```

### 5C. Notifications cursor pagination

- [ ] Call notifications without cursor.
- [ ] Confirm meta.nextCursor and meta.limit.
- [ ] If nextCursor is returned, call again with lastId.

```powershell
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/notifications?limit=25"
```

```powershell
$LAST_ID = "PASTE_NEXT_CURSOR"
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/notifications?limit=25&lastId=$LAST_ID"
```

Expected shape:

```json
{
  "success": true,
  "notifications": [],
  "unreadCount": 0,
  "meta": {
    "nextCursor": "... or null",
    "limit": 25,
    "total": 0
  }
}
```

---

## 6) Projection Checks

- [ ] Call bookings list.
- [ ] Confirm list items do not include __v and syncAttempts.

```powershell
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/bookings?page=1&limit=5"
```

Quick grep check in output (manual):

- "__v" should be absent
- "syncAttempts" should be absent

---

## 7) Final Pass / Go-No-Go

- [ ] Auto-populate behavior verified (list lean, detail rich)
- [ ] Indexes confirmed in Compass/Atlas
- [ ] Analytics endpoint fast and shape-correct
- [ ] Redis caching confirmed (miss/hit + key present)
- [ ] Pagination + headers + over-limit behavior confirmed
- [ ] Projection fields absent from list responses

If all checks are done, Phase 4 is ready for deploy smoke sign-off.
