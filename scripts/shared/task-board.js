(function () {
  const DB_KEY = 'users';
  const SESSION_KEY = 'session';
  const VIEW_STATE_KEY = 'nexus-task-view-state';
  const helpers = window.AppHelpers;

  const sessionEmail = localStorage.getItem(SESSION_KEY);
  const database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const currentUser = sessionEmail ? database[sessionEmail] : null;

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
    label: 'All'
  };

  const state = {
    currentUser,
    selectedProjectId: currentUser.projects?.[0]?.id || null,
    filters: loadViewState(),
    pendingDeleteTaskId: null
  };

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
  const modalEl = document.getElementById('taskModal');
  const deleteModalEl = document.getElementById('deleteModal');
  const addTaskButton = document.getElementById('addTask');
  const closeModalButton = document.getElementById('closeTaskModal');
  const cancelModalButton = document.getElementById('cancelTaskModal');
  const closeDrawerButton = document.getElementById('closeDrawer');
  const deleteConfirmButton = document.getElementById('confirmDeleteTask');
  const deleteCancelButton = document.getElementById('cancelDeleteTask');
  const taskForm = document.getElementById('taskForm');
  const taskIdInput = document.getElementById('taskId');
  const taskTitleInput = document.getElementById('taskTitle');
  const taskDescriptionInput = document.getElementById('taskDescription');
  const taskPriorityInput = document.getElementById('taskPriority');
  const taskDueDateInput = document.getElementById('taskDueDate');
  const taskStatusInput = document.getElementById('taskStatus');
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

  function persistUser() {
    database[sessionEmail] = state.currentUser;
    localStorage.setItem(DB_KEY, JSON.stringify(database));
    saveViewState();
  }

  function pushActivity(message) {
    state.currentUser.activity = [
      { id: `activity-${Date.now()}`, message, createdAt: new Date().toISOString() },
      ...(state.currentUser.activity || [])
    ].slice(0, 6);
    persistUser();
  }

  function getVisibleTasks() {
    const visibleProjects = state.currentUser.tasks.filter((task) => {
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
      const priorityRank = (value) => ({ High: 3, Medium: 2, Low: 1 })[value] || 0;

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
    return state.currentUser.projects.find((project) => project.id === projectId)?.name || 'No project';
  }

  function getTaskStatusGroup(task) {
    if (task.status === 'Done') return 'Done';
    if (task.status === 'In Progress') return 'In Progress';
    return 'Todo';
  }

  function formatDueState(task) {
    if (!task.dueDate) return 'No deadline';
    const dueState = helpers.getTaskDueState(task);
    if (dueState === 'overdue') return 'Overdue';
    if (dueState === 'soon') return 'Due soon';
    return 'Scheduled';
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
  }

  function renderFilterOptions() {
    const projects = state.currentUser.projects || [];
    if (projectFilter) {
      projectFilter.innerHTML = `<option value="All">All projects</option>${projects.map((project) => `<option value="${project.id}" ${state.filters.project === project.id ? 'selected' : ''}>${project.name}</option>`).join('')}`;
    }

    const labels = Array.from(new Set((state.currentUser.tasks || []).flatMap((task) => task.labels || [])));
    if (labelFilter) {
      labelFilter.innerHTML = `<option value="All">All labels</option>${labels.map((label) => `<option value="${label}" ${state.filters.label === label ? 'selected' : ''}>${label}</option>`).join('')}`;
    }
  }

  function renderTasksPage() {
    if (!taskGroupsEl) return;
    const tasks = getVisibleTasks();
    const groups = {
      Todo: tasks.filter((task) => getTaskStatusGroup(task) === 'Todo'),
      'In Progress': tasks.filter((task) => getTaskStatusGroup(task) === 'In Progress'),
      Done: tasks.filter((task) => getTaskStatusGroup(task) === 'Done')
    };

    if (!tasks.length && emptyStateEl) {
      taskGroupsEl.innerHTML = '';
      emptyStateEl.classList.remove('hidden');
      return;
    }

    emptyStateEl?.classList.add('hidden');
    taskGroupsEl.innerHTML = Object.entries(groups).map(([label, groupTasks]) => {
      const renderedRows = groupTasks.length ? groupTasks.map((task) => `
        <article class="task-row ${task.status === 'Done' ? 'is-complete' : ''}" data-task-id="${task.id}">
          <button class="task-check" type="button" data-toggle-task="${task.id}" aria-label="Mark ${task.title} complete">
            ${task.status === 'Done' ? '✓' : ''}
          </button>
          <div class="task-main">
            <div class="task-title-row">
              <strong>${task.title}</strong>
              <div class="task-pill-row">
                <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span>
                <span class="status-pill ${helpers.getTaskStatusTone(task.status)}">${task.status}</span>
              </div>
            </div>
            <div class="task-meta">${task.description || 'No description yet.'}</div>
          </div>
          <div class="task-side-meta">
            <div>${getProjectName(task.projectId)}</div>
            <div>${helpers.formatDisplayDate(task.dueDate)}</div>
            <div class="task-row-actions">
              <button class="icon-btn" type="button" data-open-drawer="${task.id}" aria-label="Open details for ${task.title}">↗</button>
              <button class="icon-btn danger" type="button" data-delete-task="${task.id}" aria-label="Delete ${task.title}">🗑</button>
            </div>
          </div>
        </article>
      `).join('') : '<div class="empty-inline">No tasks in this section.</div>';

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

    taskGroupsEl.querySelectorAll('[data-task-id]').forEach((row) => {
      row.addEventListener('click', (event) => {
        const taskId = row.dataset.taskId;
        if (event.target.closest('[data-toggle-task]')) return;
        if (event.target.closest('[data-delete-task]')) return;
        if (event.target.closest('[data-open-drawer]')) return;
        openDrawer(taskId);
      });
    });

    taskGroupsEl.querySelectorAll('[data-toggle-task]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleTaskComplete(button.dataset.toggleTask);
      });
    });

    taskGroupsEl.querySelectorAll('[data-delete-task]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openDeleteModal(button.dataset.deleteTask);
      });
    });

    taskGroupsEl.querySelectorAll('[data-open-drawer]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openDrawer(button.dataset.openDrawer);
      });
    });
  }

  function renderBoardPage() {
    if (!boardColumnsEl) return;
    const tasks = getVisibleTasks();
    const columns = {
      Todo: tasks.filter((task) => task.status === 'Todo'),
      'In Progress': tasks.filter((task) => task.status === 'In Progress'),
      Done: tasks.filter((task) => task.status === 'Done')
    };

    const headings = Object.entries(columns).map(([name, columnTasks]) => `
      <section class="board-column" data-column-name="${name}">
        <div class="board-column-header">
          <div>
            <h3>${name}</h3>
            <p>${columnTasks.length} task${columnTasks.length === 1 ? '' : 's'}</p>
          </div>
          <span class="status-pill ${name === 'Done' ? 'status-done' : name === 'In Progress' ? 'status-progress' : 'status-todo'}">${columnTasks.length}</span>
        </div>
        <div class="board-card-list">
          ${columnTasks.length ? columnTasks.map((task) => `
            <article class="board-card" draggable="true" data-task-id="${task.id}">
              <div class="board-card-top">
                <strong>${task.title}</strong>
                <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span>
              </div>
              <p>${task.description || 'No notes yet.'}</p>
              <div class="board-card-foot">
                <span>${helpers.formatDisplayDate(task.dueDate)}</span>
                <div class="task-row-actions">
                  <button class="icon-btn" type="button" data-open-drawer="${task.id}">↗</button>
                  <button class="icon-btn danger" type="button" data-delete-task="${task.id}">🗑</button>
                </div>
              </div>
            </article>
          `).join('') : '<div class="empty-inline">No tasks here yet.</div>'}
        </div>
      </section>
    `).join('');

    boardColumnsEl.innerHTML = headings;

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

    boardColumnsEl.querySelectorAll('[data-open-drawer]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openDrawer(button.dataset.openDrawer);
      });
    });

    boardColumnsEl.querySelectorAll('[data-delete-task]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openDeleteModal(button.dataset.deleteTask);
      });
    });
  }

  function openDrawer(taskId) {
    const task = state.currentUser.tasks.find((item) => item.id === taskId);
    if (!task) return;

    drawerTitleEl.textContent = task.title;
    drawerMetaEl.textContent = `${getProjectName(task.projectId)} • ${helpers.formatDisplayDate(task.dueDate)} • ${task.priority}`;
    drawerDescriptionEl.textContent = task.description || 'No description added yet.';
    drawerDetailsEl.innerHTML = `
      <div><strong>Status</strong><span>${task.status}</span></div>
      <div><strong>Labels</strong><span>${(task.labels || []).join(', ') || 'None'}</span></div>
      <div><strong>Attachments</strong><span>${(task.attachments || []).join(', ') || 'No attachments'}</span></div>
      <div><strong>Due state</strong><span>${formatDueState(task)}</span></div>
    `;
    drawerEl.classList.add('is-open');
  }

  function closeDrawer() {
    drawerEl.classList.remove('is-open');
  }

  function resetTaskForm() {
    taskIdInput.value = '';
    taskTitleInput.value = '';
    taskDescriptionInput.value = '';
    taskPriorityInput.value = 'Medium';
    taskDueDateInput.value = '';
    taskStatusInput.value = 'Todo';
    taskAttachmentsInput.value = '';
    taskModalTitle.textContent = 'Create task';
    taskSubmitButton.textContent = 'Create task';
  }

  function openTaskModal(taskId = null) {
    resetTaskForm();
    if (taskId) {
      const task = state.currentUser.tasks.find((item) => item.id === taskId);
      if (!task) return;
      taskIdInput.value = task.id;
      taskTitleInput.value = task.title;
      taskDescriptionInput.value = task.description || '';
      taskPriorityInput.value = task.priority || 'Medium';
      taskDueDateInput.value = task.dueDate || '';
      taskStatusInput.value = task.status || 'Todo';
      taskAttachmentsInput.value = (task.attachments || []).join(', ');
      taskModalTitle.textContent = 'Edit task';
      taskSubmitButton.textContent = 'Save task';
    }
    modalEl.classList.remove('hidden');
    taskTitleInput.focus();
  }

  function closeTaskModal() {
    modalEl.classList.add('hidden');
    resetTaskForm();
  }

  function openDeleteModal(taskId) {
    state.pendingDeleteTaskId = taskId;
    deleteModalEl.classList.remove('hidden');
  }

  function closeDeleteModal() {
    state.pendingDeleteTaskId = null;
    deleteModalEl.classList.add('hidden');
  }

  function saveTaskFromForm(event) {
    event.preventDefault();
    const title = taskTitleInput.value.trim();
    if (!title) return;

    const taskId = taskIdInput.value;
    const taskPayload = {
      title,
      description: taskDescriptionInput.value.trim(),
      priority: taskPriorityInput.value,
      dueDate: taskDueDateInput.value,
      status: taskStatusInput.value,
      attachments: taskAttachmentsInput.value.split(',').map((item) => item.trim()).filter(Boolean)
    };

    if (taskId) {
      const task = state.currentUser.tasks.find((item) => item.id === taskId);
      if (task) {
        Object.assign(task, taskPayload, { updatedAt: new Date().toISOString() });
        if (task.status === 'Done' && !task.completedAt) task.completedAt = new Date().toISOString();
      }
      pushActivity(`Updated task ${title}.`);
    } else {
      state.currentUser.tasks.unshift({
        id: `task-${Date.now()}`,
        ...taskPayload,
        projectId: state.selectedProjectId || state.currentUser.projects?.[0]?.id || null,
        labels: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      pushActivity(`Created task ${title}.`);
    }

    persistUser();
    render();
    closeTaskModal();
  }

  function toggleTaskComplete(taskId) {
    const task = state.currentUser.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.status = task.status === 'Done' ? 'Todo' : 'Done';
    if (task.status === 'Done' && !task.completedAt) task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    persistUser();
    render();
    pushActivity(`Updated task ${task.title}.`);
  }

  function moveTaskToColumn(taskId, targetStatus) {
    const task = state.currentUser.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.status = targetStatus;
    if (targetStatus === 'Done' && !task.completedAt) task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    persistUser();
    render();
    pushActivity(`Moved ${task.title} to ${targetStatus}.`);
  }

  function deleteTask(taskId) {
    state.currentUser.tasks = state.currentUser.tasks.filter((task) => task.id !== taskId);
    persistUser();
    render();
    closeDeleteModal();
    pushActivity('Deleted a task.');
  }

  function handleFilterChange() {
    state.filters.query = searchInput?.value || '';
    state.filters.priority = priorityFilter?.value || 'All';
    state.filters.status = statusFilter?.value || 'All';
    state.filters.project = projectFilter?.value || 'All';
    state.filters.label = labelFilter?.value || 'All';
    state.filters.dueRange = dueFilter?.value || 'All';
    if (sortSelect) {
      const [sortBy, sortDirection] = sortSelect.value.split('|');
      state.filters.sortBy = sortBy;
      state.filters.sortDirection = sortDirection;
    }
    persistUser();
    render();
  }

  function render() {
    renderFilterOptions();
    renderFilterChips();
    if (taskGroupsEl) renderTasksPage();
    if (boardColumnsEl) renderBoardPage();
  }

  function bindEvents() {
    searchInput?.addEventListener('input', handleFilterChange);
    [priorityFilter, statusFilter, projectFilter, labelFilter, dueFilter, sortSelect].forEach((element) => {
      element?.addEventListener('change', handleFilterChange);
    });

    addTaskButton?.addEventListener('click', () => openTaskModal());
    closeModalButton?.addEventListener('click', closeTaskModal);
    cancelModalButton?.addEventListener('click', closeTaskModal);
    modalEl?.addEventListener('click', (event) => {
      if (event.target === modalEl) closeTaskModal();
    });
    deleteModalEl?.addEventListener('click', (event) => {
      if (event.target === deleteModalEl) closeDeleteModal();
    });
    deleteConfirmButton?.addEventListener('click', () => deleteTask(state.pendingDeleteTaskId));
    deleteCancelButton?.addEventListener('click', closeDeleteModal);
    taskForm?.addEventListener('submit', saveTaskFromForm);
    closeDrawerButton?.addEventListener('click', closeDrawer);
    drawerEl?.addEventListener('click', (event) => {
      if (event.target === drawerEl) closeDrawer();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeTaskModal();
        closeDeleteModal();
        closeDrawer();
      }
    });

    filterChipsEl?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-clear-filter]');
      if (!button) return;
      const value = button.dataset.clearFilter;
      if (value === 'query') state.filters.query = '';
      if (value === 'priority') state.filters.priority = 'All';
      if (value === 'status') state.filters.status = 'All';
      if (value === 'project') state.filters.project = 'All';
      if (value === 'label') state.filters.label = 'All';
      if (value === 'dueRange') state.filters.dueRange = 'All';
      persistUser();
      render();
    });
  }

  function init() {
    if (searchInput) searchInput.value = state.filters.query;
    if (sortSelect) {
      sortSelect.value = `${state.filters.sortBy}|${state.filters.sortDirection}`;
    }
    if (priorityFilter) priorityFilter.value = state.filters.priority;
    if (statusFilter) statusFilter.value = state.filters.status;
    if (projectFilter) projectFilter.value = state.filters.project;
    if (labelFilter) labelFilter.value = state.filters.label;
    if (dueFilter) dueFilter.value = state.filters.dueRange;
    bindEvents();
    render();
  }

  init();
})();
