const path = require('path');
const fs = require('fs');

// ─── .env ───────────────────────────────────────────────────────────────────
// Anchored to __dirname (where server.js lives) so it works regardless of cwd.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  // Railway injects env vars directly — .env is only needed locally.
  require('dotenv').config();
}

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

// ─── App Setup ──────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const startedAt = new Date();

// Human-readable reason the database is unavailable, surfaced to the client so it can
// distinguish a database outage from an unreachable server. Null while healthy.
let lastDbError = null;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '15mb' }));

// ─── Request Logger ─────────────────────────────────────────────────────────
// Logs every incoming request with method, path, status code, and response time.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const icon = status >= 500 ? '🔴' : status >= 400 ? '🟡' : '🟢';
    console.log(`${icon} ${req.method} ${req.originalUrl} → ${status} (${duration}ms)`);
  });
  next();
});

// ─── Health Check ───────────────────────────────────────────────────────────
// Reachable even while the database is down, so the client can tell
// "server is down" apart from "database is down".
app.get('/api/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  const uptimeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'online' : 'degraded',
    system: 'NexusWeave API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: dbUp ? 'connected' : 'disconnected',
    databaseError: dbUp ? null : lastDbError,
    websocket: 'active',
    uptime: `${uptimeSeconds}s`,
    timestamp: new Date().toISOString()
  });
});

// ─── Database Guard ─────────────────────────────────────────────────────────
// The HTTP server accepts requests before MongoDB finishes connecting. Without this
// guard those requests would sit in Mongoose's buffer until it times out, which is
// slower than the client's abort timeout and surfaces as "server unreachable".
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next(); // health check is always available
  if (mongoose.connection.readyState === 1) return next();
  console.warn(`⚠️  503 — DB not ready for ${req.method} ${req.originalUrl}`);
  res.status(503).json({
    errors: ['The server is still connecting to the database. Please retry in a few seconds.'],
    databaseError: lastDbError
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/focus', focusRoutes);

// ─── Static File Serving (Local Development Only) ───────────────────────────
// In production, Vercel serves the frontend — Railway only needs the API.
// All paths are anchored relative to __dirname (where server.js lives).
// We use fs.existsSync() to verify the directory actually exists on disk
// before registering any static middleware, so the server never crashes
// with ENOENT even if the frontend files are missing (e.g. on Railway).
const isProduction = !!(process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production');
const frontendRoot = path.resolve(__dirname, '..');       // repo root (one level up from backend/)
const frontendPagesDir = path.join(frontendRoot, 'pages');
const frontendIndexHtml = path.join(frontendPagesDir, 'index.html');

if (!isProduction && fs.existsSync(frontendPagesDir) && fs.existsSync(frontendIndexHtml)) {
  console.log('📂 Frontend directory found — serving static files from:', frontendRoot);

  // Block secrets / backend source before any static serving
  app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (
      p.startsWith('/backend') ||
      p.startsWith('/.git') ||
      p.includes('/.env') ||
      p.endsWith('.env') ||
      p.includes('node_modules')
    ) {
      return res.status(404).json({ errors: ['Not found.'] });
    }
    next();
  });

  // Serve frontend assets from the repo root
  app.use(express.static(frontendRoot));

  // Serve index.html for the root URL
  app.get('/', (_req, res) => {
    res.sendFile(frontendIndexHtml);
  });
} else if (!isProduction) {
  console.log('📂 Frontend directory not found — running in API-only mode.');
  console.log('   Expected pages at:', frontendPagesDir);
}

// ─── Unknown API Routes → 404 ──────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  console.warn(`🟡 404 — Unknown API endpoint: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    errors: ['API endpoint not found.'],
    method: req.method,
    path: req.originalUrl,
    hint: 'Check the API documentation or verify the URL is correct.'
  });
});

// ─── Catch-All for Non-API Routes (Production) ─────────────────────────────
// In production, if someone hits the Railway URL directly (not the API), return
// a helpful message instead of a confusing blank page or error.
if (isProduction) {
  app.use((_req, res) => {
    res.status(200).json({
      message: 'NexusWeave API Server is running.',
      api: '/api/health',
      frontend: 'https://nexusweave.vercel.app'
    });
  });
}

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected server error occurred.';

  // Log full error details for debugging
  console.error('──────────────────────────────────────');
  console.error(`🔴 Unhandled Error on ${req.method} ${req.originalUrl}`);
  console.error(`   Status: ${status}`);
  console.error(`   Message: ${message}`);
  if (err.stack) {
    console.error(`   Stack: ${err.stack.split('\n').slice(0, 5).join('\n          ')}`);
  }
  console.error('──────────────────────────────────────');

  res.status(status).json({
    errors: [status >= 500 ? 'An unexpected server error occurred.' : message]
  });
});

// ─── WebSocket Setup ────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws' });
const userSockets = new Map();

// ws re-emits the HTTP server's errors; without a listener a port conflict becomes an
// unhandled 'error' event and crashes with a raw stack trace.
wss.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error('WebSocket server error:', err.message);
  }
});

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

  if (mongoose.connection.readyState !== 1) {
    ws.close(4004, 'Database unavailable');
    return;
  }

  let existingUser;
  try {
    existingUser = await User.findById(userId);
  } catch (err) {
    console.error('WebSocket user lookup failed:', err.message);
    ws.close(4004, 'Database unavailable');
    return;
  }
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

