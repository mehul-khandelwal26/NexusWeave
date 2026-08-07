/* ============================================================
   NexusWeave — Notification System (Bell Dropdown + Toast Popups)
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  const currentUser = api.getMe();
  if (!currentUser) return;

  const isAdmin = currentUser.role === 'admin';
  // Announcements belong to the organization workspace only — personal accounts never see them.
  const isOrgAccount = currentUser.role !== 'personal' && Boolean(currentUser.organizationId);
  const myEmail = (currentUser.email || '').toLowerCase();
  const NOTIFS_KEY = `nw_notifs_${currentUser.email}`;
  const ANNOUNCEMENTS_CACHE_KEY = `nw_announcements_${currentUser.organizationId || 'none'}`;

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
    } catch (_) { /* ignore */ }
  }

  /* ── Header Calendar Injector ── */
  function injectCalendarNavUI() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('calendarNavWrapper')) return;

    const bellWrapper = document.getElementById('notifBellWrapper');

    const calendarNavWrapper = document.createElement('div');
    calendarNavWrapper.id = 'calendarNavWrapper';
    calendarNavWrapper.className = 'notif-wrapper';
    calendarNavWrapper.innerHTML = `
      <button id="calendarNavBtn" class="notif-bell-btn" type="button" aria-label="Calendar" title="Workspace Calendar & Deadlines">
        📅
      </button>
    `;
    if (bellWrapper) {
      headerActions.insertBefore(calendarNavWrapper, bellWrapper);
    } else {
      headerActions.insertBefore(calendarNavWrapper, headerActions.firstChild);
    }

    document.getElementById('calendarNavBtn').addEventListener('click', () => {
      ensureCalendarAssetsLoaded();
      createGlobalCalendarModalInDOM();
      const triggerOpen = () => {
        if (window.openGlobalCalendarModal) {
          window.openGlobalCalendarModal();
        }
      };
      triggerOpen();
      setTimeout(triggerOpen, 100);
    });
  }

  /* ── Header Megaphone Announcement Injector (organization accounts only) ── */
  function injectMegaphoneUI() {
    if (!isOrgAccount) return;

    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('megaphoneWrapper')) return;

    const bellWrapper = document.getElementById('notifBellWrapper');

    const megaphoneWrapper = document.createElement('div');
    megaphoneWrapper.id = 'megaphoneWrapper';
    megaphoneWrapper.className = 'notif-wrapper';
    megaphoneWrapper.innerHTML = `
      <button id="megaphoneBtn" class="notif-bell-btn megaphone-btn" type="button" aria-label="Announcements" title="Workspace Announcements">
        📣
        <span id="megaphoneUnreadBadge" class="notif-badge hidden">0</span>
      </button>
    `;

    const calWrapper = document.getElementById('calendarNavWrapper');
    if (calWrapper) {
      headerActions.insertBefore(megaphoneWrapper, calWrapper.nextSibling);
    } else if (bellWrapper) {
      headerActions.insertBefore(megaphoneWrapper, bellWrapper);
    } else {
      headerActions.insertBefore(megaphoneWrapper, headerActions.firstChild);
    }

    const megaphoneBtn = document.getElementById('megaphoneBtn');
    megaphoneBtn.addEventListener('click', () => {
      openAnnouncementFeedModal();
    });

    // Warm cache
    if (api && api.fetchAnnouncements) {
      api.fetchAnnouncements().then((anns) => {
        if (anns) cachedAnnouncements = anns;
        updateMegaphoneUnreadBadge();
      }).catch(() => {});
    }
  }

  function ensureCalendarAssetsLoaded() {
    if (!document.querySelector('link[href*="calendar.css"]')) {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = '../styles/calendar.css';
      document.head.appendChild(cssLink);
    }
    if (!document.querySelector('script[src*="calendar.js"]')) {
      const script = document.createElement('script');
      script.src = '../scripts/calendar/calendar.js';
      document.body.appendChild(script);
    }
  }

  function createGlobalCalendarModalInDOM() {
    if (document.getElementById('calendarGlobalModal')) return;

    const modal = document.createElement('div');
    modal.id = 'calendarGlobalModal';
    modal.className = 'modal-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-card global-calendar-modal-card">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Workspace Schedule</p>
            <h3>📅 Calendar & Deadlines</h3>
          </div>
          <button type="button" id="closeCalendarGlobalModal" class="ghost-btn" aria-label="Close">×</button>
        </div>
        <div class="calendar-top-bar" style="margin-top: 1rem;">
          <div class="calendar-nav-group">
            <button type="button" id="prevMonthBtn" class="calendar-icon-btn" title="Previous Month">‹</button>
            <h2 id="calendarMonthTitle" class="calendar-month-title">August 2026</h2>
            <button type="button" id="nextMonthBtn" class="calendar-icon-btn" title="Next Month">›</button>
          </div>
          <button type="button" id="todayJumpBtn" class="today-jump-btn">Today</button>
        </div>
        <div class="calendar-card-wrapper" style="margin-top: 1rem;">
          <div class="calendar-grid" id="calendarGrid">
            <div class="calendar-day-header">Sun</div>
            <div class="calendar-day-header">Mon</div>
            <div class="calendar-day-header">Tue</div>
            <div class="calendar-day-header">Wed</div>
            <div class="calendar-day-header">Thu</div>
            <div class="calendar-day-header">Fri</div>
            <div class="calendar-day-header">Sat</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    if (!document.getElementById('dateTasksModal')) {
      const dateModal = document.createElement('div');
      dateModal.id = 'dateTasksModal';
      dateModal.className = 'modal-backdrop hidden';
      dateModal.setAttribute('role', 'dialog');
      dateModal.setAttribute('aria-modal', 'true');
      dateModal.innerHTML = `
        <div class="modal-card date-tasks-modal-card">
          <div class="modal-head">
            <div>
              <p class="eyebrow">Task Schedule</p>
              <h3 id="dateModalTitle">Tasks Due on Date</h3>
            </div>
            <button type="button" id="closeDateTasksModal" class="ghost-btn" aria-label="Close">×</button>
          </div>
          <div id="dateTasksList" class="date-tasks-list">
            <div class="empty-inline">Loading tasks…</div>
          </div>
          <div class="task-modal-footer" style="margin-top:1rem;display:flex;justify-content:space-between;align-items:center;">
            <button type="button" id="openCalendarCreateModalBtn" class="primary-btn">+ Add Task</button>
          </div>
        </div>
      `;
      document.body.appendChild(dateModal);
    }

    if (!document.getElementById('calendarCreateTaskModal')) {
      const createModal = document.createElement('div');
      createModal.id = 'calendarCreateTaskModal';
      createModal.className = 'modal-backdrop hidden';
      createModal.setAttribute('role', 'dialog');
      createModal.setAttribute('aria-modal', 'true');
      createModal.innerHTML = `
        <div class="modal-card calendar-create-card">
          <div class="modal-head">
            <div>
              <p class="eyebrow">Integrated Workflow</p>
              <h3>Create Task for Date</h3>
            </div>
            <button type="button" id="closeCalendarCreateModal" class="ghost-btn" aria-label="Close">×</button>
          </div>
          <form id="calendarTaskForm" style="margin-top: 1rem;">
            <div class="field-group">
              <label for="newTaskTitle">Task Title *</label>
              <input type="text" id="newTaskTitle" required placeholder="e.g. Prepare Sprint Review Deck" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
              <div class="field-group">
                <label for="newTaskDueDate">Deadline Date *</label>
                <input type="date" id="newTaskDueDate" required />
              </div>
              <div class="field-group">
                <label for="newTaskProjectId">Project</label>
                <select id="newTaskProjectId">
                  <option value="">No Project (General)</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
              <div class="field-group">
                <label for="newTaskPriority">Priority</label>
                <select id="newTaskPriority">
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div class="field-group">
                <label for="newTaskStatus">Status</label>
                <select id="newTaskStatus">
                  <option value="Todo">Todo</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>
            </div>
            <div class="field-group">
              <label for="newTaskDesc">Description (Optional)</label>
              <textarea id="newTaskDesc" rows="3" placeholder="Add task context or notes..."></textarea>
            </div>
            <div class="modal-actions" style="margin-top: 1.2rem; display: flex; justify-content: flex-end; gap: 0.6rem;">
              <button type="button" id="cancelCalendarCreateBtn" class="ghost-btn">Cancel</button>
              <button type="submit" class="primary-btn">Create Task</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(createModal);
    }
  }

  let cachedAnnouncements = [];

  function createAnnouncementModalsInDOM() {
    if (!isOrgAccount) return;
    if (document.getElementById('announcementFeedModal')) return;

    const feedModal = document.createElement('div');
    feedModal.id = 'announcementFeedModal';
    feedModal.className = 'modal-backdrop hidden';
    feedModal.setAttribute('role', 'dialog');
    feedModal.setAttribute('aria-modal', 'true');
    feedModal.innerHTML = `
      <div class="modal-card announcement-modal-card">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Workspace Updates</p>
            <h3>📣 Announcements</h3>
          </div>
          <div style="display:flex;align-items:center;gap:0.6rem;">
            ${isAdmin ? `<button type="button" id="openCreateAnnouncementBtn" class="primary-btn" style="font-size:0.82rem;padding:0.35rem 0.8rem;border-radius:999px;">+ Create Announcement</button>` : ''}
            <button type="button" id="closeAnnouncementFeedModal" class="ghost-btn" aria-label="Close">×</button>
          </div>
        </div>
        <div id="announcementFeedContainer" class="announcement-feed-list">
          <div class="empty-inline">Loading announcements...</div>
        </div>
      </div>
    `;
    document.body.appendChild(feedModal);

    const createModal = document.createElement('div');
    createModal.id = 'announcementCreateModal';
    createModal.className = 'modal-backdrop hidden';
    createModal.setAttribute('role', 'dialog');
    createModal.setAttribute('aria-modal', 'true');
    createModal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Admin Actions</p>
            <h3>Create Announcement</h3>
          </div>
          <button type="button" id="closeCreateAnnouncementModal" class="ghost-btn" aria-label="Close">×</button>
        </div>
        <form id="announcementForm" class="task-form">
          <label class="field-row">
            <span>Title <strong style="color:var(--danger, #ef4444)">*</strong></span>
            <input id="announcementTitleInput" type="text" required placeholder="Important update: Team sync schedule..." />
          </label>
          <label class="field-row">
            <span>Body Content</span>
            <textarea id="announcementContentInput" rows="4" placeholder="Write full announcement details here..."></textarea>
          </label>
          <label class="field-row">
            <span>File Attachments</span>
            <input id="announcementFileInput" type="file" multiple style="padding:0.4rem;font-size:0.85rem;" />
            <div id="announcementFilePreviews" class="attachment-previews-list" style="margin-top:0.4rem;display:flex;flex-wrap:wrap;gap:0.4rem;"></div>
          </label>
          <div id="announcementFormError" class="meta hidden" style="color:var(--danger, #ef4444);font-size:0.85rem;margin-bottom:0.5rem;"></div>
          <div class="modal-actions">
            <button type="button" id="cancelCreateAnnouncementModal" class="ghost-btn">Cancel</button>
            <button type="submit" id="submitAnnouncementBtn" class="primary-btn">Publish Announcement</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(createModal);

    // Event listeners
    document.getElementById('closeAnnouncementFeedModal')?.addEventListener('click', closeAnnouncementFeedModal);
    document.getElementById('openCreateAnnouncementBtn')?.addEventListener('click', openCreateAnnouncementModal);
    document.getElementById('closeCreateAnnouncementModal')?.addEventListener('click', closeCreateAnnouncementModal);
    document.getElementById('cancelCreateAnnouncementModal')?.addEventListener('click', closeAnnouncementFeedModal);

    // File attachments handling
    let pendingAttachments = [];
    const fileInput = document.getElementById('announcementFileInput');
    const previewContainer = document.getElementById('announcementFilePreviews');

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          try {
            const dataUrl = await readFileAsDataURL(file);
            pendingAttachments.push({
              name: file.name,
              url: dataUrl,
              mimeType: file.type || 'application/octet-stream',
              size: file.size
            });
          } catch (err) {
            console.warn('Failed to read file:', file.name);
          }
        }
        renderFilePreviews();
      });
    }

    function renderFilePreviews() {
      if (!previewContainer) return;
      if (!pendingAttachments.length) {
        previewContainer.innerHTML = '';
        return;
      }
      const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '');
      previewContainer.innerHTML = pendingAttachments.map((att, idx) => `
        <span class="attachment-pill" style="background:var(--bg-muted, rgba(255,255,255,0.08));padding:0.25rem 0.6rem;border-radius:6px;font-size:0.8rem;display:inline-flex;align-items:center;gap:0.4rem;">
          📎 ${esc(att.name)} (${Math.round(att.size / 1024)} KB)
          <button type="button" data-remove-att="${idx}" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:bold;">×</button>
        </span>
      `).join('');

      previewContainer.querySelectorAll('[data-remove-att]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-remove-att'), 10);
          pendingAttachments.splice(idx, 1);
          renderFilePreviews();
        });
      });
    }

    // Form Submission
    const form = document.getElementById('announcementForm');
    const formError = document.getElementById('announcementFormError');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('announcementTitleInput');
      const contentInput = document.getElementById('announcementContentInput');
      const submitBtn = document.getElementById('submitAnnouncementBtn');

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();

      if (!title) {
        if (formError) {
          formError.textContent = 'Announcement title is required.';
          formError.classList.remove('hidden');
        }
        return;
      }

      if (formError) formError.classList.add('hidden');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';
      }

      try {
        let result = null;
        if (api && api.createAnnouncement) {
          result = await api.createAnnouncement({
            title,
            content,
            attachments: pendingAttachments
          });
        }

        if (result && result.success) {
          titleInput.value = '';
          contentInput.value = '';
          if (fileInput) fileInput.value = '';
          pendingAttachments = [];
          renderFilePreviews();
          closeCreateAnnouncementModal();
          await loadAndRenderAnnouncements();

          if (window.NexusNotify) {
            window.NexusNotify.add({ icon: '📣', text: `Announcement published: "${title}"`, type: 'success' });
          }
        } else {
          // Offline fallback storage
          const localAnnouncements = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_CACHE_KEY) || '[]');
          const newAnn = {
            id: `ann_${Date.now()}`,
            title,
            content,
            attachments: pendingAttachments,
            createdBy: currentUser.email,
            authorName: currentUser.name || currentUser.email.split('@')[0],
            createdAt: new Date().toISOString()
          };
          localAnnouncements.unshift(newAnn);
          localStorage.setItem(ANNOUNCEMENTS_CACHE_KEY, JSON.stringify(localAnnouncements));

          titleInput.value = '';
          contentInput.value = '';
          if (fileInput) fileInput.value = '';
          pendingAttachments = [];
          renderFilePreviews();
          closeCreateAnnouncementModal();
          await loadAndRenderAnnouncements();
        }
      } catch (err) {
        if (formError) {
          formError.textContent = err.message || 'Failed to publish announcement.';
          formError.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Publish Announcement';
        }
      }
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function openAnnouncementFeedModal() {
    if (!isOrgAccount) return;
    createAnnouncementModalsInDOM();
    const modal = document.getElementById('announcementFeedModal');
    if (modal) {
      modal.classList.remove('hidden');
      loadAndRenderAnnouncements();
      markAnnouncementsRead();
    }
  }

  function closeAnnouncementFeedModal() {
    const modal = document.getElementById('announcementFeedModal');
    if (modal) modal.classList.add('hidden');
  }

  function openCreateAnnouncementModal() {
    if (!isOrgAccount) return;
    createAnnouncementModalsInDOM();
    const modal = document.getElementById('announcementCreateModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeCreateAnnouncementModal() {
    const modal = document.getElementById('announcementCreateModal');
    if (modal) modal.classList.add('hidden');
  }

  async function loadAndRenderAnnouncements() {
    if (!isOrgAccount) return;

    const container = document.getElementById('announcementFeedContainer');
    if (!container) return;

    let announcements = null;
    if (api && api.fetchAnnouncements) {
      announcements = await api.fetchAnnouncements();
    }

    if (!announcements) {
      announcements = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_CACHE_KEY) || '[]');
    }

    cachedAnnouncements = announcements || [];

    if (!cachedAnnouncements.length) {
      container.innerHTML = `<div class="empty-inline">No announcements published yet.</div>`;
      return;
    }

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = cachedAnnouncements.map((item, idx) => {
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
      const author = item.authorName || 'Admin';
      const attachments = item.attachments || [];

      return `
        <div class="announcement-accordion-item" data-announcement-id="${item.id || item._id || idx}">
          <button type="button" class="announcement-accordion-header">
            <div class="announcement-title-row">
              <span class="announcement-icon">📣</span>
              <strong>${esc(item.title)}</strong>
            </div>
            <div class="announcement-meta-right">
              <small>${esc(author)} • ${esc(dateStr)}</small>
              <span class="accordion-arrow">▼</span>
            </div>
          </button>
          <div class="announcement-accordion-body hidden">
            ${item.content ? `<div class="announcement-body-text">${esc(item.content).replace(/\n/g, '<br/>')}</div>` : '<p class="text-soft" style="font-style:italic;">No text content attached.</p>'}
            ${attachments.length ? `
              <div class="announcement-attachments-box" style="margin-top:0.8rem;padding-top:0.6rem;border-top:1px dashed var(--border, rgba(255,255,255,0.1));">
                <h5 style="font-size:0.82rem;margin-bottom:0.4rem;color:var(--ink-soft);">Attachments (${attachments.length}):</h5>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                  ${attachments.map(att => `
                    <a href="${att.url}" download="${esc(att.name)}" target="_blank" class="attachment-download-chip" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.38rem 0.75rem;background:var(--bg-muted, rgba(255,255,255,0.06));border:1px solid var(--border, rgba(255,255,255,0.12));border-radius:8px;font-size:0.82rem;text-decoration:none;color:var(--accent,#8b5cf6);font-weight:500;">
                      💾 ${esc(att.name)}
                    </a>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Toggle accordions
    container.querySelectorAll('.announcement-accordion-header').forEach(headerBtn => {
      headerBtn.addEventListener('click', () => {
        const item = headerBtn.closest('.announcement-accordion-item');
        const body = item.querySelector('.announcement-accordion-body');
        const arrow = item.querySelector('.accordion-arrow');

        const isHidden = body.classList.contains('hidden');
        body.classList.toggle('hidden', !isHidden);
        arrow.textContent = isHidden ? '▲' : '▼';
        item.classList.toggle('is-expanded', isHidden);
      });
    });
  }

  function markAnnouncementsRead() {
    localStorage.setItem(`nw_ann_read_${currentUser.email}`, Date.now().toString());
    updateMegaphoneUnreadBadge();
  }

  function updateMegaphoneUnreadBadge() {
    const badge = document.getElementById('megaphoneUnreadBadge');
    if (!badge) return;

    const lastRead = parseInt(localStorage.getItem(`nw_ann_read_${currentUser.email}`) || '0', 10);
    const unreadCount = cachedAnnouncements.filter(a => {
      const created = a.createdAt ? new Date(a.createdAt).getTime() : Date.now();
      return created > lastRead;
    }).length;

    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAllUI();
    });
  } else {
    initAllUI();
  }

  function initAllUI() {
    injectBellUI();
    injectCalendarNavUI();
    injectMegaphoneUI();
    seedDeadlineNotifications();
  }

  window.NexusNotify = {
    add: addNotification,
    refresh: updateBellUI,
    getAll: getNotifications
  };
})();
