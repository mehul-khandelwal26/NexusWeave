require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const path = require('path');

const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/orgs');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const messageRoutes = require('./routes/messages');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/messages', messageRoutes);

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/index.html'));
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'NexusWeave API Server',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: 'active',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ errors: ['An unexpected server error occurred.'] });
});

// --- WebSocket Setup ---
const wss = new WebSocket.Server({ server, path: '/ws' });
const userSockets = new Map(); // userId -> Set of WS connections

function sendToUser(userId, data) {
  const userSet = userSockets.get(userId.toString());
  if (userSet) {
    const payload = JSON.stringify(data);
    userSet.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

wss.on('connection', async (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace(/^[^?]*\?/, ''));
  const token = urlParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication token missing');
    return;
  }

  let userPayload;
  try {
    userPayload = jwt.verify(token, process.env.JWT_SECRET || 'nexusweave_super_secret_jwt_key_2026');
  } catch (err) {
    ws.close(4002, 'Invalid or expired token');
    return;
  }

  const userId = userPayload.sub;
  const userEmail = userPayload.email;

  ws.userId = userId;
  ws.userEmail = userEmail;

  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(ws);

  ws.send(JSON.stringify({ type: 'connected', payload: { userId, email: userEmail } }));

  ws.on('message', async (rawMessage) => {
    try {
      const data = JSON.parse(rawMessage.toString());
      const { type, payload } = data;

      if (type === 'send_message') {
        const { toUserId, toEmail, text } = payload || {};
        if (!text || !text.trim()) return;

        let targetUser = null;
        if (toUserId && mongoose.Types.ObjectId.isValid(toUserId)) {
          targetUser = await User.findById(toUserId);
        }
        if (!targetUser && toEmail) {
          targetUser = await User.findOne({ email: toEmail.trim().toLowerCase() });
        }

        if (!targetUser) {
          ws.send(JSON.stringify({ type: 'error', payload: { message: 'Recipient not found' } }));
          return;
        }

        const newMsg = await Message.create({
          sender: userId,
          receiver: targetUser._id,
          content: text.trim(),
          isRead: false
        });

        const safeMsg = newMsg.toSafeObject();
        safeMsg.fromEmail = userEmail;
        safeMsg.toEmail = targetUser.email;
        if (payload && payload.tempId) {
          safeMsg.tempId = payload.tempId;
        }

        // Send to receiver & sender
        sendToUser(targetUser._id.toString(), { type: 'new_message', payload: safeMsg });
        sendToUser(userId, { type: 'new_message', payload: safeMsg });

      } else if (type === 'typing') {
        const { toUserId, toEmail, isTyping } = payload || {};
        let targetUser = null;
        if (toUserId && mongoose.Types.ObjectId.isValid(toUserId)) {
          targetUser = await User.findById(toUserId);
        }
        if (!targetUser && toEmail) {
          targetUser = await User.findOne({ email: toEmail.trim().toLowerCase() });
        }

        if (targetUser) {
          sendToUser(targetUser._id.toString(), {
            type: 'user_typing',
            payload: { fromUserId: userId, fromEmail: userEmail, isTyping: Boolean(isTyping) }
          });
        }

      } else if (type === 'mark_read') {
        const { fromUserId, fromEmail } = payload || {};
        let senderUser = null;
        if (fromUserId && mongoose.Types.ObjectId.isValid(fromUserId)) {
          senderUser = await User.findById(fromUserId);
        }
        if (!senderUser && fromEmail) {
          senderUser = await User.findOne({ email: fromEmail.trim().toLowerCase() });
        }

        if (senderUser) {
          await Message.updateMany(
            { sender: senderUser._id, receiver: userId, isRead: false },
            { $set: { isRead: true } }
          );

          sendToUser(senderUser._id.toString(), {
            type: 'messages_read',
            payload: { byUserId: userId, byEmail: userEmail }
          });
          sendToUser(userId, {
            type: 'messages_read',
            payload: { fromUserId: senderUser._id.toString(), fromEmail: senderUser.email }
          });
        }
      }
    } catch (err) {
      console.error('WebSocket message handler error:', err);
    }
  });

  ws.on('close', () => {
    const userSet = userSockets.get(userId);
    if (userSet) {
      userSet.delete(ws);
      if (userSet.size === 0) {
        userSockets.delete(userId);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexusweave';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas Database');
    server.listen(PORT, () => {
      console.log(`🚀 NexusWeave Backend Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server initialized on ws://localhost:${PORT}/ws`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.error('Server cannot start without a database connection. Exiting.');
    process.exit(1);
  });
