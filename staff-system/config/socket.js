const { Server } = require('socket.io');

module.exports = function (server) {
    const _allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
    const io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || _allowedOrigins.includes(origin)) return callback(null, true);
                callback(new Error(`Socket CORS: origin '${origin}' not permitted`));
            },
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['websocket', 'polling'] // Mobile readiness
    });

    // ── AUTHENTICATION MIDDLEWARE ──────────────────────────────────────
    const jwt = require('jsonwebtoken');
    io.use(async (socket, next) => {
        // Fallback to cookie if token omitted
        let token = socket.handshake.auth?.token || 
                    (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.replace('Bearer ', ''));
                    
        if (!token && socket.handshake.headers.cookie) {
            // Attempt to extract from cookie (simplistic parser for backward compatibility)
            const cookies = socket.handshake.headers.cookie.split(';');
            for (let c of cookies) {
                const [k, v] = c.trim().split('=');
                if (k === 'staff_portal_token' || k === 'portal_token' || k === 'adminToken') {
                    token = v;
                    break;
                }
            }
        }

        if (!token) return next(new Error('Authentication required'));

        try {
            const socketAuthSecret = process.env.STAFF_JWT_SECRET;
            if (!socketAuthSecret) {
                return next(new Error('FATAL: STAFF_JWT_SECRET not configured'));
            }
            const decoded = jwt.verify(token, socketAuthSecret);

            // ── SECURITY FIX: Verify user status + tokenVersion at connection time ──
            const Staff = require('../models/Staff');
            const user = await Staff.findById(decoded.id).select('role status tokenVersion name').lean();

            if (!user) return next(new Error('User not found'));
            if (user.status !== 'Active') return next(new Error('Account suspended'));

            // Verify tokenVersion — reject tokens issued before a version bump
            const tokenVer = decoded.tv ?? 0;
            const userVer = user.tokenVersion ?? 0;
            if (tokenVer < userVer) return next(new Error('Token revoked'));

            socket.user = {
                id: user._id.toString(),
                role: user.role,
                name: user.name,
                tokenVersion: userVer
            };
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`[Socket] Connected: ${socket.id} (User: ${socket.user?.id}, Role: ${socket.user?.role})`);

        // ── AUTOMATIC ROOM SCOPING (server-controlled, not client-requested) ──
        if (socket.user) {
            // Personal room — every user gets their own room for direct messages
            socket.join(socket.user.id);

            if (['Admin', 'SuperAdmin'].includes(socket.user.role)) {
                socket.join('Admin');
            } else {
                // Find their active event and scope them automatically
                try {
                    const Assignment = require('../models/Assignment');
                    const activeEvent = await Assignment.findOne({
                        lifecycle_state: { $in: ['LIVE', 'READY'] },
                        $or: [
                            { supervisor_id: socket.user.id },
                            { accepted_staff_ids: socket.user.id },
                            { assigned_staff_ids: socket.user.id }
                        ]
                    }).select('_id supervisor_id').lean();

                    if (activeEvent) {
                        if (socket.user.role === 'Supervisor' || String(activeEvent.supervisor_id) === socket.user.id) {
                            socket.join(`Supervisor:${activeEvent._id}`);
                            socket.join('Supervisors');
                            socket.join(`Supervisor_${socket.user.id}`);
                        } else {
                            socket.join(`Staff:${activeEvent._id}`);
                        }
                    }
                } catch (e) {
                    console.error('[Socket] Auto-scoping error:', e.message);
                }
            }
        }

        // ── SECURITY FIX: REMOVED the open 'joinRoom' handler ──────────────
        // The old code allowed ANY connected user to join ANY room by name
        // (e.g. socket.emit('joinRoom', 'Admin')), enabling privilege escalation.
        // Room assignment is now EXCLUSIVELY server-controlled above.

        // ── Supervisor personal room join (validated) ─────────────────────────
        socket.on('joinSupervisorRoom', (supervisorId) => {
            // Only allow if the user IS the supervisor requesting their own room,
            // or if they are an Admin.
            if (socket.user.id === supervisorId || ['Admin', 'SuperAdmin'].includes(socket.user.role)) {
                socket.join(`Supervisor_${supervisorId}`);
                socket.join('Supervisors');
                console.log(`[Socket] Supervisor ${supervisorId} joined personal room`);
            } else {
                console.warn(`[Socket] BLOCKED: User ${socket.user.id} tried to join Supervisor room for ${supervisorId}`);
            }
        });

        // ── PHASE 12: Live Event Command Center ──────────────────────────────

        // Admin sends direct message to supervisor — ADMIN ONLY
        socket.on('adminToSupervisor', (data) => {
            if (!['Admin', 'SuperAdmin'].includes(socket.user.role)) {
                return; // Silently ignore unauthorized emits
            }
            if (data.recipientId) {
                io.to(`Supervisor_${data.recipientId}`).emit('adminLiveMessage', data);
            } else {
                io.to('Supervisors').emit('adminLiveMessage', data); // broadcast
            }
            io.to('Admin').emit('adminLiveMessage', data); // echo to admin room
        });

        // Supervisor sends message to admin command center — SUPERVISOR ONLY
        socket.on('supervisorToAdmin', (data) => {
            if (!['Supervisor', 'Admin', 'SuperAdmin'].includes(socket.user.role)) {
                return;
            }
            // Stamp the sender identity from the verified socket.user, not from client data
            data.senderId = socket.user.id;
            data.senderName = socket.user.name;
            io.to('Admin').emit('adminLiveMessage', data);
            io.to(`Supervisor_${socket.user.id}`).emit('adminLiveMessage', data);
        });

        // Emergency flag from supervisor — SUPERVISOR ONLY
        socket.on('emergencyFlag', (data) => {
            if (!['Supervisor', 'Admin', 'SuperAdmin'].includes(socket.user.role)) {
                return;
            }
            // Stamp verified identity
            data.senderId = socket.user.id;
            data.senderName = socket.user.name;
            io.to('Admin').emit('emergencyFlag', data);
            console.log(`[Socket] 🚨 EMERGENCY from supervisor: ${socket.user.name} — ${data.content}`);
        });

        // Admin acknowledges emergency — ADMIN ONLY
        socket.on('emergencyAck', (data) => {
            if (!['Admin', 'SuperAdmin'].includes(socket.user.role)) {
                return;
            }
            io.to('Supervisors').emit('emergencyAcknowledged', data);
            io.to('Admin').emit('emergencyAcknowledged', data);
        });

        // Live supervisor GPS update — SUPERVISOR ONLY
        socket.on('supervisorLocationUpdate', (data) => {
            if (!['Supervisor', 'Admin', 'SuperAdmin'].includes(socket.user.role)) {
                return;
            }
            // Stamp verified identity
            data.supervisorId = socket.user.id;
            io.to('Admin').emit('supervisorLocationUpdate', data);
        });

        // ── PHASE 3 (existing): Metrics, attendance, assignments ─────────────

        socket.on('metricUpdate', (data) => {
            if (!['Admin', 'SuperAdmin'].includes(socket.user.role)) return;
            io.to('Admin').emit('adminMetricUpdate', data);
        });

        socket.on('staffAttendance', (data) => {
            if (data.team_id) {
                io.to(`Team_${data.team_id}`).emit('teamAttendanceUpdate', data);
            }
            io.to('Admin').emit('adminAttendanceUpdate', data);
            // Also relay to live command center
            io.to('Admin').emit('liveAttendanceUpdate', data);
        });

        socket.on('assignmentResponse', (data) => {
            io.to('Admin').emit('adminAssignmentUpdate', data);
        });

        socket.on('teamMessage', (data) => {
            io.to(`Team_${data.team_id}`).emit('newTeamMessage', data);
        });

        socket.on('syncProfileUpdate', (data) => {
            io.to(data.userId).emit('profileSyncUpdate', data);
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);
        });
    });

    // ── EMERGENCY FUNDS: Server-side emit ────────────────────────
    // The 'emergencyFundSent' event is emitted from emergencyFundService.js
    // after a successful payout via: global.io.to('Admin').emit(...)
    // No socket.on() handler needed — frontend admins in the Admin room
    // receive the event automatically with payload:
    //   { event_id, event_title, amount, admin_name, admin_lat, admin_lng, timestamp }

    global.io = io;
    return io;
};
