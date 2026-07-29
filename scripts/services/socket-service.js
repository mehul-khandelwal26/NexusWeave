/* ============================================================
   NexusWeave — Socket.IO Real-time Communication Service
   Supports: Realtime event broadcasting across tabs/users,
             Task assignments, completions, attendance, messaging,
             Typing indicators, seen status, and notifications.
   ============================================================ */

(function (root) {
  const channel = new BroadcastChannel('nexus_socket_channel');
  const listeners = {};

  // Internal storage key for chat messages
  const MESSAGES_KEY = 'nw_chat_messages';

  function getStoredMessages() {
    return JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]');
  }

  function saveStoredMessages(msgs) {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs));
  }

  // Receive cross-tab broadcast messages
  channel.onmessage = (event) => {
    const { type, payload } = event.data;
    if (listeners[type]) {
      listeners[type].forEach(cb => cb(payload));
    }
    if (listeners['*']) {
      listeners['*'].forEach(cb => cb({ type, payload }));
    }
  };

  // Sync via storage event as fallback
  window.addEventListener('storage', (e) => {
    if (e.key === 'nw_socket_event' && e.newValue) {
      try {
        const { type, payload } = JSON.parse(e.newValue);
        if (listeners[type]) {
          listeners[type].forEach(cb => cb(payload));
        }
      } catch (err) {}
    }
  });

  const NexusSocket = {
    // Socket.IO compatible interface
    on(event, callback) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },

    off(event, callback) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    },

    emit(event, payload) {
      // 1. Trigger local listeners
      if (listeners[event]) {
        listeners[event].forEach(cb => cb(payload));
      }

      // 2. Broadcast to other tabs via BroadcastChannel
      channel.postMessage({ type: event, payload });

      // 3. Fallback via localStorage storage event
      localStorage.setItem('nw_socket_event', JSON.stringify({ type: event, payload, timestamp: Date.now() }));
    },

    /* ── Messaging API ── */
    sendMessage({ fromEmail, fromName, toEmail, toName, text }) {
      const messages = getStoredMessages();
      const newMsg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        fromEmail,
        fromName,
        toEmail,
        toName,
        text,
        seen: false,
        timestamp: new Date().toISOString(),
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      messages.push(newMsg);
      saveStoredMessages(messages);

      // Emit real-time socket event
      this.emit('message:new', newMsg);
      return newMsg;
    },

    getConversation(user1Email, user2Email) {
      const messages = getStoredMessages();
      return messages.filter(m =>
        (m.fromEmail === user1Email && m.toEmail === user2Email) ||
        (m.fromEmail === user2Email && m.toEmail === user1Email)
      ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },

    markConversationAsSeen(user1Email, user2Email) {
      const messages = getStoredMessages();
      let updated = false;
      messages.forEach(m => {
        if (m.fromEmail === user2Email && m.toEmail === user1Email && !m.seen) {
          m.seen = true;
          updated = true;
        }
      });
      if (updated) {
        saveStoredMessages(messages);
        this.emit('message:seen', { byUser: user1Email, fromUser: user2Email });
      }
    },

    getUnreadCountForUser(userEmail) {
      const messages = getStoredMessages();
      return messages.filter(m => m.toEmail === userEmail && !m.seen).length;
    },

    getUnreadCountFromSender(userEmail, senderEmail) {
      const messages = getStoredMessages();
      return messages.filter(m => m.toEmail === userEmail && m.fromEmail === senderEmail && !m.seen).length;
    },

    emitTyping(fromEmail, toEmail, isTyping) {
      this.emit('message:typing', { fromEmail, toEmail, isTyping });
    }
  };

  root.NexusSocket = NexusSocket;
})(window);
