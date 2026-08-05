/* ============================================================
   NexusWeave — Realtime WebSocket & Communication Service
   Supports: Real-time user-to-user messaging via WebSockets (ws),
             JWT token handshake, cross-tab BroadcastChannel sync,
             Automatic reconnection with exponential backoff,
             REST API fallback, typing indicators, and read status.
   ============================================================ */

(function (root) {
  const channel = new BroadcastChannel('nexus_socket_channel');
  const listeners = {};

  let socket = null;
  let isConnected = false;
  let isConnecting = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let currentToken = null;

  function getWsUrl(token) {
    const apiBase = (window.NexusAPI && window.NexusAPI.API_BASE) || 'http://localhost:4000/api';
    let wsHost = apiBase.replace(/^http/, 'ws').replace(/\/api$/, '');
    return `${wsHost}/ws?token=${encodeURIComponent(token)}`;
  }

  function emitLocal(event, payload) {
    if (listeners[event]) {
      listeners[event].forEach(cb => cb(payload));
    }
    if (listeners['*']) {
      listeners['*'].forEach(cb => cb({ type: event, payload }));
    }
  }

  function broadcastCrossTab(event, payload) {
    try {
      channel.postMessage({ type: event, payload });
    } catch (e) {}
  }

  channel.onmessage = (event) => {
    const { type, payload } = event.data || {};
    if (type) {
      emitLocal(type, payload);
    }
  };

  const NexusSocket = {
    connect(token) {
      const jwtToken = token || localStorage.getItem('jwt');
      if (!jwtToken) return;

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        if (currentToken === jwtToken) return;
        socket.close();
      }

      currentToken = jwtToken;
      isConnecting = true;

      try {
        const wsUrl = getWsUrl(jwtToken);
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          isConnected = true;
          isConnecting = false;
          reconnectAttempts = 0;
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          emitLocal('status:change', { status: 'connected' });
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const { type, payload } = data;

            if (type === 'new_message') {
              emitLocal('message:new', payload);
              broadcastCrossTab('message:new', payload);
            } else if (type === 'user_typing') {
              emitLocal('message:typing', payload);
              broadcastCrossTab('message:typing', payload);
            } else if (type === 'messages_read') {
              emitLocal('message:seen', payload);
              broadcastCrossTab('message:seen', payload);
            } else if (type === 'connected') {
              emitLocal('socket:ready', payload);
            }
          } catch (err) {
            console.error('WebSocket parse error:', err);
          }
        };

        socket.onclose = (event) => {
          isConnected = false;
          isConnecting = false;
          emitLocal('status:change', { status: 'disconnected', code: event.code });

          // Auto-reconnect with exponential backoff if closed unexpectedly
          if (event.code !== 4001 && event.code !== 4002) {
            scheduleReconnect();
          }
        };

        socket.onerror = (err) => {
          console.warn('WebSocket error encountered:', err);
          socket.close();
        };
      } catch (err) {
        console.error('Failed to establish WebSocket connection:', err);
        scheduleReconnect();
      }
    },

    disconnect() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.close(1000, 'User logged out');
        socket = null;
      }
      isConnected = false;
      isConnecting = false;
    },

    on(event, callback) {
      if (!listeners[event]) listeners[event] = [];
      if (!listeners[event].includes(callback)) {
        listeners[event].push(callback);
      }
    },

    off(event, callback) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    },

    emitRaw(type, payload) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, payload }));
        return true;
      }
      return false;
    },

    /* ── High level messaging actions ── */
    sendMessage({ toUserId, toEmail, text }) {
      const sentWS = this.emitRaw('send_message', { toUserId, toEmail, text });
      if (!sentWS) {
        console.warn('WebSocket not connected. Attempting reconnection...');
        this.connect();
      }
      return sentWS;
    },

    emitTyping(toUserId, toEmail, isTyping) {
      this.emitRaw('typing', { toUserId, toEmail, isTyping });
    },

    markConversationAsSeen(toUserId, toEmail) {
      this.emitRaw('mark_read', { fromUserId: toUserId, fromEmail: toEmail });
      if (window.NexusAPI && window.NexusAPI.markMessagesAsRead) {
        window.NexusAPI.markMessagesAsRead(toUserId || toEmail);
      }
      emitLocal('message:seen', { byUser: toUserId, fromUser: toEmail });
    },

    getStatus() {
      if (isConnected) return 'connected';
      if (isConnecting) return 'connecting';
      return 'disconnected';
    }
  };

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 15000); // 1s, 2s, 4s, 8s, max 15s
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (localStorage.getItem('jwt')) {
        NexusSocket.connect();
      }
    }, delay);
  }

  // Auto-connect if user JWT exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (localStorage.getItem('jwt')) NexusSocket.connect();
    });
  } else {
    if (localStorage.getItem('jwt')) NexusSocket.connect();
  }

  root.NexusSocket = NexusSocket;
})(window);
