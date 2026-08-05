/* ============================================================
   NexusWeave — Realtime Direct Messaging Widget (Slack-style)
   Supports: Admin ↔ Employee & Employee ↔ Employee Messaging,
             Unread counts, typing indicators, seen status, and Socket.IO.
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  const currentUser = api.getMe();
  if (!currentUser) return;

  let activeChatUserEmail = null;
  let typingTimeout = null;

  /* ── DOM Injector for Chat Drawer ── */
  function injectChatUI() {
    if (document.getElementById('chatFabTrigger')) return;

    // 1. Floating Action Button
    const fabBtn = document.createElement('button');
    fabBtn.id = 'chatFabTrigger';
    fabBtn.className = 'chat-fab-trigger';
    fabBtn.type = 'button';
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
        <h3 id="chatDrawerTitle">Direct Messages</h3>
        <button id="closeChatDrawerBtn" class="ghost-btn" style="padding:0.2rem 0.5rem;font-size:1.1rem;">×</button>
      </div>

      <div class="chat-drawer-body">
        <!-- Contacts View -->
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
            <input type="text" id="chatMessageInput" placeholder="Write a message…" autocomplete="off" />
            <button type="submit" class="primary-btn" style="padding:0.4rem 0.85rem;font-size:0.85rem;">Send</button>
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
      activeChatUserEmail = null;
      document.getElementById('chatConversationView').classList.add('hidden');
      document.getElementById('chatContactsView').classList.remove('hidden');
      document.getElementById('chatDrawerTitle').textContent = 'Direct Messages';
      renderContactsList();
    });

    // Handle Sending Messages
    const chatForm = document.getElementById('chatInputForm');
    const msgInput = document.getElementById('chatMessageInput');

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = msgInput.value.trim();
      if (!text || !activeChatUserEmail) return;

      const orgUsers = currentUser.organizationId ? api.getAllUsersInOrg(currentUser.organizationId) : [currentUser];
      const targetUser = orgUsers.find(u => u.email === activeChatUserEmail);

      socket.sendMessage({
        fromEmail: currentUser.email,
        fromName: currentUser.name || currentUser.email.split('@')[0],
        toEmail: activeChatUserEmail,
        toName: targetUser ? targetUser.name : activeChatUserEmail,
        text
      });

      msgInput.value = '';
      socket.emitTyping(currentUser.email, activeChatUserEmail, false);
      renderConversation(activeChatUserEmail);
    });

    // Handle Typing Indicator
    msgInput.addEventListener('input', () => {
      if (!activeChatUserEmail) return;
      socket.emitTyping(currentUser.email, activeChatUserEmail, true);
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emitTyping(currentUser.email, activeChatUserEmail, false);
      }, 2000);
    });

    updateGlobalUnreadBadge();
  }

  function renderContactsList() {
    const container = document.getElementById('chatContactsView');
    if (!container) return;

    const orgId = currentUser.organizationId;
    const orgUsers = orgId ? api.getAllUsersInOrg(orgId) : [];
    const contacts = orgUsers.filter(u => u.email !== currentUser.email);

    if (!contacts.length) {
      container.innerHTML = `<div class="empty-inline">No other team members in your organization yet.</div>`;
      return;
    }

    container.innerHTML = contacts.map(user => {
      const unread = socket.getUnreadCountFromSender(currentUser.email, user.email);
      const isUserAdmin = user.role === 'admin';

      return `
        <div class="chat-contact-item" data-email="${user.email}" data-name="${user.name || user.email}" data-role="${user.role || 'employee'}">
          <div style="display:flex;align-items:center;gap:0.7rem;min-width:0;flex:1;">
            <div class="chat-contact-avatar">${(user.name || user.email).charAt(0).toUpperCase()}</div>
            <div class="chat-contact-info">
              <strong>${user.name || user.email}</strong>
              <small>${isUserAdmin ? '🛡️ Admin' : '👤 Employee'}</small>
            </div>
          </div>
          ${unread > 0 ? `<span class="chat-unread-badge">${unread}</span>` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-email]').forEach(item => {
      item.addEventListener('click', () => {
        openConversation(item.dataset.email, item.dataset.name, item.dataset.role);
      });
    });
  }

  function openConversation(email, name, role) {
    activeChatUserEmail = email;
    document.getElementById('chatContactsView').classList.add('hidden');
    document.getElementById('chatConversationView').classList.remove('hidden');
    document.getElementById('chatDrawerTitle').textContent = `Chat with ${name}`;
    document.getElementById('activeChatName').textContent = name;
    document.getElementById('activeChatRole').textContent = role === 'admin' ? '🛡️ Admin' : '👤 Employee';

    socket.markConversationAsSeen(currentUser.email, email);
    renderConversation(email);
    updateGlobalUnreadBadge();
  }

  function renderConversation(targetEmail) {
    const messagesArea = document.getElementById('chatMessagesArea');
    if (!messagesArea) return;

    const messages = socket.getConversation(currentUser.email, targetEmail);

    if (!messages.length) {
      messagesArea.innerHTML = `<div class="empty-inline" style="margin:auto;">Send a message to start the conversation!</div>`;
      return;
    }

    messagesArea.innerHTML = messages.map(msg => {
      const isMine = msg.fromEmail === currentUser.email;
      const seenStatus = isMine ? (msg.seen ? '✓✓ Seen' : '✓ Sent') : '';

      return `
        <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
          <div>${msg.text}</div>
          <div class="chat-bubble-meta">
            <span>${msg.timeStr}</span>
            ${seenStatus ? `<span>• ${seenStatus}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function updateGlobalUnreadBadge() {
    const badge = document.getElementById('chatGlobalUnreadBadge');
    if (!badge) return;
    const totalUnread = socket.getUnreadCountForUser(currentUser.email);
    if (totalUnread > 0) {
      badge.textContent = totalUnread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /* ── Listen for Socket Events ── */
  if (socket) {
    socket.on('message:new', (msg) => {
      if (msg.toEmail === currentUser.email || msg.fromEmail === currentUser.email) {
        if (activeChatUserEmail === msg.fromEmail || activeChatUserEmail === msg.toEmail) {
          socket.markConversationAsSeen(currentUser.email, activeChatUserEmail);
          renderConversation(activeChatUserEmail);
        } else {
          renderContactsList();
        }
        updateGlobalUnreadBadge();
      }
    });

    socket.on('message:typing', (data) => {
      if (data.toEmail === currentUser.email && data.fromEmail === activeChatUserEmail) {
        const typingEl = document.getElementById('chatTypingIndicator');
        if (typingEl) {
          if (data.isTyping) {
            typingEl.textContent = `${data.fromEmail.split('@')[0]} is typing…`;
            typingEl.classList.remove('hidden');
          } else {
            typingEl.classList.add('hidden');
          }
        }
      }
    });

    socket.on('message:seen', (data) => {
      if (data.fromUser === currentUser.email && activeChatUserEmail) {
        renderConversation(activeChatUserEmail);
      }
    });
  }

  // Initialize Chat UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChatUI);
  } else {
    injectChatUI();
  }
})();
