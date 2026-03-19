const { Server } = require('socket.io');

module.exports = function (server) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected to socket: ${socket.id}`);

        // Join a specific room based on user role or ID
        socket.on('joinRoom', (room) => {
            socket.join(room);
            console.log(`Socket ${socket.id} joined room ${room}`);
        });

        // JWT Auth for Client Portal
        if (socket.handshake.auth && socket.handshake.auth.token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(socket.handshake.auth.token, process.env.CLIENT_JWT_SECRET);
                if (decoded && decoded.client_id) {
                    socket.join(`Client:${decoded.client_id}`);
                    console.log(`Socket ${socket.id} securely joined Client:${decoded.client_id}`);
                }
            } catch (err) {
                console.log(`Socket ${socket.id} provided invalid client token`);
            }
        }

        // Notify admins of new live metrics
        socket.on('metricUpdate', (data) => {
            io.to('Admin').emit('adminMetricUpdate', data);
        });

        // Staff Clock in / out notification
        socket.on('staffAttendance', (data) => {
            // Notify supervisor of the team if applicable
            if (data.team_id) {
                io.to(`Team_${data.team_id}`).emit('teamAttendanceUpdate', data);
            }
            // Notify admins
            io.to('Admin').emit('adminAttendanceUpdate', data);
        });

        // Staff Accept / Decline Assignment
        socket.on('assignmentResponse', (data) => {
            io.to('Admin').emit('adminAssignmentUpdate', data);
        });

        // Team communication
        socket.on('teamMessage', (data) => {
            io.to(`Team_${data.team_id}`).emit('newTeamMessage', data);
        });

        // Profile sync update
        socket.on('syncProfileUpdate', (data) => {
            // Notify all connected instances of the same user
            io.to(data.userId).emit('profileSyncUpdate', data);
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });

    // Make io available globally if needed, or return it
    global.io = io;
    return io;
};
