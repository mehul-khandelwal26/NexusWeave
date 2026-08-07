/* ============================================================
   NexusWeave — Realtime Direct Messaging Widget
   Supports: User-to-User REST & WebSocket Direct Messaging,
             XSS Sanitization, Double Message Prevention, Read Receipts,
             Typing Indicators, Dynamic DOM Append, and Realtime Unread Count Sync.
   ============================================================ */

(function () {
  if (window.__nw_chat_widget_initialized) return;
  window.__nw_chat_widget_initialized = true;

  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  let currentUser = api ? api.getMe() : null;
  let activeChatUser = null; // { id, name, email, role }
  let typingTimeout = null;
  let isSubmitting = false;

  // Security: XSS Sanitizer Helper
  function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ── DOM Injector for Chat Drawer ── */
  function injectChatUI() {
    currentUser = api.getMe();
    if (!currentUser || currentUser.role === 'personal') return;
    if (document.getElementById('chatFabTrigger')) return;

    // 1. Floating Action Button
    const fabBtn = document.createElement('button');
    fabBtn.id = 'chatFabTrigger';
    fabBtn.className = 'chat-fab-trigger';
    fabBtn.type = 'button';
    fabBtn.title = 'Direct Messages';
    fabBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      <span id="chatGlobalUnreadBadge" class="chat-unread-badge hidden">0</span>
    `;
    document.body.appendChild(fabBtn);

    // 2. Chat Drawer Window
    const drawer = document.createElement('div');
    drawer.id = 'chatDrawerWindow';
    drawer.className = 'chat-drawer';
    drawer.innerHTML = `
      <div class="chat-drawer-head">
        <div>
          <h3 id="chatDrawerTitle" style="margin:0;font-size:1.05rem;">Direct Messages</h3>
          <span id="chatConnectionStatus" class="chat-status-indicator online">Connected</span>
        </div>
        <button id="closeChatDrawerBtn" class="ghost-btn" style="padding:0.2rem 0.5rem;font-size:1.1rem;" title="Close">×</button>
      </div>

      <div class="chat-drawer-body">
        <!-- Contacts List View -->
        <div id="chatContactsView" class="chat-contacts-list">
          <div class="empty-inline">Loading team members…</div>
        </div>

        <!-- Single Conversation View (Hidden initially) -->
        <div id="chatConversationView" class="chat-window hidden">
          <div class="chat-window-head">
            <button id="chatBackBtn" class="chat-back-btn" type="button">← Back</button>
            <div style="flex:1;min-width:0;">
              <strong id="activeChatName" style="font-size:0.88rem;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">User</strong>
              <small id="activeChatRole" class="text-soft" style="font-size:0.75rem;"></small>
            </div>
          </div>

          <div id="chatMessagesArea" class="chat-messages-area"></div>
          <div id="chatTypingIndicator" class="typing-indicator hidden">Typing…</div>

          <form id="chatInputForm" class="chat-input-row">
            <input type="text" id="chatMessageInput" placeholder="Write a message…" autocomplete="off" maxLength="1000" />
            <button type="submit" id="chatSendBtn" class="primary-btn" style="padding:0.4rem 0.85rem;font-size:0.85rem;">Send</button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);

    // Event Bindings
    fabBtn.addEventListener('click', () => {
      drawer.classList.toggle('is-open');
      if (drawer.classList.contains('is-open')) {
        renderContactsList();
      }
    });

    document.getElementById('closeChatDrawerBtn').addEventListener('click', () => {
      drawer.classList.remove('is-open');
    });

    document.getElementById('chatBackBtn').addEventListener('click', () => {
      activeChatUser = null;
      document.getElementById('chatConversationView').classList.add('hidden');
      document.getElementById('chatContactsView').classList.remove('hidden');
      document.getElementById('chatDrawerTitle').textContent = 'Direct Messages';
      renderContactsList();
    });

    // Handle Message Submissions (Prevents form double-firing)
    const chatForm = document.getElementById('chatInputForm');
    const msgInput = document.getElementById('chatMessageInput');

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isSubmitting) return;

      const text = msgInput.value.trim();
      if (!text || !activeChatUser) return;

      isSubmitting = true;

      const targetId = activeChatUser.id || activeChatUser._id || activeChatUser.email;
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Clear input and typing status
      msgInput.value = '';
      socket.emitTyping(targetId, activeChatUser.email, false);

      // 1. Emit via WebSocket
      socket.sendMessage({
        toUserId: targetId,
        toEmail: activeChatUser.email,
        text,
        tempId
      });

      // 2. Optimistically append outgoing message ONCE to sender's active chat window
      const currentEmail = currentUser.email || '';
      const now = new Date().toISOString();
      appendSingleMessage({
        id: tempId,
        tempId: tempId,
        sender_id: currentUser.id || currentUser._id || currentEmail,
        receiver_id: targetId,
        fromEmail: currentEmail,
        toEmail: activeChatUser.email,
        content: text,
        timestamp: now,
        is_read: false
      });

      setTimeout(() => {
        isSubmitting = false;
      }, 200);
    });

    // Handle Typing Indicator Output
    msgInput.addEventListener('input', () => {
      if (!activeChatUser) return;
      const targetId = activeChatUser.id || activeChatUser._id || activeChatUser.email;
      socket.emitTyping(targetId, activeChatUser.email, true);
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emitTyping(targetId, activeChatUser.email, false);
      }, 2000);
    });

    updateGlobalUnreadBadge();
    updateConnectionStatusUI(socket ? socket.getStatus() : 'disconnected');
  }

  async function renderContactsList() {
    const container = document.getElementById('chatContactsView');
    if (!container) return;

    currentUser = api.getMe();
    if (!currentUser) return;

    let contacts = [];

    // Fetch team members from backend REST API or local user state
    if (api && api.fetchBackendOrgUsers) {
      const backendUsers = await api.fetchBackendOrgUsers();
      if (backendUsers && backendUsers.length) {
        contacts = backendUsers;
      }
    }

    if (!contacts.length && currentUser.organizationId) {
      contacts = await api.getAllUsersInOrg(currentUser.organizationId);
    }

    // Exclude current user
    contacts = contacts.filter(u => u.email !== currentUser.email);

    if (!contacts.length) {
      container.innerHTML = `<div class="empty-inline">No other team members in your organization yet.</div>`;
      return;
    }

    // Fetch unread counts from DB
    let unreadData = { total: 0, bySender: {} };
    if (api && api.fetchUnreadCounts) {
      unreadData = await api.fetchUnreadCounts();
    }

    container.innerHTML = contacts.map(user => {
      const uEmail = user.email || '';
      const uId = user.id || user._id || uEmail;
      const unread = unreadData.bySender[uId] || unreadData.bySender[uEmail] || 0;
      const isUserAdmin = user.role === 'admin';
      const displayName = user.name || uEmail.split('@')[0];

      return `
        <div class="chat-contact-item" data-id="${escapeHTML(uId)}" data-email="${escapeHTML(uEmail)}" data-name="${escapeHTML(displayName)}" data-role="${escapeHTML(user.role || 'employee')}">
          <div style="display:flex;align-items:center;gap:0.7rem;min-width:0;flex:1;">
            <div class="chat-contact-avatar">${escapeHTML(displayName.charAt(0).toUpperCase())}</div>
            <div class="chat-contact-info">
              <strong>${escapeHTML(displayName)}</strong>
              <small>${isUserAdmin ? '🛡️ Admin' : '👤 Employee'}</small>
            </div>
          </div>
          ${unread > 0 ? `<span class="chat-unread-badge">${unread}</span>` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-email]').forEach(item => {
      item.addEventListener('click', () => {
        openConversation({
          id: item.dataset.id,
          email: item.dataset.email,
          name: item.dataset.name,
          role: item.dataset.role
        });
      });
    });
  }

  async function openConversation(userObj) {
    activeChatUser = userObj;
    document.getElementById('chatContactsView').classList.add('hidden');
    document.getElementById('chatConversationView').classList.remove('hidden');
    document.getElementById('chatDrawerTitle').textContent = `Chat with ${userObj.name}`;
    document.getElementById('activeChatName').textContent = userObj.name;
    document.getElementById('activeChatRole').textContent = userObj.role === 'admin' ? '🛡️ Admin' : '👤 Employee';

    const targetId = userObj.id || userObj.email;
    socket.markConversationAsSeen(targetId, userObj.email);

    // Clear unread badge for this specific contact in contact list view
    const container = document.getElementById('chatContactsView');
    if (container) {
      const contactItem = (userObj.id ? container.querySelector(`[data-id="${userObj.id}"]`) : null) ||
                          (userObj.email ? container.querySelector(`[data-email="${userObj.email}"]`) : null);
      if (contactItem) {
        const badge = contactItem.querySelector('.chat-unread-badge');
        if (badge) badge.remove();
      }
    }

    await loadConversation(targetId);
    updateGlobalUnreadBadge();
  }

  async function loadConversation(targetId) {
    const messagesArea = document.getElementById('chatMessagesArea');
    if (!messagesArea) return;

    messagesArea.innerHTML = `<div class="empty-inline" style="margin:auto;">Loading history…</div>`;

    if (api && api.fetchConversationMessages) {
      const res = await api.fetchConversationMessages(targetId);
      if (res && res.messages) {
        renderAllMessages(res.messages);
        return;
      }
    }

    // Fallback: empty chat state
    messagesArea.innerHTML = `<div class="empty-inline" style="margin:auto;">Send a message to start the conversation!</div>`;
  }

  function renderAllMessages(messages) {
    const messagesArea = document.getElementById('chatMessagesArea');
    if (!messagesArea) return;

    if (!messages.length) {
      messagesArea.innerHTML = `<div class="empty-inline" style="margin:auto;">Send a message to start the conversation!</div>`;
      return;
    }

    const currentEmail = currentUser.email || '';
    const currentId = currentUser.id || currentUser._id || '';

    messagesArea.innerHTML = messages.map(msg => {
      const isMine = msg.fromEmail === currentEmail || msg.sender_id === currentId || msg.sender === currentId;
      const timeStr = formatTime(msg.timestamp);
      const seenStatus = isMine ? (msg.is_read || msg.isRead ? '✓✓ Read' : '✓ Sent') : '';

      return `
        <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}" data-msg-id="${escapeHTML(msg.id || msg._id || '')}">
          <div class="chat-bubble-content">${escapeHTML(msg.content)}</div>
          <div class="chat-bubble-meta">
            <span>${escapeHTML(timeStr)}</span>
            ${seenStatus ? `<span>• ${escapeHTML(seenStatus)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function appendSingleMessage(msg) {
    const messagesArea = document.getElementById('chatMessagesArea');
    if (!messagesArea) return;

    const currentEmail = currentUser.email || '';
    const currentId = currentUser.id || currentUser._id || '';
    const isMine = msg.fromEmail === currentEmail || msg.sender_id === currentId || msg.sender === currentId;

    // Deduplication check: Check if message with real ID or tempId already exists
    if (msg.tempId) {
      const existingTempEl = messagesArea.querySelector(`[data-temp-id="${msg.tempId}"]`);
      if (existingTempEl) return;
    }

    if (msg.id || msg._id) {
      const realId = msg.id || msg._id;
      const existingRealEl = messagesArea.querySelector(`[data-msg-id="${realId}"]`);
      if (existingRealEl) return;
    }

    // Clear empty state text if present
    const emptyInline = messagesArea.querySelector('.empty-inline');
    if (emptyInline) emptyInline.remove();

    const bubbleEl = document.createElement('div');
    bubbleEl.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;
    if (msg.tempId) bubbleEl.dataset.tempId = msg.tempId;
    if (msg.id || msg._id) bubbleEl.dataset.msgId = msg.id || msg._id;

    const timeStr = formatTime(msg.timestamp);
    const seenStatus = isMine ? (msg.is_read || msg.isRead ? '✓✓ Read' : '✓ Sent') : '';

    bubbleEl.innerHTML = `
      <div class="chat-bubble-content">${escapeHTML(msg.content)}</div>
      <div class="chat-bubble-meta">
        <span>${escapeHTML(timeStr)}</span>
        ${seenStatus ? `<span>• ${escapeHTML(seenStatus)}</span>` : ''}
      </div>
    `;

    messagesArea.appendChild(bubbleEl);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function incrementContactUnreadBadge(senderId, senderEmail) {
    const container = document.getElementById('chatContactsView');
    if (!container) return;

    const contactItem = (senderId ? container.querySelector(`[data-id="${senderId}"]`) : null) ||
                        (senderEmail ? container.querySelector(`[data-email="${senderEmail}"]`) : null);

    if (contactItem) {
      let badge = contactItem.querySelector('.chat-unread-badge');
      if (badge) {
        const currentCount = parseInt(badge.textContent || '0', 10) || 0;
        badge.textContent = currentCount + 1;
        badge.classList.remove('hidden');
      } else {
        badge = document.createElement('span');
        badge.className = 'chat-unread-badge';
        badge.textContent = '1';
        contactItem.appendChild(badge);
      }
    }
  }

  function updateReadReceiptsInActiveChat() {
    const messagesArea = document.getElementById('chatMessagesArea');
    if (!messagesArea) return;

    messagesArea.querySelectorAll('.chat-bubble.mine .chat-bubble-meta').forEach(metaEl => {
      const text = metaEl.innerHTML;
      if (text.includes('✓ Sent')) {
        metaEl.innerHTML = text.replace('✓ Sent', '✓✓ Read');
      }
    });
  }

  async function updateGlobalUnreadBadge() {
    const badge = document.getElementById('chatGlobalUnreadBadge');
    if (!badge) return;

    let totalUnread = 0;
    if (api && api.fetchUnreadCounts) {
      const data = await api.fetchUnreadCounts();
      totalUnread = data.total || 0;
    }

    if (totalUnread > 0) {
      badge.textContent = totalUnread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function updateConnectionStatusUI(status) {
    const statusEl = document.getElementById('chatConnectionStatus');
    if (!statusEl) return;

    statusEl.className = 'chat-status-indicator ' + status;
    if (status === 'connected') {
      statusEl.textContent = 'Online';
    } else if (status === 'connecting') {
      statusEl.textContent = 'Reconnecting…';
    } else {
      statusEl.textContent = 'Offline';
    }
  }

  /* ── Register Real-time WebSocket Listeners ── */
  if (socket) {
    socket.on('status:change', (data) => {
      updateConnectionStatusUI(data.status);
    });

    // Handle incoming new_message event
    socket.on('message:new', (msg) => {
      currentUser = api.getMe();
      if (!currentUser) return;

      const currentEmail = currentUser.email || '';
      const currentId = currentUser.id || currentUser._id || '';

      const isSender = msg.fromEmail === currentEmail || msg.sender_id === currentId || msg.sender === currentId;
      const isReceiver = msg.toEmail === currentEmail || msg.receiver_id === currentId || msg.receiver === currentId;

      // 1. FILTER OUT SENDER ECHO: Sender UI appends message locally on submit.
      // Ignore incoming WebSocket message:new event for sender to completely prevent double message rendering!
      if (isSender) {
        return;
      }

      // 2. PROCESS RECEIVER MESSAGE:
      if (isReceiver) {
        const senderEmail = msg.fromEmail;
        const senderId = msg.sender_id || msg.sender || senderEmail;

        if (activeChatUser) {
          const activeId = activeChatUser.id || activeChatUser._id || activeChatUser.email;
          const isActiveChatSender = msg.fromEmail === activeChatUser.email || senderId === activeId;

          if (isActiveChatSender) {
            // Active chat window is open with sender: mark read & append message
            socket.markConversationAsSeen(activeId, activeChatUser.email);
            appendSingleMessage(msg);
          } else {
            // Message is from another contact: increment badge
            incrementContactUnreadBadge(senderId, senderEmail);
          }
        } else {
          // Active chat window is closed / showing contacts list: increment badge
          incrementContactUnreadBadge(senderId, senderEmail);
        }
      }

      updateGlobalUnreadBadge();
    });

    socket.on('message:typing', (data) => {
      if (!activeChatUser) return;
      const activeEmail = activeChatUser.email;
      const activeId = activeChatUser.id || activeChatUser._id;

      if (data.fromEmail === activeEmail || data.fromUserId === activeId) {
        const typingEl = document.getElementById('chatTypingIndicator');
        if (typingEl) {
          if (data.isTyping) {
            typingEl.textContent = `${activeChatUser.name || 'User'} is typing…`;
            typingEl.classList.remove('hidden');
          } else {
            typingEl.classList.add('hidden');
          }
        }
      }
    });

    socket.on('message:seen', (data) => {
      if (activeChatUser) {
        updateReadReceiptsInActiveChat();
      }
      renderContactsList();
      updateGlobalUnreadBadge();
    });
  }

  // Initialize Chat UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChatUI);
  } else {
    injectChatUI();
  }
})();
