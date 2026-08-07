const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');

const { getJwtSecret, verifyToken } = require('./utils/jwt');
const { ensureIndexes } = require('./utils/ensure-indexes');

// Fail fast if JWT_SECRET is missing
try {
  getJwtSecret();
} catch (err) {
  console.error('❌', err.message);
  console.error('Set JWT_SECRET in backend/.env before starting the server.');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/orgs');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const messageRoutes = require('./routes/messages');
const announcementRoutes = require('./routes/announcements');
const activityRoutes = require('./routes/activity');
const focusRoutes = require('./routes/focus');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const rootDir = path.join(__dirname, '..');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '15mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/focus', focusRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'NexusWeave API Server',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: 'active',
    timestamp: new Date().toISOString()
  });
});

// Block secrets / backend source before any static serving
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/backend') ||
    p.includes('/.env') ||
    p.endsWith('.env') ||
    p.includes('node_modules')
  ) {
    return res.status(404).json({ errors: ['Not found.'] });
  }
  next();
});

// Serve frontend from repo root (preserves original asset + page URLs)
app.use(express.static(rootDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'pages', 'index.html'));
});

// Unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ errors: ['API endpoint not found.'] });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ errors: ['An unexpected server error occurred.'] });
});

// --- WebSocket Setup ---
const wss = new WebSocket.Server({ server, path: '/ws' });
const userSockets = new Map();

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

function getOnlineUserIds() {
  const onlineIds = new Set();
  userSockets.forEach((sockets, userId) => {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        onlineIds.add(userId.toString());
        break;
      }
    }
  });
  return Array.from(onlineIds);
}

async function broadcastToOrg(organizationId, data) {
  if (!organizationId) return;
  const members = await User.find({ organizationId }, '_id');
  members.forEach((member) => sendToUser(member._id.toString(), data));
}

app.set('getOnlineUserIds', getOnlineUserIds);
app.set('sendToUser', sendToUser);
app.set('broadcastToOrg', broadcastToOrg);

wss.on('connection', async (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace(/^[^?]*\?/, ''));
  const token = urlParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication token missing');
    return;
  }

  let userPayload;
  try {
    userPayload = verifyToken(token);
  } catch (err) {
    ws.close(4002, 'Invalid or expired token');
    return;
  }

  const userId = userPayload.sub;
  const userEmail = userPayload.email;

  const existingUser = await User.findById(userId);
  if (!existingUser) {
    ws.close(4003, 'User not found');
    return;
  }

  ws.userId = userId;
  ws.userEmail = userEmail;

  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(ws);

  ws.send(JSON.stringify({ type: 'connected', payload: { userId, email: userEmail } }));

  if (existingUser.organizationId) {
    broadcastToOrg(existingUser.organizationId, {
      type: 'presence_update',
      payload: { userId, email: userEmail, isOnline: true }
    }).catch(() => {});
  }

  ws.on('message', async (rawMessage) => {
    try {
      const data = JSON.parse(rawMessage.toString());
      const { type, payload } = data;

      if (type === 'send_message') {
        const { toUserId, toEmail, text, tempId } = payload || {};
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
        if (tempId) {
          safeMsg.tempId = tempId;
        }

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
        if (existingUser.organizationId) {
          broadcastToOrg(existingUser.organizationId, {
            type: 'presence_update',
            payload: { userId, email: userEmail, isOnline: false }
          }).catch(() => {});
        }
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexusweave';

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    const isAtlas = /mongodb\.net|atlas/i.test(MONGODB_URI);
    console.log(isAtlas ? '✅ Connected to MongoDB Atlas' : '✅ Connected to MongoDB');
    await ensureIndexes();
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
