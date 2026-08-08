(function () {
  const DB_KEY = 'users';
  const SESSION_KEY = 'session';
  const VIEW_STATE_KEY = 'nexus-task-view-state';
  const helpers = window.AppHelpers || { escapeHTML: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  const api = window.NexusAPI;
  const esc = helpers.escapeHTML;

  const sessionEmail = sessionStorage.getItem(SESSION_KEY);
  let database = {};
  try {
    database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  } catch(e) {}
  
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
    ownershipScope: 'mine',
    sortBy: 'updatedAt',
    sortDirection: 'desc',
    label: 'All',
    currentPage: 1,
    itemsPerPage: 12
  };

  let orgUsers = [];

  const state = {
    currentUser: normalizeUser(currentUser, sessionEmail),
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
  const ownershipFilter = document.getElementById('taskOwnershipFilter');
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
  const taskProjectInput = document.getElementById('taskProject');
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

  /* ── Sync tasks and projects from To-Do_Board Backend API ── */
  async function syncFromBackend() {
    if (api && api.getUserData) {
      const data = await api.getUserData();
      if (data) {
        if (data.tasks) {
          const mappedTasks = data.tasks.map(bt => ({
            id: bt._id || bt.id,
            _id: bt._id,
            title: bt.title,
            description: bt.description || '',
            status: bt.status || 'Todo',
            priority: bt.priority || 'Medium',
            dueDate: bt.dueDate || '',
            dueTime: bt.dueTime || '',
            reminderDate: bt.reminderDate || '',
            reminderTime: bt.reminderTime || '',
            projectId: bt.projectId || null,
            labels: bt.labels || [],
            attachments: bt.attachments || [],
            version: bt.version || 1,
            assignedUserEmail: bt.assignedUserEmail || null,
            isOrgTask: Boolean(bt.isOrgTask),
            completedAt: bt.completedAt || null,
            assigneeName: bt.assignedUserEmail
              ? (bt.assignedUserEmail.split('@')[0])
              : (bt.assignedUser?.username || ''),
            userEmail: bt.userEmail || null,
            organizationId: bt.organizationId || null,
            createdAt: bt.createdAt || new Date().toISOString(),
            updatedAt: bt.updatedAt || new Date().toISOString()
          }));
          state.currentUser.tasks = mappedTasks;
        }
        if (data.projects) {
          state.currentUser.projects = data.projects;
        }
        
        // Fetch org users for assignee UI (admin + employee)
        if (state.currentUser.organizationId && api.fetchBackendOrgUsers) {
           orgUsers = await api.fetchBackendOrgUsers();
        }
        
        persistUser();
      }
    }
  }

  function isMyTask(task) {
    const email = (sessionEmail || '').toLowerCase();
    const assigned = (task.assignedUserEmail || '').toLowerCase();
    const owner = (task.userEmail || '').toLowerCase();
    if (assigned) return assigned === email;
    if (owner) return owner === email;
    return true;
  }

  function getVisibleTasks() {
    let taskList = Array.isArray(state.currentUser.tasks) ? state.currentUser.tasks.slice() : [];

    // Admin ownership scope: My tasks vs Employee tasks vs All
    if (state.currentUser.role === 'admin') {
      const scope = state.filters.ownershipScope || 'mine';
      if (scope === 'mine') {
        taskList = taskList.filter(isMyTask);
      } else if (scope === 'team') {
        taskList = taskList.filter((t) => !isMyTask(t));
      }
    }

    const filtered = helpers.filterTasks(taskList, state.filters, state.currentUser.projects || []);
    return sortTasks(filtered);
  }

  function sortTasks(tasks) {
    const sortKey = state.filters.sortBy || 'updatedAt';
    const sortDir = state.filters.sortDirection || 'desc';
    return helpers.sortTasks(tasks, sortKey, sortDir);
  }

  function getProjectName(projectId) {
    return state.currentUser.projects.find((p) => (p.id || p._id) === projectId)?.name || 'General';
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
    if (state.currentUser.role === 'admin' && state.filters.ownershipScope && state.filters.ownershipScope !== 'all') {
      const scopeLabel = state.filters.ownershipScope === 'team' ? 'Employee tasks' : 'My tasks';
      chips.push({ label: scopeLabel, value: 'ownershipScope' });
    }
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
        if (key === 'ownershipScope') state.filters.ownershipScope = 'all';
        else state.filters[key] = 'All';
        if (key === 'query') state.filters.query = '';
        if (ownershipFilter && key === 'ownershipScope') ownershipFilter.value = 'all';
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

    if (ownershipFilter) {
      if (state.currentUser.role === 'admin') {
        ownershipFilter.classList.remove('hidden');
        ownershipFilter.value = state.filters.ownershipScope || 'mine';
      } else {
        ownershipFilter.classList.add('hidden');
      }
    }

    if (sortSelect) {
      const targetVal = `${state.filters.sortBy}|${state.filters.sortDirection}`;
      if (sortSelect.querySelector(`option[value="${targetVal}"]`)) {
        sortSelect.value = targetVal;
      } else if (sortSelect.querySelector(`option[value="${state.filters.sortBy}"]`)) {
        sortSelect.value = state.filters.sortBy;
      }
    }
    
    // Populate Assignee Dropdown if Admin
    if (state.currentUser && state.currentUser.role === 'admin') {
      const assigneeList = document.getElementById('assigneeList');
      if (assigneeList && orgUsers.length > 0) {
        let optionsHTML = `<option value="">Myself (Unassigned)</option>`;
        optionsHTML += `<option value="ORG_TASK">Entire Organization</option>`;
        orgUsers.forEach(u => {
          optionsHTML += `<option value="${esc(u.email)}">${esc(u.name)} (${esc(u.email)})</option>`;
        });
        assigneeList.innerHTML = optionsHTML;
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
    
    paginationBar.classList.remove('hidden');
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
      if (paginationBar) paginationBar.classList.add('hidden');
      taskGroupsEl.innerHTML = '';
      return;
    }

    emptyStateEl?.classList.add('hidden');

    const groups = {
      Todo: paginatedTasks.filter((t) => getTaskStatusGroup(t) === 'Todo'),
      'In Progress': paginatedTasks.filter((t) => getTaskStatusGroup(t) === 'In Progress'),
      Done: paginatedTasks.filter((t) => getTaskStatusGroup(t) === 'Done')
    };

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    taskGroupsEl.innerHTML = Object.entries(groups).map(([label, groupTasks]) => {
      const renderedRows = groupTasks.length ? groupTasks.map((task) => {
        const labelsPills = (task.labels || []).map(l => `<span class="filter-chip" style="font-size:0.7rem;padding:0.1rem 0.4rem;">${esc(l)}</span>`).join(' ');
        
        let assigneeBadge = '';
        if (task.isOrgTask) {
          assigneeBadge = `<span class="org-badge badge-employee" style="font-size:0.72rem;">🌐 Org Task</span>`;
        } else if (task.assignedUserEmail) {
           const assignedUser = orgUsers.find(u => u.email === task.assignedUserEmail) || { name: task.assigneeName || task.assignedUserEmail.split('@')[0] };
           assigneeBadge = `<span class="org-badge badge-employee" style="font-size:0.72rem;">👤 ${esc(assignedUser.name)}</span>`;
        } else if (task.assigneeName) {
           assigneeBadge = `<span class="org-badge badge-employee" style="font-size:0.72rem;">👤 ${esc(task.assigneeName)}</span>`;
        }

        const canComplete = canModifyTask(task);
        const checkDisabled = !canComplete ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : '';

        return `
          <article class="task-row ${task.status === 'Done' ? 'is-complete' : ''}" data-task-id="${esc(task.id)}">
            <button class="task-check" type="button" data-toggle-task="${esc(task.id)}" aria-label="Mark ${esc(task.title)} complete" ${checkDisabled}>
              ${task.status === 'Done' ? '✓' : ''}
            </button>
            <div class="task-main">
              <div class="task-title-row">
                <strong>${esc(task.title)}</strong>
                <div class="task-pill-row">
                  ${assigneeBadge}
                  <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span>
                  <span class="status-pill ${helpers.getTaskStatusTone(task.status)}">${task.status}</span>
                </div>
              </div>
              <div class="task-meta">${esc(task.description || 'No description yet.')} ${labelsPills}</div>
            </div>
            <div class="task-side-meta">
              <div>${esc(getProjectName(task.projectId))}</div>
              <div>${helpers.formatDisplayDate(task.dueDate)}</div>
              <div class="task-row-actions">
                <button class="icon-btn" type="button" data-edit-task="${esc(task.id)}">✎</button>
                <button class="icon-btn" type="button" data-open-drawer="${esc(task.id)}">↗</button>
                <button class="icon-btn danger" type="button" data-delete-task="${esc(task.id)}">🗑</button>
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
            
            let assigneeBadge = '';
            if (task.isOrgTask) {
              assigneeBadge = `<span class="org-badge badge-employee" style="font-size:0.7rem;">🌐 Org Task</span>`;
            } else if (task.assignedUserEmail) {
               const assignedUser = orgUsers.find(u => u.email === task.assignedUserEmail) || { name: task.assigneeName || (task.assignedUserEmail || '').split('@')[0] };
               assigneeBadge = `<span class="org-badge badge-employee" style="font-size:0.7rem;">👤 ${esc((assignedUser.name || 'User').split(' ')[0])}</span>`;
            } else if (task.assigneeName) {
               assigneeBadge = `<span class="org-badge badge-employee" style="font-size:0.7rem;">👤 ${esc((task.assigneeName || 'User').split(' ')[0])}</span>`;
            }

            const canComplete = canModifyTask(task);
            const dragAttr = canComplete ? 'draggable="true"' : '';

            const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            return `
              <article class="board-card" ${dragAttr} data-task-id="${esc(task.id)}">
                <div class="board-card-top">
                  <strong>${esc(task.title)}</strong>
                  <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${esc(task.priority)}</span>
                </div>
                <p>${esc(task.description || 'No notes yet.')}</p>

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
                  ${assigneeBadge}
                  <div class="task-row-actions">
                    <button class="icon-btn" type="button" data-edit-task="${esc(task.id)}">✎</button>
                    <button class="icon-btn" type="button" data-open-drawer="${esc(task.id)}">↗</button>
                    <button class="icon-btn danger" type="button" data-delete-task="${esc(task.id)}">🗑</button>
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
        if (card.getAttribute('draggable') !== 'true') {
           event.preventDefault();
           return;
        }
        event.dataTransfer.setData('text/plain', card.dataset.taskId);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });

    boardColumnsEl.querySelectorAll('.board-column').forEach((column) => {
      column.addEventListener('dragover', (event) => event.preventDefault());
      column.addEventListener('dragenter', () => column.classList.add('is-drop-target'));
      column.addEventListener('dragleave', (event) => {
        if (!column.contains(event.relatedTarget)) {
          column.classList.remove('is-drop-target');
        }
      });
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
        if (e.target.closest('[data-edit-task]')) return;
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

    container.querySelectorAll('[data-edit-task]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskModal(btn.dataset.editTask);
      });
    });
  }

  function canModifyTask(task) {
    if (state.currentUser.role === 'admin') return true;
    if (task.isOrgTask) return true; // Anyone in org can mark it complete
    const currentUserEmail = (state.currentUser.email || '').toLowerCase();
    if (task.assignedUserEmail && task.assignedUserEmail.toLowerCase() === currentUserEmail) return true;
    if (!task.assignedUserEmail && !task.isOrgTask && (task.userEmail || '').toLowerCase() === currentUserEmail) return true;
    return false;
  }

  async function moveTaskToColumn(taskId, targetColumn) {
    const taskIdx = state.currentUser.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return;

    const task = state.currentUser.tasks[taskIdx];
    
    if (!canModifyTask(task)) {
       console.warn("Permission denied to modify this task");
       return;
    }

    task.status = targetColumn;
    task.updatedAt = new Date().toISOString();

    if (targetColumn === 'Done') {
      task.progress = 100;
      task.completedAt = new Date().toISOString();
    }

    persistUser();

    // Call Backend API update
    if (api && api.updateBackendTask && task._id) {
      try {
        await api.updateBackendTask(task._id, {
          status: targetColumn,
          version: task.version || 1
        });
      } catch (err) {
        console.warn('Backend task status update failed:', err);
      }
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
        <div><strong>Status</strong><span>${esc(task.status)}</span></div>
        <div><strong>Priority</strong><span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${esc(task.priority)}</span></div>
        <div><strong>Assignee</strong><span>${esc(task.assigneeName || 'Unassigned')}</span></div>
      </div>
    `;

    drawerEl.classList.add('is-open');
  }

  function closeDrawer() {
    drawerEl.classList.remove('is-open');
    state.activeDrawerTaskId = null;
  }

  function openTaskModal(taskIdToEdit = null) {
    if (taskProjectInput) {
      const projects = state.currentUser.projects || [];
      taskProjectInput.innerHTML = `
        <option value="">General (No Project)</option>
        ${projects.map(p => `<option value="${p.id || p._id}">${p.name}</option>`).join('')}
      `;
    }

    if (taskIdToEdit) {
      const task = state.currentUser.tasks.find((t) => t.id === taskIdToEdit);
      if (!task) return;
      taskIdInput.value = task.id;
      taskTitleInput.value = task.title;
      taskDescriptionInput.value = task.description || '';
      taskPriorityInput.value = task.priority || 'Medium';

      if (taskProjectInput) {
        taskProjectInput.value = task.projectId || '';
      }

      const assigneeInput = document.getElementById('taskAssignee');
      if (assigneeInput) {
        if (task.isOrgTask) {
          assigneeInput.value = 'ORG_TASK';
        } else if (task.assignedUserEmail) {
          assigneeInput.value = task.assignedUserEmail;
        } else {
          assigneeInput.value = '';
        }
      }

      taskDueDateInput.value = task.dueDate || '';
      if (document.getElementById('taskDueTime')) document.getElementById('taskDueTime').value = task.dueTime || '';
      if (document.getElementById('taskReminderDate')) document.getElementById('taskReminderDate').value = task.reminderDate || '';
      if (document.getElementById('taskReminderTime')) document.getElementById('taskReminderTime').value = task.reminderTime || '';
      if (taskRecurringInput) taskRecurringInput.value = task.recurring || 'none';
      taskStatusInput.value = task.status || 'Todo';
      taskModalTitle.textContent = 'Edit task';
      taskSubmitButton.textContent = 'Save changes';
    } else {
      taskForm.reset();
      taskIdInput.value = '';
      if (document.getElementById('taskDueTime')) document.getElementById('taskDueTime').value = '';
      if (document.getElementById('taskReminderDate')) document.getElementById('taskReminderDate').value = '';
      if (document.getElementById('taskReminderTime')) document.getElementById('taskReminderTime').value = '';
      if (taskRecurringInput) taskRecurringInput.value = 'none';
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

  if (taskForm) {
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
    const projectId = taskProjectInput?.value || null;
    
    const assigneeSelectValue = document.getElementById('taskAssignee')?.value || '';
    let isOrgTask = false;
    let assignedUserEmail = null;
    if (assigneeSelectValue === 'ORG_TASK') {
       isOrgTask = true;
    } else if (assigneeSelectValue) {
       assignedUserEmail = assigneeSelectValue;
    }

    const labelsStr = taskLabelsInput?.value.trim() || '';
    const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()).filter(Boolean) : [];

      let attachments = [];
      const existingTask = editingId ? state.currentUser.tasks.find(t => t.id === editingId) : null;
      if (taskAttachmentsInput) {
        if (taskAttachmentsInput.type === 'file' && taskAttachmentsInput.files && taskAttachmentsInput.files.length > 0) {
          attachments = Array.from(taskAttachmentsInput.files).map(f => f.name);
        } else if (existingTask && existingTask.attachments) {
          attachments = existingTask.attachments;
        } else {
          const attStr = taskAttachmentsInput.value.trim();
          attachments = attStr ? attStr.split(',').map(a => a.trim()).filter(Boolean) : [];
        }
      }

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
        task.projectId = projectId;
        task.labels = labels;
        task.attachments = attachments;
        if (state.currentUser.role === 'admin') {
           task.isOrgTask = isOrgTask;
           task.assignedUserEmail = assignedUserEmail;
        }
        task.updatedAt = new Date().toISOString();

        if (api && api.updateBackendTask && task._id) {
          try {
            await api.updateBackendTask(task._id, { 
              title, description, priority, status, dueDate, dueTime, reminderDate, reminderTime, projectId,
              isOrgTask: task.isOrgTask, assignedUserEmail: task.assignedUserEmail, labels, attachments
            });
          } catch (err) {
            console.warn('Backend task update failed:', err);
          }
        }
      }
    } else {
      // Backend API Create
      let createdTask = null;
      if (api && api.createBackendTask) {
        try {
          createdTask = await api.createBackendTask({ 
            title, description, priority, dueDate, dueTime, reminderDate, reminderTime, status, projectId,
            isOrgTask, assignedUserEmail, labels, attachments
          });
        } catch (err) {
          console.warn('Backend task creation failed:', err);
        }
      }

      const newTask = {
        id: createdTask?._id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        _id: createdTask?._id,
        title,
        description,
        projectId,
        labels,
        attachments,
        assigneeName: assignedUserEmail
          ? assignedUserEmail.split('@')[0]
          : (createdTask?.assignedUser?.username || currentUser.name),
        assignedUserEmail: assignedUserEmail || createdTask?.assignedUserEmail || null,
        isOrgTask: Boolean(isOrgTask || createdTask?.isOrgTask),
        completedAt: (status === 'Done') ? (createdTask?.completedAt || new Date().toISOString()) : null,
        priority,
        dueDate,
        dueTime,
        reminderDate,
        reminderTime,
        status,
        createdAt: createdTask?.createdAt || new Date().toISOString(),
        updatedAt: createdTask?.updatedAt || new Date().toISOString()
      };

      state.currentUser.tasks.unshift(newTask);
    }

      persistUser();
      closeTaskModal();
      renderAll();
    });
  }

  if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener('click', async () => {
      if (!state.pendingDeleteTaskId) return;
      const taskId = state.pendingDeleteTaskId;
      const taskToDelete = state.currentUser.tasks.find(t => t.id === taskId);
      const backendId = taskToDelete ? (taskToDelete._id || taskToDelete.id) : taskId;
      
      state.currentUser.tasks = state.currentUser.tasks.filter(t => t.id !== taskId);

      if (api && api.deleteBackendTask) {
        try {
          await api.deleteBackendTask(backendId);
        } catch (err) {
          console.warn('Backend task deletion failed:', err);
        }
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

  if (ownershipFilter) {
    ownershipFilter.addEventListener('change', (e) => {
      state.filters.ownershipScope = e.target.value || 'mine';
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
  }).catch((err) => {
    console.warn('Task sync failed:', err);
    renderAll();
  });

  /* ── Board Background ── */
  (function setupBoardBackground() {
    const changeBoardBgBtn = document.getElementById('changeBoardBgBtn');
    const boardBgModal = document.getElementById('boardBgModal');
    const closeBoardBgModal = document.getElementById('closeBoardBgModal');
    if (!changeBoardBgBtn || !boardBgModal) return;

    function applyBoardBackground(bgVal) {
      const boardEl = document.getElementById('boardColumns');
      const panel = boardEl ? boardEl.closest('.page-panel') : document.querySelector('.page-panel');
      const shell = document.querySelector('.app-shell');

      if (!bgVal || bgVal === 'none') {
        document.body.classList.remove('has-board-bg');
        document.body.style.background = '';
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundAttachment = '';
        document.body.style.backgroundRepeat = '';
        if (shell) shell.style.background = '';
        if (panel) {
          panel.style.background = '';
          panel.style.backdropFilter = '';
        }
        if (boardEl) {
          boardEl.classList.remove('has-bg');
          boardEl.style.background = '';
          boardEl.style.backgroundImage = '';
        }
        return;
      }

      document.body.classList.add('has-board-bg');
      document.body.style.background = bgVal;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundRepeat = 'no-repeat';

      if (shell) shell.style.background = 'transparent';
      if (panel) {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        panel.style.background = dark ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)';
        panel.style.backdropFilter = 'blur(10px)';
      }
      if (boardEl) {
        boardEl.classList.add('has-bg');
        boardEl.style.background = bgVal;
        boardEl.style.backgroundSize = 'cover';
        boardEl.style.backgroundPosition = 'center';
      }
    }

    function openBoardBgModal() {
      boardBgModal.classList.remove('hidden');
      boardBgModal.classList.add('is-open');
      boardBgModal.style.display = 'flex';
    }

    function closeBoardBgModalFn() {
      boardBgModal.classList.add('hidden');
      boardBgModal.classList.remove('is-open');
      boardBgModal.style.display = '';
    }

    // The preference lives on the user record so it follows them across devices.
    if (api && api.refreshMe) {
      api.refreshMe()
        .then((user) => { if (user && user.boardBg) applyBoardBackground(user.boardBg); })
        .catch(() => {});
    }

    changeBoardBgBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBoardBgModal();
    });

    if (closeBoardBgModal) {
      closeBoardBgModal.addEventListener('click', (e) => {
        e.preventDefault();
        closeBoardBgModalFn();
      });
    }

    boardBgModal.addEventListener('click', (e) => {
      if (e.target === boardBgModal) {
        closeBoardBgModalFn();
        return;
      }
      const option = e.target.closest('.bg-option');
      if (!option) return;
      const bgVal = option.getAttribute('data-bg-value') || 'none';
      applyBoardBackground(bgVal);
      if (state.currentUser) {
        state.currentUser.boardBg = bgVal;
        persistUser();
      }
      if (api && api.updateProfile) {
        api.updateProfile({ boardBg: bgVal }).catch(() => {});
      }
      closeBoardBgModalFn();
    });
  })();
})();
