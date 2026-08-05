/* ============================================================
   NexusWeave — Notification System (Bell Dropdown + Toast Popups)
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  const currentUser = api.getMe();
  if (!currentUser) return;

  const isAdmin = currentUser.role === 'admin';
  const NOTIFS_KEY = `nw_notifs_${currentUser.email}`;

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

    // Show animated toast popup
    showToast(icon, text);

    // Update bell badge & dropdown
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

    // Bind Dropdown Toggle
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
    // 1. Task Completed (Admin receives)
    socket.on('task:completed', (data) => {
      if (isAdmin && data.orgId === currentUser.organizationId) {
        addNotification({ icon: '✅', text: `Task Completed: "${data.title}" by ${data.userName}`, type: 'success' });
      }
    });

    // 2. Employee Joined (Admin receives)
    socket.on('employee:joined', (data) => {
      if (isAdmin && data.orgId === currentUser.organizationId) {
        addNotification({ icon: '🎉', text: `${data.userName} (${data.userEmail}) joined your organization!`, type: 'info' });
      }
    });

    // 3. Attendance Marked (Admin receives)
    socket.on('attendance:marked', (data) => {
      if (isAdmin && data.orgId === currentUser.organizationId) {
        addNotification({ icon: '⏱️', text: `${data.userName} clocked ${data.status === 'in' ? 'IN at ' + data.time : 'OUT'}`, type: 'info' });
      }
    });

    // 4. New Task Assigned (Employee receives)
    socket.on('task:assigned', (data) => {
      if (data.assigneeEmail === currentUser.email) {
        addNotification({ icon: '📋', text: `New Task Assigned: "${data.title}" by ${data.assignedByName}`, type: 'warning' });
      }
    });

    // 5. Deadline Reminder (Employee receives)
    socket.on('deadline:reminder', (data) => {
      if (data.userEmail === currentUser.email) {
        addNotification({ icon: '⏰', text: `Upcoming Deadline: "${data.title}" is due ${data.dueText}`, type: 'warning' });
      }
    });

    // 6. New Message Notification
    socket.on('message:new', (msg) => {
      if (msg.toEmail === currentUser.email) {
        addNotification({ icon: '💬', text: `New Message from ${msg.fromName}: "${msg.text}"`, type: 'info' });
      }
    });
  }

  // Initialize Bell when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBellUI);
  } else {
    injectBellUI();
  }
})();
