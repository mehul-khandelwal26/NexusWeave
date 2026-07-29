(function () {
  const DB_KEY = 'users';
  const SESSION_KEY = 'session';
  const VIEW_STATE_KEY = 'nexus-task-view-state';
  const helpers = window.AppHelpers;
  const api = window.NexusAPI;

  const sessionEmail = localStorage.getItem(SESSION_KEY);
  let database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');

  function normalizeUser(user, fallbackEmail = sessionEmail) {
    const resolvedEmail = fallbackEmail || user?.email || 'demo@nexusweave.app';
    return {
      ...(user || {}),
      email: resolvedEmail,
      theme: user?.theme || 'light',
      projects: Array.isArray(user?.projects) ? user.projects : [],
      tasks: Array.isArray(user?.tasks) ? user.tasks : [],
      activity: Array.isArray(user?.activity) ? user.activity : []
    };
  }

  function notifyTaskSync() {
    window.dispatchEvent(new CustomEvent('nexus:tasks-updated'));
  }

  const currentUser = sessionEmail ? normalizeUser(database[sessionEmail], sessionEmail) : null;

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  const initialState = {
    query: '',
    priority: 'All',
    status: 'All',
    project: 'All',
    dueRange: 'All',
    sortBy: 'updatedAt',
    sortDirection: 'desc',
    label: 'All',
    currentPage: 1,
    itemsPerPage: 12
  };

  const state = {
    currentUser: normalizeUser(currentUser, sessionEmail),
    selectedProjectId: currentUser.projects?.[0]?.id || null,
    filters: loadViewState(),
    pendingDeleteTaskId: null,
    activeDrawerTaskId: null
  };

  // DOM Elements
  const taskGroupsEl = document.getElementById('taskGroups');
  const boardColumnsEl = document.getElementById('boardColumns');
  const drawerEl = document.getElementById('taskDrawer');
  const drawerTitleEl = document.getElementById('drawerTitle');
  const drawerMetaEl = document.getElementById('drawerMeta');
  const drawerDescriptionEl = document.getElementById('drawerDescription');
  const drawerDetailsEl = document.getElementById('drawerDetails');

  const searchInput = document.getElementById('taskSearch');
  const sortSelect = document.getElementById('taskSort');
  const priorityFilter = document.getElementById('taskPriorityFilter');
  const statusFilter = document.getElementById('taskStatusFilter');
  const projectFilter = document.getElementById('taskProjectFilter');
  const labelFilter = document.getElementById('taskLabelFilter');
  const dueFilter = document.getElementById('taskDueFilter');
  const filterChipsEl = document.getElementById('filterChips');

  // Pagination Elements
  const paginationBar = document.getElementById('paginationBar');
  const paginationItemRange = document.getElementById('paginationItemRange');
  const paginationTotalItems = document.getElementById('paginationTotalItems');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const currentPageIndicator = document.getElementById('currentPageIndicator');
  const itemsPerPageSelect = document.getElementById('itemsPerPageSelect');

  // Modal Elements
  const modalEl = document.getElementById('taskModal');
  const deleteModalEl = document.getElementById('deleteModal');
  const addTaskButton = document.getElementById('addTask');
  const closeModalButton = document.getElementById('closeTaskModal');
  const cancelModalButton = document.getElementById('cancelTaskModal');
  const closeDrawerButton = document.getElementById('closeDrawer');
  const deleteConfirmButton = document.getElementById('confirmDeleteTask');
  const deleteCancelButton = document.getElementById('cancelDeleteTask');

  // Form Controls
  const taskForm = document.getElementById('taskForm');
  const taskIdInput = document.getElementById('taskId');
  const taskTitleInput = document.getElementById('taskTitle');
  const taskDescriptionInput = document.getElementById('taskDescription');
  const taskAssigneeInput = document.getElementById('taskAssignee');
  const taskPriorityInput = document.getElementById('taskPriority');
  const taskDueDateInput = document.getElementById('taskDueDate');
  const taskStatusInput = document.getElementById('taskStatus');
  const taskRecurringInput = document.getElementById('taskRecurring');
  const taskLabelsInput = document.getElementById('taskLabels');
  const taskAttachmentsInput = document.getElementById('taskAttachments');
  const taskModalTitle = document.getElementById('taskModalTitle');
  const taskSubmitButton = document.getElementById('taskSubmitBtn');
  const emptyStateEl = document.getElementById('emptyState');

  function loadViewState() {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || '{}');
      return { ...initialState, ...saved };
    } catch (error) {
      return { ...initialState };
    }
  }

  function saveViewState() {
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(state.filters));
  }

  function refreshCurrentUserFromStorage() {
    const storedUsers = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
    const storedUser = sessionEmail ? storedUsers[sessionEmail] : null;
    database = storedUsers;
    if (storedUser) {
      state.currentUser = normalizeUser(storedUser, sessionEmail);
      return state.currentUser;
    }
    state.currentUser = normalizeUser(state.currentUser, sessionEmail);
    return state.currentUser;
  }

  function persistUser() {
    if (!sessionEmail) return;
    const safeUser = normalizeUser(state.currentUser, sessionEmail);
    state.currentUser = safeUser;
    database[sessionEmail] = safeUser;
    localStorage.setItem(DB_KEY, JSON.stringify(database));
    saveViewState();
    notifyTaskSync();
  }

  function pushNotificationToUser(targetEmail, text, icon = '📌') {
    const users = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
    if (users[targetEmail]) {
      if (!Array.isArray(users[targetEmail].activity)) users[targetEmail].activity = [];
      users[targetEmail].activity.unshift({
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        icon,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString()
      });
      users[targetEmail].activity = users[targetEmail].activity.slice(0, 20);
      localStorage.setItem(DB_KEY, JSON.stringify(users));
      database = users;
    }
  }

  function getVisibleTasks() {
    const taskList = Array.isArray(state.currentUser.tasks) ? state.currentUser.tasks : [];
    const visibleProjects = taskList.filter((task) => {
      if (!state.selectedProjectId) return true;
      return task.projectId === state.selectedProjectId;
    });

    const filtered = helpers.filterTasks(visibleProjects, state.filters, state.currentUser.projects || []);
    return sortTasks(filtered);
  }

  function sortTasks(tasks) {
    const sorted = [...tasks].sort((left, right) => {
      const direction = state.filters.sortDirection === 'asc' ? 1 : -1;
      const sortBy = state.filters.sortBy;
      const priorityRank = (val) => ({ Urgent: 4, High: 3, Medium: 2, Low: 1 })[val] || 0;

      if (sortBy === 'priority') {
        return (priorityRank(right.priority) - priorityRank(left.priority)) * direction;
      }
      if (sortBy === 'deadline') {
        const leftDate = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const rightDate = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
        return (leftDate - rightDate) * direction;
      }
      if (sortBy === 'title') {
        return left.title.localeCompare(right.title) * direction;
      }
      if (sortBy === 'updatedAt') {
        const leftValue = left.updatedAt || left.createdAt || '';
        const rightValue = right.updatedAt || right.createdAt || '';
        return (leftValue > rightValue ? 1 : -1) * direction;
      }
      return 0;
    });
    return sorted;
  }

  function getProjectName(projectId) {
    return state.currentUser.projects.find((p) => p.id === projectId)?.name || 'General';
  }

  function getTaskStatusGroup(task) {
    if (task.status === 'Done') return 'Done';
    if (task.status === 'In Progress' || task.status === 'Review') return 'In Progress';
    return 'Todo';
  }

  function renderFilterChips() {
    if (!filterChipsEl) return;
    const chips = [];

    if (state.filters.query) chips.push({ label: `Search: ${state.filters.query}`, value: 'query' });
    if (state.filters.priority !== 'All') chips.push({ label: `Priority: ${state.filters.priority}`, value: 'priority' });
    if (state.filters.status !== 'All') chips.push({ label: `Status: ${state.filters.status}`, value: 'status' });
    if (state.filters.project !== 'All') chips.push({ label: `Project: ${getProjectName(state.filters.project)}`, value: 'project' });
    if (state.filters.label !== 'All') chips.push({ label: `Label: ${state.filters.label}`, value: 'label' });
    if (state.filters.dueRange !== 'All') chips.push({ label: `Due: ${state.filters.dueRange}`, value: 'dueRange' });

    if (!chips.length) {
      filterChipsEl.innerHTML = '<span class="filter-chip">All tasks</span>';
      return;
    }

    filterChipsEl.innerHTML = chips.map((chip) => `<button class="filter-chip" type="button" data-clear-filter="${chip.value}">${chip.label} ×</button>`).join('');

    filterChipsEl.querySelectorAll('[data-clear-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clearFilter;
        state.filters[key] = 'All';
        if (key === 'query') state.filters.query = '';
        saveViewState();
        renderAll();
      });
    });
  }

  function renderFilterOptions() {
    const projects = state.currentUser.projects || [];
    if (projectFilter) {
      projectFilter.innerHTML = `<option value="All">All projects</option>${projects.map((p) => `<option value="${p.id}" ${state.filters.project === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}`;
    }

    const labels = Array.from(new Set((state.currentUser.tasks || []).flatMap((t) => t.labels || [])));
    if (labelFilter) {
      labelFilter.innerHTML = `<option value="All">All labels</option>${labels.map((l) => `<option value="${l}" ${state.filters.label === l ? 'selected' : ''}>${l}</option>`).join('')}`;
    }
  }

  /* ─────────────────────────────────────────────
     PAGINATION RENDERER
  ───────────────────────────────────────────── */
  function renderPagination(totalCount) {
    if (!paginationBar) return;
    if (totalCount <= state.filters.itemsPerPage) {
      paginationBar.classList.add('hidden');
      return;
    }

    paginationBar.classList.remove('hidden');

    const totalPages = Math.ceil(totalCount / state.filters.itemsPerPage);
    if (state.filters.currentPage > totalPages) state.filters.currentPage = totalPages;
    if (state.filters.currentPage < 1) state.filters.currentPage = 1;

    const start = (state.filters.currentPage - 1) * state.filters.itemsPerPage + 1;
    const end = Math.min(state.filters.currentPage * state.filters.itemsPerPage, totalCount);

    if (paginationItemRange) paginationItemRange.textContent = `${start}-${end}`;
    if (paginationTotalItems) paginationTotalItems.textContent = totalCount;
    if (currentPageIndicator) currentPageIndicator.textContent = `Page ${state.filters.currentPage} of ${totalPages}`;

    if (prevPageBtn) prevPageBtn.disabled = state.filters.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = state.filters.currentPage >= totalPages;
  }

  function getPaginatedTasks(tasks) {
    renderPagination(tasks.length);
    const start = (state.filters.currentPage - 1) * state.filters.itemsPerPage;
    return tasks.slice(start, start + state.filters.itemsPerPage);
  }

  /* ─────────────────────────────────────────────
     TASKS PAGE RENDERER
  ───────────────────────────────────────────── */
  function renderTasksPage() {
    if (!taskGroupsEl) return;
    const allVisible = getVisibleTasks();
    const paginated = getPaginatedTasks(allVisible);

    const groups = {
      Todo: paginated.filter((t) => getTaskStatusGroup(t) === 'Todo'),
      'In Progress': paginated.filter((t) => getTaskStatusGroup(t) === 'In Progress'),
      Done: paginated.filter((t) => getTaskStatusGroup(t) === 'Done')
    };

    if (!allVisible.length && emptyStateEl) {
      taskGroupsEl.innerHTML = '';
      emptyStateEl.classList.remove('hidden');
      return;
    }

    emptyStateEl?.classList.add('hidden');
    taskGroupsEl.innerHTML = Object.entries(groups).map(([label, groupTasks]) => {
      const renderedRows = groupTasks.length ? groupTasks.map((task) => {
        const labelsPills = (task.labels || []).map(l => `<span class="filter-chip" style="font-size:0.7rem;padding:0.1rem 0.4rem;">${l}</span>`).join(' ');
        const assigneeBadge = task.assigneeName ? `<span class="org-badge badge-employee" style="font-size:0.72rem;">👤 ${task.assigneeName}</span>` : '';

        return `
          <article class="task-row ${task.status === 'Done' ? 'is-complete' : ''}" data-task-id="${task.id}">
            <button class="task-check" type="button" data-toggle-task="${task.id}" aria-label="Mark ${task.title} complete">
              ${task.status === 'Done' ? '✓' : ''}
            </button>
            <div class="task-main">
              <div class="task-title-row">
                <strong>${task.title} ${task.recurring && task.recurring !== 'None' ? '🔄' : ''}</strong>
                <div class="task-pill-row">
                  ${assigneeBadge}
                  <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span>
                  <span class="status-pill ${helpers.getTaskStatusTone(task.status)}">${task.status}</span>
                </div>
              </div>
              <div class="task-meta">${task.description || 'No description yet.'} ${labelsPills}</div>
            </div>
            <div class="task-side-meta">
              <div>${getProjectName(task.projectId)}</div>
              <div>${helpers.formatDisplayDate(task.dueDate)}</div>
              <div class="task-row-actions">
                <button class="icon-btn" type="button" data-open-drawer="${task.id}">↗</button>
                <button class="icon-btn danger" type="button" data-delete-task="${task.id}">🗑</button>
              </div>
            </div>
          </article>
        `;
      }).join('') : '<div class="empty-inline">No tasks in this section.</div>';

      return `
        <section class="task-group">
          <div class="task-group-header">
            <h3>${label}</h3>
            <span>${groupTasks.length} task${groupTasks.length === 1 ? '' : 's'}</span>
          </div>
          <div class="task-group-list">${renderedRows}</div>
        </section>
      `;
    }).join('');

    bindTaskEvents(taskGroupsEl);
  }

  /* ─────────────────────────────────────────────
     BOARD KANBAN RENDERER
  ───────────────────────────────────────────── */
  function renderBoardPage() {
    if (!boardColumnsEl) return;
    const allVisible = getVisibleTasks();

    const columns = {
      Todo: allVisible.filter((t) => t.status === 'Todo' || !t.status),
      'In Progress': allVisible.filter((t) => t.status === 'In Progress' || t.status === 'Review'),
      Done: allVisible.filter((t) => t.status === 'Done')
    };

    boardColumnsEl.innerHTML = Object.entries(columns).map(([name, columnTasks]) => `
      <section class="board-column" data-column-name="${name}">
        <div class="board-column-header">
          <div>
            <h3>${name}</h3>
            <p>${columnTasks.length} task${columnTasks.length === 1 ? '' : 's'}</p>
          </div>
          <span class="status-pill ${name === 'Done' ? 'status-done' : name === 'In Progress' ? 'status-progress' : 'status-todo'}">${columnTasks.length}</span>
        </div>
        <div class="board-card-list">
          ${columnTasks.length ? columnTasks.map((task) => {
            const progressPct = task.progress || (task.status === 'Done' ? 100 : 0);
            return `
              <article class="board-card" draggable="true" data-task-id="${task.id}">
                <div class="board-card-top">
                  <strong>${task.title}</strong>
                  <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span>
                </div>
                <p>${task.description || 'No notes yet.'}</p>

                <!-- Progress Bar -->
                <div style="margin:0.3rem 0;">
                  <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--ink-soft);margin-bottom:0.15rem;">
                    <span>Progress</span>
                    <span>${progressPct}%</span>
                  </div>
                  <div style="height:5px;background:var(--surface-muted);border-radius:99px;overflow:hidden;border:1px solid var(--border);">
                    <div style="width:${progressPct}%;height:100%;background:var(--accent);border-radius:99px;transition:width 0.3s ease;"></div>
                  </div>
                </div>

                <div class="board-card-foot">
                  <span>${helpers.formatDisplayDate(task.dueDate)}</span>
                  ${task.assigneeName ? `<span class="org-badge badge-employee" style="font-size:0.7rem;">👤 ${task.assigneeName.split(' ')[0]}</span>` : ''}
                  <div class="task-row-actions">
                    <button class="icon-btn" type="button" data-open-drawer="${task.id}">↗</button>
                    <button class="icon-btn danger" type="button" data-delete-task="${task.id}">🗑</button>
                  </div>
                </div>
              </article>
            `;
          }).join('') : '<div class="empty-inline">No tasks here yet.</div>'}
        </div>
      </section>
    `).join('');

    // Bind Drag & Drop for Kanban
    boardColumnsEl.querySelectorAll('.board-card').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', card.dataset.taskId);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });

    boardColumnsEl.querySelectorAll('.board-column').forEach((column) => {
      column.addEventListener('dragover', (event) => event.preventDefault());
      column.addEventListener('dragenter', () => column.classList.add('is-drop-target'));
      column.addEventListener('dragleave', () => column.classList.remove('is-drop-target'));
      column.addEventListener('drop', (event) => {
        event.preventDefault();
        column.classList.remove('is-drop-target');
        const taskId = event.dataTransfer.getData('text/plain');
        moveTaskToColumn(taskId, column.dataset.columnName);
      });
    });

    bindTaskEvents(boardColumnsEl);
  }

  function bindTaskEvents(container) {
    container.querySelectorAll('[data-task-id]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-task]')) return;
        if (e.target.closest('[data-delete-task]')) return;
        if (e.target.closest('[data-open-drawer]')) return;
        openDrawer(card.dataset.taskId);
      });
    });

    container.querySelectorAll('[data-toggle-task]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaskComplete(btn.dataset.toggleTask);
      });
    });

    container.querySelectorAll('[data-delete-task]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(btn.dataset.deleteTask);
      });
    });

    container.querySelectorAll('[data-open-drawer]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDrawer(btn.dataset.openDrawer);
      });
    });
  }

  /* ─────────────────────────────────────────────
     TASK ACTIONS (Optimistic & Synced)
  ───────────────────────────────────────────── */
  function moveTaskToColumn(taskId, targetColumn) {
    const taskIdx = state.currentUser.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return;

    const task = state.currentUser.tasks[taskIdx];
    const prevStatus = task.status;
    task.status = targetColumn;
    task.updatedAt = new Date().toISOString();

    if (targetColumn === 'Done') {
      task.progress = 100;
      task.completedAt = new Date().toISOString();
      handleRecurringTask(task);

      // Emit Realtime Socket Event for Admin Notifications
      if (window.NexusSocket) {
        window.NexusSocket.emit('task:completed', {
          orgId: currentUser.organizationId,
          title: task.title,
          userName: currentUser.name || currentUser.email.split('@')[0],
          userEmail: currentUser.email
        });
      }

      // Notify Admin if employee completed task
      if (task.assignedBy && task.assignedBy !== currentUser.email) {
        pushNotificationToUser(task.assignedBy, `Task Completed: ${task.title} by ${currentUser.name}`, '✅');
      }
    } else if (prevStatus === 'Done') {
      task.progress = 50;
    }

    persistUser();

    // Sync assignee user record if different
    if (task.assigneeEmail && task.assigneeEmail !== currentUser.email) {
      syncTaskToAssignee(task.assigneeEmail, task);
    }

    renderAll();
  }

  function toggleTaskComplete(taskId) {
    const task = state.currentUser.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === 'Done' ? 'Todo' : 'Done';
    moveTaskToColumn(taskId, newStatus);
  }

  function handleRecurringTask(task) {
    if (!task.recurring || task.recurring === 'None') return;

    const nextDueDate = new Date();
    if (task.recurring === 'Daily') nextDueDate.setDate(nextDueDate.getDate() + 1);
    if (task.recurring === 'Weekly') nextDueDate.setDate(nextDueDate.getDate() + 7);
    if (task.recurring === 'Monthly') nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    const recurringInstance = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      title: `${task.title} (Recurring)`,
      status: 'Todo',
      progress: 0,
      dueDate: nextDueDate.toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    state.currentUser.tasks.push(recurringInstance);
  }

  function syncTaskToAssignee(assigneeEmail, task) {
    const users = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
    if (!users[assigneeEmail]) return;

    if (!Array.isArray(users[assigneeEmail].tasks)) users[assigneeEmail].tasks = [];
    const idx = users[assigneeEmail].tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      users[assigneeEmail].tasks[idx] = { ...task };
    } else {
      users[assigneeEmail].tasks.push({ ...task });
    }
    localStorage.setItem(DB_KEY, JSON.stringify(users));
    database = users;
  }

  /* ─────────────────────────────────────────────
     ENHANCED DRAWER (Comments, Accept, Progress)
  ───────────────────────────────────────────── */
  function openDrawer(taskId) {
    const task = state.currentUser.tasks.find((t) => t.id === taskId);
    if (!task) return;

    state.activeDrawerTaskId = taskId;
    const isAssignee = task.assigneeEmail === currentUser.email;

    drawerTitleEl.textContent = task.title;
    drawerMetaEl.textContent = `${getProjectName(task.projectId)} • ${helpers.formatDisplayDate(task.dueDate)} • ${task.priority}`;
    drawerDescriptionEl.textContent = task.description || 'No description added yet.';

    const comments = task.comments || [];

    drawerDetailsEl.innerHTML = `
      <div style="flex-direction:column;align-items:stretch;gap:0.75rem;">
        
        <!-- Accept Task Button (if assigned to employee & not accepted) -->
        ${isAssignee && !task.accepted && task.status !== 'Done' ? `
          <div style="background:var(--surface-muted);padding:0.75rem;border-radius:12px;border:1px solid var(--accent);display:flex;align-items:center;justify-content:space-between;">
            <div>
              <strong style="display:block;font-size:0.9rem;">Assigned to You</strong>
              <small class="text-soft">Accept this task to mark it in-progress</small>
            </div>
            <button type="button" id="acceptTaskBtn" class="primary-btn" style="padding:0.4rem 0.9rem;font-size:0.85rem;">Accept Task</button>
          </div>
        ` : ''}

        <!-- Interactive Progress Slider -->
        <div style="display:grid;gap:0.35rem;">
          <div style="display:flex;justify-content:space-between;font-size:0.88rem;">
            <strong>Progress</strong>
            <span id="drawerProgressValue">${task.progress || 0}%</span>
          </div>
          <input type="range" id="drawerProgressSlider" min="0" max="100" value="${task.progress || 0}" style="width:100%;accent-color:var(--accent);" />
        </div>

        <div><strong>Assignee</strong><span>${task.assigneeName || 'Unassigned'}</span></div>
        <div><strong>Status</strong><span>${task.status}</span></div>
        <div><strong>Priority</strong><span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span></div>
        <div><strong>Recurring</strong><span>${task.recurring || 'None'}</span></div>
        <div><strong>Labels</strong><span>${(task.labels || []).join(', ') || 'None'}</span></div>
        <div><strong>Attachments</strong><span>${task.attachments ? task.attachments : 'None'}</span></div>

        <!-- Comments Thread Section -->
        <div style="border-top:1px solid var(--border);padding-top:1rem;margin-top:0.5rem;display:grid;gap:0.75rem;">
          <strong style="font-size:0.95rem;">Comments (${comments.length})</strong>
          <div id="commentsThread" style="display:grid;gap:0.6rem;max-height:180px;overflow-y:auto;">
            ${comments.length ? comments.map(c => `
              <div style="padding:0.6rem 0.75rem;background:var(--surface-muted);border-radius:12px;border:1px solid var(--border);font-size:0.85rem;">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                  <strong>${c.author}</strong>
                  <small style="color:var(--ink-soft);">${c.time}</small>
                </div>
                <div>${c.text}</div>
              </div>
            `).join('') : '<div class="empty-inline">No comments yet. Be the first to comment!</div>'}
          </div>

          <div style="display:flex;gap:0.5rem;margin-top:0.3rem;">
            <input type="text" id="newCommentInput" placeholder="Write a comment…" style="flex:1;border:1px solid var(--border);border-radius:12px;padding:0.55rem 0.75rem;font-size:0.85rem;background:var(--surface);color:inherit;" />
            <button type="button" id="postCommentBtn" class="primary-btn" style="padding:0.55rem 0.9rem;font-size:0.85rem;">Post</button>
          </div>
        </div>

      </div>
    `;

    // Bind Accept Task
    const acceptBtn = document.getElementById('acceptTaskBtn');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        task.accepted = true;
        task.status = 'In Progress';
        task.progress = Math.max(task.progress || 0, 15);
        persistUser();
        if (task.assignedBy) {
          pushNotificationToUser(task.assignedBy, `${currentUser.name} accepted task: ${task.title}`, '👍');
        }
        openDrawer(taskId);
        renderAll();
      });
    }

    // Bind Progress Slider
    const progressSlider = document.getElementById('drawerProgressSlider');
    const progressVal = document.getElementById('drawerProgressValue');
    if (progressSlider && progressVal) {
      progressSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        progressVal.textContent = `${val}%`;
        task.progress = val;
        if (val === 100 && task.status !== 'Done') {
          moveTaskToColumn(taskId, 'Done');
        } else {
          persistUser();
          renderAll();
        }
      });
    }

    // Bind Comments
    const postCommentBtn = document.getElementById('postCommentBtn');
    const newCommentInput = document.getElementById('newCommentInput');
    if (postCommentBtn && newCommentInput) {
      const handlePost = () => {
        const text = newCommentInput.value.trim();
        if (!text) return;
        if (!task.comments) task.comments = [];
        task.comments.push({
          id: `c-${Date.now()}`,
          author: currentUser.name || currentUser.email.split('@')[0],
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        newCommentInput.value = '';
        persistUser();
        openDrawer(taskId);
      };
      postCommentBtn.addEventListener('click', handlePost);
      newCommentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handlePost();
      });
    }

    drawerEl.classList.add('is-open');
  }

  function closeDrawer() {
    drawerEl.classList.remove('is-open');
    state.activeDrawerTaskId = null;
  }

  /* ─────────────────────────────────────────────
     MODAL HANDLERS
  ───────────────────────────────────────────── */
  function openTaskModal(taskIdToEdit = null) {
    populateAssigneesDropdown();

    if (taskIdToEdit) {
      const task = state.currentUser.tasks.find((t) => t.id === taskIdToEdit);
      if (!task) return;
      taskIdInput.value = task.id;
      taskTitleInput.value = task.title;
      taskDescriptionInput.value = task.description || '';
      if (taskAssigneeInput) taskAssigneeInput.value = task.assigneeEmail || '';
      taskPriorityInput.value = task.priority || 'Medium';
      taskDueDateInput.value = task.dueDate || '';
      taskStatusInput.value = task.status || 'Todo';
      if (taskRecurringInput) taskRecurringInput.value = task.recurring || 'None';
      if (taskLabelsInput) taskLabelsInput.value = (task.labels || []).join(', ');
      taskAttachmentsInput.value = task.attachments || '';
      taskModalTitle.textContent = 'Edit task';
      taskSubmitButton.textContent = 'Save changes';
    } else {
      taskForm.reset();
      taskIdInput.value = '';
      taskModalTitle.textContent = 'Create task';
      taskSubmitButton.textContent = 'Create task';
    }
    modalEl.classList.remove('hidden');
  }

  function closeTaskModal() {
    modalEl.classList.add('hidden');
    taskForm.reset();
  }

  function populateAssigneesDropdown() {
    if (!taskAssigneeInput) return;
    const orgId = currentUser.organizationId;
    const orgUsers = orgId ? api.getAllUsersInOrg(orgId) : [currentUser];

    taskAssigneeInput.innerHTML = `<option value="">Myself (${currentUser.name || 'Unassigned'})</option>` +
      orgUsers.filter(u => u.email !== currentUser.email).map(u => `
        <option value="${u.email}">${u.name || u.email} (${u.role || 'employee'})</option>
      `).join('');
  }

  function openDeleteModal(taskId) {
    state.pendingDeleteTaskId = taskId;
    deleteModalEl.classList.remove('hidden');
  }

  function closeDeleteModal() {
    deleteModalEl.classList.add('hidden');
    state.pendingDeleteTaskId = null;
  }

  /* ─────────────────────────────────────────────
     FORM SUBMIT & ALL RENDERS
  ───────────────────────────────────────────── */
  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const editingId = taskIdInput.value;
    const title = taskTitleInput.value.trim();
    const description = taskDescriptionInput.value.trim();
    const assigneeEmail = taskAssigneeInput ? taskAssigneeInput.value : '';
    const priority = taskPriorityInput.value;
    const dueDate = taskDueDateInput.value;
    const status = taskStatusInput.value;
    const recurring = taskRecurringInput ? taskRecurringInput.value : 'None';
    const labels = taskLabelsInput ? taskLabelsInput.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    const attachments = taskAttachmentsInput.value.trim();

    // Get Assignee Name
    let assigneeName = '';
    if (assigneeEmail) {
      const orgUsers = currentUser.organizationId ? api.getAllUsersInOrg(currentUser.organizationId) : [currentUser];
      const match = orgUsers.find(u => u.email === assigneeEmail);
      if (match) assigneeName = match.name || match.email;
    }

    if (editingId) {
      const idx = state.currentUser.tasks.findIndex(t => t.id === editingId);
      if (idx !== -1) {
        state.currentUser.tasks[idx] = {
          ...state.currentUser.tasks[idx],
          title,
          description,
          assigneeEmail,
          assigneeName,
          priority,
          dueDate,
          status,
          recurring,
          labels,
          attachments,
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      const newTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title,
        description,
        assigneeEmail: assigneeEmail || currentUser.email,
        assigneeName: assigneeName || currentUser.name,
        assignedBy: currentUser.email,
        accepted: !assigneeEmail || assigneeEmail === currentUser.email,
        priority,
        dueDate,
        status,
        recurring,
        labels,
        attachments,
        progress: status === 'Done' ? 100 : 0,
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      state.currentUser.tasks.unshift(newTask);

      // If assigned to another employee, push task + notification to them
      if (assigneeEmail && assigneeEmail !== currentUser.email) {
        syncTaskToAssignee(assigneeEmail, newTask);
        pushNotificationToUser(assigneeEmail, `New Task Assigned: ${title} by ${currentUser.name}`, '📋');

        if (window.NexusSocket) {
          window.NexusSocket.emit('task:assigned', {
            assigneeEmail,
            title,
            assignedByName: currentUser.name || currentUser.email
          });
        }
      }
    }

    persistUser();
    closeTaskModal();
    renderAll();
  });

  if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener('click', () => {
      if (!state.pendingDeleteTaskId) return;
      state.currentUser.tasks = state.currentUser.tasks.filter(t => t.id !== state.pendingDeleteTaskId);
      persistUser();
      closeDeleteModal();
      renderAll();
    });
  }

  if (deleteCancelButton) deleteCancelButton.addEventListener('click', closeDeleteModal);
  if (addTaskButton) addTaskButton.addEventListener('click', () => openTaskModal());
  if (closeModalButton) closeModalButton.addEventListener('click', closeTaskModal);
  if (cancelModalButton) cancelModalButton.addEventListener('click', closeTaskModal);
  if (closeDrawerButton) closeDrawerButton.addEventListener('click', closeDrawer);

  // Filter & Sort Listeners
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.filters.query = e.target.value.trim();
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.filters.sortBy = e.target.value;
      saveViewState();
      renderAll();
    });
  }

  if (priorityFilter) {
    priorityFilter.addEventListener('change', (e) => {
      state.filters.priority = e.target.value;
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  if (projectFilter) {
    projectFilter.addEventListener('change', (e) => {
      state.filters.project = e.target.value;
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  if (labelFilter) {
    labelFilter.addEventListener('change', (e) => {
      state.filters.label = e.target.value;
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  if (dueFilter) {
    dueFilter.addEventListener('change', (e) => {
      state.filters.dueRange = e.target.value;
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  // Pagination Listeners
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (state.filters.currentPage > 1) {
        state.filters.currentPage--;
        renderAll();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      state.filters.currentPage++;
      renderAll();
    });
  }

  if (itemsPerPageSelect) {
    itemsPerPageSelect.value = state.filters.itemsPerPage || 12;
    itemsPerPageSelect.addEventListener('change', (e) => {
      state.filters.itemsPerPage = parseInt(e.target.value, 10);
      state.filters.currentPage = 1;
      saveViewState();
      renderAll();
    });
  }

  function renderAll() {
    refreshCurrentUserFromStorage();
    renderFilterOptions();
    renderFilterChips();
    renderTasksPage();
    renderBoardPage();
  }

  window.addEventListener('nexus:tasks-updated', renderAll);

  // Initial Run
  renderAll();
})();
