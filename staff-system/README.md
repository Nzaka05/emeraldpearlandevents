# Emerald Events Staff Management System

A production-ready, mobile-first Staff Management, Workforce Coordination, and Event Team Management System, built entirely in Node.js, Express, MongoDB, EJS, and Socket.io.

## Features Built
- **Role-based Authentication**: Admin, Supervisor, and Staff level access.
- **First Login Logic**: Forces securely-generated temporary passwords to be changed.
- **Mobile-First UI**: Single-column EJS views tailored for smartphones (large buttons, sticky actions, VIP gold styles).
- **Socket.io Real-Time Updates**:
  - Live Admin dashboard metrics.
  - Immediate assignment alerts.
  - Team readiness tracking.
- **Event Team Management**: Supervisors can monitor members, remove unavailable participants, and broadcast announcements.
- **Clock-In / Clock-Out**: Geolocation-aware attendance mechanism tracking hours securely.

## Folder Structure
```
/models       - Mongoose schema definitions (Staff, EventTeam, Assignment, etc)
/routes       - Express REST API & Page Routes
/controllers  - Business logic separating views from routes
/middleware   - Auth Protection & Role verification
/views        - EJS Mobile-first templates (Admin, Staff, Supervisor, Auth)
/public       - CSS specific to the portal
/config       - Socket.io bindings
server.js     - Express entry point
```

## How to Run

1. Open a terminal inside the `staff-system` folder.
2. Run database initial seed to create sample users:
   ```bash
   node seed.js
   ```
3. Start the application:
   ```bash
   node server.js
   ```
4. Access the portal at `http://localhost:3001`

**Sample Credentials:**
- Admin: `admin@emeraldevents.com` / `password123`
- Supervisor: `super@emeraldevents.com` / `password123`
- Staff: `staff1@emeraldevents.com` / `password123`

## Future PWA Conversion Notes
- Include a `manifest.json`.
- Cache assets in a `service-worker.js`.
- The current backend MVC approach makes this easily capable of rendering while offline if transitioning to a dedicated API + Frontend client in the future.