// ─── Server Startup ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexusweave';

// mongodb+srv:// needs SRV/TXT lookups, which Node resolves with c-ares rather than the
// OS resolver. When c-ares is misconfigured (a stale 127.0.0.1 entry, some VPNs) those
// lookups fail with ECONNREFUSED even though ordinary DNS works fine. MONGODB_URI_FALLBACK
// holds the non-SRV form of the same cluster so a broken resolver cannot take the app down.
const MONGODB_URI_FALLBACK = process.env.MONGODB_URI_FALLBACK || '';
const CONNECTION_CANDIDATES = [MONGODB_URI, MONGODB_URI_FALLBACK].filter(Boolean);
const isAtlas = /mongodb\.net|atlas/i.test(MONGODB_URI);

// --- HTTP server starts first, independent of the database ---
// Binding the port up front means a restart never leaves the frontend staring at a
// closed port while the Atlas handshake (which can take 15s+) completes.
server.listen(PORT, () => {
  console.log('──────────────────────────────────────');
  console.log(`🚀 NexusWeave Backend Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server initialized on ws://localhost:${PORT}/ws`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Server root: ${__dirname}`);
  console.log('──────────────────────────────────────');
  console.log('⏳ Connecting to the database...');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use — another NexusWeave server is running.`);
    console.error('   Either stop that one, or start this one on a different port:');
    console.error(`   Windows PowerShell:  $env:PORT=4001; npm run dev`);
    console.error(`   To find and stop the existing server:`);
    console.error(`   Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select-Object OwningProcess`);
    console.error(`   Stop-Process -Id <that id>\n`);
  } else {
    console.error('❌ HTTP server error:', err.message);
  }
  process.exit(1);
});

// ─── Database Connection with Retry ─────────────────────────────────────────
let dbAttempt = 0;

function explainDbError(err) {
  const msg = err.message || String(err);
  if (/whitelist|not allowed to connect|IP address/i.test(msg)) {
    return 'Your current IP address is not allowed in MongoDB Atlas (Network Access). This is the usual cause after changing wifi networks.';
  }
  if (/authentication failed|bad auth/i.test(msg)) {
    return 'MongoDB rejected the username/password in MONGODB_URI.';
  }
  if (/querySrv|queryTxt/i.test(msg)) {
    return 'Could not perform the DNS SRV lookup that mongodb+srv:// requires. Set MONGODB_URI_FALLBACK to the non-SRV connection string.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return 'The database hostname could not be resolved. Check your internet connection and the MONGODB_URI hostname.';
  }
  if (/timed out|ETIMEDOUT|ServerSelection/i.test(msg)) {
    return 'Timed out reaching MongoDB. Check your internet connection and the Atlas IP allowlist.';
  }
  return msg;
}

const MONGO_OPTIONS = {
  // Kept below the client's 8s abort so a dead database returns a real error
  // instead of stalling long enough to look like an unreachable server.
  serverSelectionTimeoutMS: 5000,
  bufferTimeoutMS: 5000,
  socketTimeoutMS: 45000
};

async function connectToDatabase() {
  dbAttempt += 1;
  let lastErr = null;

  for (let i = 0; i < CONNECTION_CANDIDATES.length; i++) {
    const uri = CONNECTION_CANDIDATES[i];
    try {
      await mongoose.connect(uri, MONGO_OPTIONS);
      lastDbError = null;
      dbAttempt = 0;
      hasEverConnected = true;
      console.log(isAtlas ? '✅ Connected to MongoDB Atlas' : '✅ Connected to MongoDB');
      if (i > 0) {
        console.warn('⚠️  Connected using MONGODB_URI_FALLBACK — the mongodb+srv:// URI could not be resolved.');
      }
      try {
        await ensureIndexes();
      } catch (err) {
        console.error('⚠️  Index sync failed:', err.message);
      }
      return;
    } catch (err) {
      lastErr = err;
      if (i < CONNECTION_CANDIDATES.length - 1) {
        console.warn(`⚠️  Primary connection string failed (${explainDbError(err)}). Trying fallback...`);
      }
    }
  }

  lastDbError = explainDbError(lastErr);
  const retryDelay = Math.min(30000, 2000 * Math.pow(2, Math.min(dbAttempt - 1, 4)));
  console.error(`❌ MongoDB connection failed (attempt ${dbAttempt}): ${lastDbError}`);
  console.warn(`   API requests will return 503 until this succeeds. Retrying in ${retryDelay / 1000}s...`);
  setTimeout(connectToDatabase, retryDelay);
}

// Mongoose also emits 'disconnected' while an initial connection attempt is failing, so
// only treat it as a dropped connection once we have actually been connected.
let hasEverConnected = false;

mongoose.connection.on('disconnected', () => {
  if (hasEverConnected && lastDbError === null) {
    lastDbError = 'Lost connection to the database. Reconnecting...';
    console.warn('⚠️  Database connection lost. The driver is reconnecting automatically.');
  }
});

mongoose.connection.on('reconnected', () => {
  lastDbError = null;
  console.log('✅ Database reconnected.');
});

connectToDatabase();
