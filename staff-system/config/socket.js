const { Server } = require('socket.io');

module.exports = function (server) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        transports: ['websocket', 'polling'] // Mobile readiness
    });

    // ── AUTHENTICATION MIDDLEWARE ──────────────────────────────────────
    const jwt = require('jsonwebtoken');
    io.use((socket, next) => {
        // Fallback to cookie if token omitted
        let token = socket.handshake.auth?.token || 
                    (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.replace('Bearer ', ''));
                    
        if (!token && socket.handshake.headers.cookie) {
            // Attempt to extract from cookie (simplistic parser for backward compatibility)
            const cookies = socket.handshake.headers.cookie.split(';');
            for (let c of cookies) {
                const [k, v] = c.trim().split('=');
                if (k === 'portal_token' || k === 'adminToken') {
                    token = v;
                    break;
                }
            }
        }

        if (!token) return next(new Error('Authentication required'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`[Socket] Connected: ${socket.id} (Auth: ${socket.user?.id || socket.user?.adminId})`);

        // ── AUTOMATIC ROOM SCOPING ─────────────────────────────────────────
        if (socket.user) {
            if (socket.user.adminId) {
                socket.join('Admin'); // Main server adminToken
            } else if (socket.user.id) {
                try {
                    const Staff = require('../models/Staff');
                    const staffUser = await Staff.findById(socket.user.id).select('role').lean();
                    if (staffUser) {
                        if (['Admin', 'SuperAdmin'].includes(staffUser.role)) {
                            socket.join('Admin');
                        } else {
                            // Find their active event
                            const Assignment = require('../models/Assignment');
                            const activeEvent = await Assignment.findOne({
                                lifecycle_state: { $in: ['LIVE', 'READY'] },
                                $or: [
                                    { supervisor_id: staffUser._id },
                                    { accepted_staff_ids: staffUser._id },
                                    { assigned_staff_ids: staffUser._id }
                                ]
                            }).select('_id supervisor_id').lean();

                            if (activeEvent) {
                                if (staffUser.role === 'Supervisor' || String(activeEvent.supervisor_id) === String(staffUser._id)) {
                                    socket.join(`Supervisor:${activeEvent._id}`);
                                } else {
                                    socket.join(`Staff:${activeEvent._id}`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[Socket] Auto-scoping error:', e.message);
                }
            }
        }

        // ── Room joining ──────────────────────────────────────────────────────
        socket.on('joinRoom', (room) => {
            socket.join(room);
            console.log(`[Socket] ${socket.id} → room: ${room}`);
        });

        // Supervisor joins their personal room (for direct admin messages)
        socket.on('joinSupervisorRoom', (supervisorId) => {
            socket.join(`Supervisor_${supervisorId}`);
            socket.join('Supervisors'); // broadcast room
            console.log(`[Socket] Supervisor ${supervisorId} joined personal room`);
        });

        // ── PHASE 12: Live Event Command Center ──────────────────────────────

        // Admin sends direct message to supervisor
        socket.on('adminToSupervisor', (data) => {
            // data: { recipientId, senderId, senderName, content, attachment_url }
            if (data.recipientId) {
                io.to(`Supervisor_${data.recipientId}`).emit('adminLiveMessage', data);
            } else {
                io.to('Supervisors').emit('adminLiveMessage', data); // broadcast
            }
            io.to('Admin').emit('adminLiveMessage', data); // echo to admin room
        });

        // Supervisor sends message to admin command center
        socket.on('supervisorToAdmin', (data) => {
            io.to('Admin').emit('adminLiveMessage', data);
            // Echo back to sender's supervisor room
            if (data.senderId) {
                io.to(`Supervisor_${data.senderId}`).emit('adminLiveMessage', data);
            }
        });

        // Emergency flag from supervisor
        socket.on('emergencyFlag', (data) => {
            io.to('Admin').emit('emergencyFlag', data);
            console.log(`[Socket] 🚨 EMERGENCY from supervisor: ${data.senderName} — ${data.content}`);
        });

        // Admin acknowledges emergency
        socket.on('emergencyAck', (data) => {
            io.to('Supervisors').emit('emergencyAcknowledged', data);
            io.to('Admin').emit('emergencyAcknowledged', data);
        });

        // Live supervisor GPS update
        socket.on('supervisorLocationUpdate', (data) => {
            io.to('Admin').emit('supervisorLocationUpdate', data);
        });

        // ── PHASE 3 (existing): Metrics, attendance, assignments ─────────────

        socket.on('metricUpdate', (data) => {
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
