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

  /* ── Sync tasks from To-Do_Board Backend API ── */
  async function syncFromBackend() {
    if (api && api.fetchBackendTasks) {
      const backendTasks = await api.fetchBackendTasks();
      if (backendTasks && Array.isArray(backendTasks)) {
        const mapped = backendTasks.map(bt => ({
          id: bt._id || bt.id,
          _id: bt._id,
          title: bt.title,
          description: bt.description || '',
          status: bt.status || 'Todo',
          priority: bt.priority || 'Medium',
          version: bt.version || 1,
          assigneeName: bt.assignedUser?.username || '',
          createdAt: bt.createdAt || new Date().toISOString(),
          updatedAt: bt.updatedAt || new Date().toISOString()
        }));
        
        // Merge backend tasks
        if (mapped.length > 0) {
          state.currentUser.tasks = mapped;
          persistUser();
        }
      }
    }
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
    const filtered = helpers.filterTasks(taskList, state.filters, state.currentUser.projects || []);
    return sortTasks(filtered);
  }

  function sortTasks(tasks) {
    let sortBy = state.filters.sortBy || 'updatedAt';
    let sortDirection = state.filters.sortDirection || 'desc';

    if (sortBy.includes('|')) {
      const parts = sortBy.split('|');
      sortBy = parts[0];
      sortDirection = parts[1];
    }

    const isAsc = sortDirection === 'asc';

    return [...tasks].sort((left, right) => {
      if (sortBy === 'priority') {
        const priorityRank = (val) => ({ Urgent: 4, High: 3, Medium: 2, Low: 1 })[val] || 0;
        const diff = priorityRank(left.priority) - priorityRank(right.priority);
        return isAsc ? diff : -diff;
      }

      if (sortBy === 'deadline' || sortBy === 'dueDate') {
        const leftDate = left.dueDate ? new Date(left.dueDate).getTime() : (isAsc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        const rightDate = right.dueDate ? new Date(right.dueDate).getTime() : (isAsc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        const diff = leftDate - rightDate;
        return isAsc ? diff : -diff;
      }

      if (sortBy === 'title') {
        const diff = (left.title || '').localeCompare(right.title || '');
        return isAsc ? diff : -diff;
      }

      if (sortBy === 'updatedAt' || sortBy === 'createdAt') {
        const leftVal = new Date(left.updatedAt || left.createdAt || 0).getTime();
        const rightVal = new Date(right.updatedAt || right.createdAt || 0).getTime();
        const diff = leftVal - rightVal;
        return isAsc ? diff : -diff;
      }

      return 0;
    });
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

    if (sortSelect) {
      const targetVal = `${state.filters.sortBy}|${state.filters.sortDirection}`;
      if (sortSelect.querySelector(`option[value="${targetVal}"]`)) {
        sortSelect.value = targetVal;
      } else if (sortSelect.querySelector(`option[value="${state.filters.sortBy}"]`)) {
        sortSelect.value = state.filters.sortBy;
      }
    }
  }

  function renderPagination(totalItems) {
    if (!paginationBar) return;

    const itemsPerPage = state.filters.itemsPerPage || 12;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    if (state.filters.currentPage > totalPages) {
      state.filters.currentPage = totalPages;
    }

    const startItem = totalItems === 0 ? 0 : (state.filters.currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(totalItems, state.filters.currentPage * itemsPerPage);

    if (paginationItemRange) paginationItemRange.textContent = `${startItem}-${endItem}`;
    if (paginationTotalItems) paginationTotalItems.textContent = totalItems;
    if (currentPageIndicator) currentPageIndicator.textContent = `Page ${state.filters.currentPage} of ${totalPages}`;

    if (prevPageBtn) prevPageBtn.disabled = state.filters.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = state.filters.currentPage >= totalPages;
  }

  function getPaginatedTasks(tasks) {
    const itemsPerPage = state.filters.itemsPerPage || 12;
    const startIndex = (state.filters.currentPage - 1) * itemsPerPage;
    return tasks.slice(startIndex, startIndex + itemsPerPage);
  }

  function renderTasksPage() {
    if (!taskGroupsEl) return;
    const allVisible = getVisibleTasks();

    renderPagination(allVisible.length);
    const paginatedTasks = getPaginatedTasks(allVisible);

    if (!allVisible.length) {
      emptyStateEl?.classList.remove('hidden');
      taskGroupsEl.innerHTML = '';
      return;
    }

    emptyStateEl?.classList.add('hidden');

    const groups = {
      Todo: paginatedTasks.filter((t) => getTaskStatusGroup(t) === 'Todo'),
      'In Progress': paginatedTasks.filter((t) => getTaskStatusGroup(t) === 'In Progress'),
      Done: paginatedTasks.filter((t) => getTaskStatusGroup(t) === 'Done')
    };

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
                <strong>${task.title}</strong>
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

  async function moveTaskToColumn(taskId, targetColumn) {
    const taskIdx = state.currentUser.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return;

    const task = state.currentUser.tasks[taskIdx];
    task.status = targetColumn;
    task.updatedAt = new Date().toISOString();

    if (targetColumn === 'Done') {
      task.progress = 100;
      task.completedAt = new Date().toISOString();
    }

    persistUser();

    // Call Backend API update
    if (api && api.updateBackendTask && task._id) {
      await api.updateBackendTask(task._id, {
        status: targetColumn,
        version: task.version || 1
      });
    }

    renderAll();
  }

  function toggleTaskComplete(taskId) {
    const task = state.currentUser.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === 'Done' ? 'Todo' : 'Done';
    moveTaskToColumn(taskId, newStatus);
  }

  function openDrawer(taskId) {
    const task = state.currentUser.tasks.find((t) => t.id === taskId);
    if (!task) return;

    state.activeDrawerTaskId = taskId;

    drawerTitleEl.textContent = task.title;
    drawerMetaEl.textContent = `${getProjectName(task.projectId)} • ${helpers.formatDisplayDate(task.dueDate)} • ${task.priority}`;
    drawerDescriptionEl.textContent = task.description || 'No description added yet.';

    drawerDetailsEl.innerHTML = `
      <div style="flex-direction:column;align-items:stretch;gap:0.75rem;">
        <div><strong>Status</strong><span>${task.status}</span></div>
        <div><strong>Priority</strong><span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span></div>
        <div><strong>Assignee</strong><span>${task.assigneeName || 'Unassigned'}</span></div>
      </div>
    `;

    drawerEl.classList.add('is-open');
  }

  function closeDrawer() {
    drawerEl.classList.remove('is-open');
    state.activeDrawerTaskId = null;
  }

  function openTaskModal(taskIdToEdit = null) {
    if (taskIdToEdit) {
      const task = state.currentUser.tasks.find((t) => t.id === taskIdToEdit);
      if (!task) return;
      taskIdInput.value = task.id;
      taskTitleInput.value = task.title;
      taskDescriptionInput.value = task.description || '';
      taskPriorityInput.value = task.priority || 'Medium';
      taskDueDateInput.value = task.dueDate || '';
      if (document.getElementById('taskDueTime')) document.getElementById('taskDueTime').value = task.dueTime || '';
      if (document.getElementById('taskReminderDate')) document.getElementById('taskReminderDate').value = task.reminderDate || '';
      if (document.getElementById('taskReminderTime')) document.getElementById('taskReminderTime').value = task.reminderTime || '';
      taskStatusInput.value = task.status || 'Todo';
      taskModalTitle.textContent = 'Edit task';
      taskSubmitButton.textContent = 'Save changes';
    } else {
      taskForm.reset();
      taskIdInput.value = '';
      if (document.getElementById('taskDueTime')) document.getElementById('taskDueTime').value = '';
      if (document.getElementById('taskReminderDate')) document.getElementById('taskReminderDate').value = '';
      if (document.getElementById('taskReminderTime')) document.getElementById('taskReminderTime').value = '';
      taskModalTitle.textContent = 'Create task';
      taskSubmitButton.textContent = 'Create task';
    }
    modalEl.classList.remove('hidden');
  }

  function closeTaskModal() {
    modalEl.classList.add('hidden');
    taskForm.reset();
    if (window.NexusDateTimePicker && window.NexusDateTimePicker.resetForm) {
      window.NexusDateTimePicker.resetForm(taskForm);
    }
  }

  function openDeleteModal(taskId) {
    state.pendingDeleteTaskId = taskId;
    deleteModalEl.classList.remove('hidden');
  }

  function closeDeleteModal() {
    deleteModalEl.classList.add('hidden');
    state.pendingDeleteTaskId = null;
  }

  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editingId = taskIdInput.value;
    const title = taskTitleInput.value.trim();
    const description = taskDescriptionInput.value.trim();
    const priority = taskPriorityInput.value;
    const dueDate = taskDueDateInput.value;
    const dueTime = document.getElementById('taskDueTime')?.value || '';
    const reminderDate = document.getElementById('taskReminderDate')?.value || '';
    const reminderTime = document.getElementById('taskReminderTime')?.value || '';
    const status = taskStatusInput.value;

    if (editingId) {
      const idx = state.currentUser.tasks.findIndex(t => t.id === editingId);
      if (idx !== -1) {
        const task = state.currentUser.tasks[idx];
        task.title = title;
        task.description = description;
        task.priority = priority;
        task.dueDate = dueDate;
        task.dueTime = dueTime;
        task.reminderDate = reminderDate;
        task.reminderTime = reminderTime;
        task.status = status;
        task.updatedAt = new Date().toISOString();

        if (api && api.updateBackendTask && task._id) {
          await api.updateBackendTask(task._id, { title, description, priority, status });
        }
      }
    } else {
      // Backend API Create
      let createdTask = null;
      if (api && api.createBackendTask) {
        createdTask = await api.createBackendTask({ title, description, priority });
      }

      const newTask = {
        id: createdTask?._id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        _id: createdTask?._id,
        title,
        description,
        assigneeName: createdTask?.assignedUser?.username || currentUser.name,
        priority,
        dueDate,
        dueTime,
        reminderDate,
        reminderTime,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      state.currentUser.tasks.unshift(newTask);
    }

    persistUser();
    closeTaskModal();
    renderAll();
  });

  if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener('click', async () => {
      if (!state.pendingDeleteTaskId) return;
      const taskId = state.pendingDeleteTaskId;
      state.currentUser.tasks = state.currentUser.tasks.filter(t => t.id !== taskId);

      if (api && api.deleteBackendTask) {
        await api.deleteBackendTask(taskId);
      }

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
      const val = e.target.value;
      if (val.includes('|')) {
        const parts = val.split('|');
        state.filters.sortBy = parts[0];
        state.filters.sortDirection = parts[1];
      } else {
        state.filters.sortBy = val;
      }
      state.filters.currentPage = 1;
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
  syncFromBackend().then(() => {
    renderAll();
  });
})();
