/* ============================================================
   NexusWeave — Notification System (Bell Dropdown + Toast Popups)
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  const currentUser = api.getMe();
  if (!currentUser) return;

  const isAdmin = currentUser.role === 'admin';
  const myEmail = (currentUser.email || '').toLowerCase();
  const NOTIFS_KEY = `nw_notifs_${currentUser.email}`;

  function isOwnTask(task) {
    if (!task) return false;
    const assigned = (task.assignedUserEmail || '').toLowerCase();
    const owner = (task.userEmail || '').toLowerCase();
    if (assigned) return assigned === myEmail;
    if (owner) return owner === myEmail;
    return false;
  }

  /* ── Local Notification Store ── */
  function getNotifications() {
    return JSON.parse(localStorage.getItem(NOTIFS_KEY) || '[]');
  }

  function saveNotifications(notifs) {
    localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs));
  }

  function addNotification({ icon, text, type }) {
    const notifs = getNotifications();
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      icon: icon || '🔔',
      text,
      type: type || 'info',
      read: false,
      timestamp: new Date().toISOString(),
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    notifs.unshift(newNotif);
    saveNotifications(notifs.slice(0, 30));
    showToast(icon, text);
    updateBellUI();
  }

  /* ── Toast Popup UI ── */
  let toastContainer = document.getElementById('globalToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'globalToastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  function showToast(icon, text) {
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.innerHTML = `
      <span class="toast-icon">${icon || '🔔'}</span>
      <div class="toast-body">${text}</div>
      <button class="toast-close" type="button">×</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  /* ── Header Notification Bell Injector ── */
  function injectBellUI() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('notifBellWrapper')) return;

    const bellWrapper = document.createElement('div');
    bellWrapper.id = 'notifBellWrapper';
    bellWrapper.className = 'notif-wrapper';
    bellWrapper.innerHTML = `
      <button id="notifBellBtn" class="notif-bell-btn" type="button" aria-label="Notifications">
        🔔
        <span id="notifUnreadBadge" class="notif-badge hidden">0</span>
      </button>

      <div id="notifDropdown" class="notif-dropdown" role="menu">
        <div class="notif-dropdown-head">
          <h4>Notifications</h4>
          <button id="markAllReadBtn" class="ghost-btn" style="font-size:0.75rem;padding:0.2rem 0.6rem;">Mark all as read</button>
        </div>
        <div id="notifDropdownList" class="notif-dropdown-list">
          <div class="empty-inline">No notifications</div>
        </div>
      </div>
    `;

    headerActions.insertBefore(bellWrapper, headerActions.firstChild);

    const bellBtn = document.getElementById('notifBellBtn');
    const dropdown = document.getElementById('notifDropdown');
    const markAllReadBtn = document.getElementById('markAllReadBtn');

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('is-open');
      if (dropdown.classList.contains('is-open')) {
        markNotificationsRead();
      }
    });

    document.addEventListener('click', (e) => {
      if (!bellWrapper.contains(e.target)) {
        dropdown.classList.remove('is-open');
      }
    });

    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', () => {
        markNotificationsRead();
      });
    }

    updateBellUI();
  }

  function markNotificationsRead() {
    const notifs = getNotifications();
    notifs.forEach(n => n.read = true);
    saveNotifications(notifs);
    updateBellUI();
  }

  function updateBellUI() {
    const unreadBadge = document.getElementById('notifUnreadBadge');
    const listContainer = document.getElementById('notifDropdownList');

    const notifs = getNotifications();
    const unreadCount = notifs.filter(n => !n.read).length;

    if (unreadBadge) {
      if (unreadCount > 0) {
        unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        unreadBadge.classList.remove('hidden');
      } else {
        unreadBadge.classList.add('hidden');
      }
    }

    if (listContainer) {
      if (!notifs.length) {
        listContainer.innerHTML = `<div class="empty-inline">No notifications yet.</div>`;
        return;
      }

      listContainer.innerHTML = notifs.map(n => `
        <div class="notif-dropdown-item ${!n.read ? 'is-unread' : ''}">
          <span class="notif-item-icon">${n.icon}</span>
          <div class="notif-item-content">
            <div>${n.text}</div>
            <small class="notif-item-time">${n.timeStr || 'Recent'}</small>
          </div>
        </div>
      `).join('');
    }
  }

  /* ── Realtime Socket Event Listeners ── */
  if (socket) {
    socket.on('task:completed', (data) => {
      if (isAdmin && data.orgId === currentUser.organizationId) {
        addNotification({ icon: '✅', text: `Task Completed: "${data.title}" by ${data.userName}`, type: 'success' });
      }
    });

    socket.on('employee:joined', (data) => {
      if (isAdmin && data.orgId === currentUser.organizationId) {
        addNotification({ icon: '🎉', text: `${data.userName} (${data.userEmail}) joined your organization!`, type: 'info' });
      }
    });

    socket.on('attendance:marked', (data) => {
      if (isAdmin && data.orgId === currentUser.organizationId && data.userEmail !== currentUser.email) {
        addNotification({ icon: '✅', text: `${data.userName} marked attendance for today`, type: 'info' });
      }
    });

    socket.on('task:assigned', (data) => {
      if (data.assigneeEmail === currentUser.email) {
        addNotification({ icon: '📋', text: `New Task Assigned: "${data.title}" by ${data.assignedByName}`, type: 'warning' });
      }
    });

    socket.on('deadline:reminder', (data) => {
      // Only own deadlines
      if ((data.userEmail || '').toLowerCase() === myEmail) {
        addNotification({ icon: '⏰', text: `Upcoming Deadline: "${data.title}" is due ${data.dueText}`, type: 'warning' });
      }
    });

    socket.on('message:new', (msg) => {
      if (msg.toEmail === currentUser.email) {
        const from = msg.fromName || msg.fromEmail || 'someone';
        addNotification({ icon: '💬', text: `New Message from ${from}: "${msg.content || msg.text || ''}"`, type: 'info' });
      }
    });
  }

  function seedDeadlineNotifications() {
    try {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      const user = users[currentUser.email];
      const tasks = ((user && user.tasks) || []).filter(isOwnTask);

      // Drop previously seeded deadline alerts (may include other people's tasks for admins)
      const existing = getNotifications().filter((n) => !String(n.text || '').startsWith('Upcoming Deadline:'));
      saveNotifications(existing);

      const existingTexts = new Set(existing.map((n) => n.text));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      tasks.forEach((t) => {
        if (!t || t.status === 'Done' || !t.dueDate) return;
        const due = new Date(t.dueDate);
        if (isNaN(due.getTime())) return;
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.round((due - today) / 86400000);
        let text = null;
        if (diffDays < 0) {
          text = `Upcoming Deadline: "${t.title}" is overdue by ${Math.abs(diffDays)}d`;
        } else if (diffDays === 0) {
          text = `Upcoming Deadline: "${t.title}" is due today`;
        } else if (diffDays <= 2) {
          text = `Upcoming Deadline: "${t.title}" is due in ${diffDays} day(s)`;
        }
        if (text && !existingTexts.has(text)) {
          const notifs = getNotifications();
          notifs.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            icon: '⏰',
            text,
            type: 'warning',
            read: false,
            timestamp: new Date().toISOString(),
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          saveNotifications(notifs.slice(0, 30));
          existingTexts.add(text);
        }
      });
      updateBellUI();
    } catch (_) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectBellUI();
      seedDeadlineNotifications();
    });
  } else {
    injectBellUI();
    seedDeadlineNotifications();
  }

  window.NexusNotify = {
    add: addNotification,
    refresh: updateBellUI,
    getAll: getNotifications
  };
})();
