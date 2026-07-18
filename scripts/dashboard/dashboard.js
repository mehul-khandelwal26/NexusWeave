const DB_KEY = 'users';
const SESSION_KEY = 'session';
const JWT_KEY = 'jwt';
const PROVIDER_KEY = 'authProvider';
const helpers = window.AppHelpers;

let state = null;
const sessionEmail = localStorage.getItem(SESSION_KEY);
let database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
const storedTheme = localStorage.getItem('nexus-theme') || 'light';

function normalizeUser(user, fallbackEmail = sessionEmail) {
  const resolvedEmail = fallbackEmail || user?.email || 'demo@nexusweave.app';
  return {
    ...(user || {}),
    email: resolvedEmail,
    theme: user?.theme || localStorage.getItem('nexus-theme') || storedTheme || 'light',
    projects: Array.isArray(user?.projects) ? user.projects : [],
    tasks: Array.isArray(user?.tasks) ? user.tasks : [],
    activity: Array.isArray(user?.activity) ? user.activity : []
  };
}

function notifyTaskSync() {
  window.dispatchEvent(new CustomEvent('nexus:tasks-updated'));
}

let currentUser = sessionEmail ? normalizeUser(database[sessionEmail], sessionEmail) : null;

if (!currentUser) {
  const demoEmail = 'demo@nexusweave.app';
  currentUser = normalizeUser({
    email: demoEmail,
    password: 'demo123',
    theme: storedTheme,
    projects: [],
    tasks: [],
    activity: [],
    createdAt: Date.now()
  }, demoEmail);
  database[demoEmail] = currentUser;
  localStorage.setItem(DB_KEY, JSON.stringify(database));
  localStorage.setItem(SESSION_KEY, demoEmail);
}

const welcomeText = document.getElementById('welcomeText');
const projectCount = document.getElementById('projectCount');
const taskCount = document.getElementById('taskCount');
const doneCount = document.getElementById('doneCount');
const overdueCount = document.getElementById('overdueCount');
const completionRate = document.getElementById('completionRate');
const projectsContainer = document.getElementById('projects');
const taskBoard = document.getElementById('taskBoard');
const alertBox = document.getElementById('alertBox');
const heatmap = document.getElementById('heatmap');
const activityFeed = document.getElementById('activityFeed');
const themeToggle = document.querySelector('[data-theme-toggle]');
const searchInput = document.getElementById('taskSearch');
const dashboardSearchInput = document.getElementById('dashboardTaskSearch');
const priorityFilter = document.getElementById('priorityFilter');
const statusFilter = document.getElementById('statusFilter');
const projectFilter = document.getElementById('projectFilter');
const dueFilter = document.getElementById('dueFilter');
const addTaskButton = document.getElementById('addTask');
const autoSuggestButton = document.getElementById('autoSuggestTasks');
const quickActionButtons = document.querySelectorAll('[data-quick-action]');

function saveUser() {
  if (!state) return;
  const safeUser = normalizeUser(state.currentUser, sessionEmail || state.currentUser?.email);
  state.currentUser = safeUser;
  database[sessionEmail || safeUser.email] = safeUser;
  localStorage.setItem(DB_KEY, JSON.stringify(database));
  notifyTaskSync();
}

function refreshCurrentUserFromStorage() {
  if (!state) return;
  const storedUsers = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const storedUser = sessionEmail ? storedUsers[sessionEmail] : null;
  database = storedUsers;
  if (storedUser) {
    state.currentUser = normalizeUser(storedUser, sessionEmail);
  }
}

function pushActivity(message) {
  state.currentUser = normalizeUser(state.currentUser, sessionEmail);
  state.currentUser.activity.unshift({
    id: `activity-${Date.now()}`,
    message,
    createdAt: new Date().toISOString()
  });
  state.currentUser.activity = state.currentUser.activity.slice(0, 6);
  saveUser();
}

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 2600);
}

function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  if (themeToggle) {
    const label = themeToggle.lastElementChild;
    if (label) {
      label.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  }
  if (state) {
    state.currentUser.theme = theme;
    if (persist) {
      saveUser();
    }
  }
}

window.addEventListener('themechange', (event) => {
  const nextTheme = event.detail?.theme || 'light';
  if (state) {
    state.currentUser.theme = nextTheme;
    saveUser();
  }
  applyTheme(nextTheme, false);
});

function getDisplayName(email) {
  const name = (email || '').split('@')[0] || 'there';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getOverdueCount(tasks) {
  return tasks.filter((task) => task.status !== 'Done' && task.dueDate && new Date(task.dueDate) < new Date()).length;
}

function renderStats() {
  refreshCurrentUserFromStorage();
  const summary = helpers.getTaskSummary(state.currentUser.tasks);
  const completion = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const overdue = getOverdueCount(state.currentUser.tasks);
  welcomeText.textContent = `Welcome, ${getDisplayName(sessionEmail)}`;
  projectCount.textContent = state.currentUser.projects.length;
  taskCount.textContent = summary.total;
  doneCount.textContent = summary.done;
  overdueCount.textContent = overdue;
  completionRate.textContent = `${completion}%`;
}

function renderProjects() {
  refreshCurrentUserFromStorage();
  projectsContainer.innerHTML = '';

  if (!state.currentUser.projects.length) {
    projectsContainer.innerHTML = '<div class="empty-state"><h3>No projects yet</h3><p>Start your first project to bring structure to your work.</p></div>';
    return;
  }

  state.currentUser.projects.forEach((project) => {
    const progress = helpers.getProjectProgress(project, state.currentUser.tasks);
    const projectCard = document.createElement('article');
    projectCard.className = 'project-card';
    projectCard.innerHTML = `
      <div class="project-foot">
        <strong>${project.name}</strong>
        <span class="status-pill status-progress">${project.timeline || 'Planning'}</span>
      </div>
      <p class="meta">${project.description || 'Focused project workspace'}</p>
      <p class="meta">${helpers.formatDisplayDate(project.deadline)} • ${state.currentUser.tasks.filter((task) => task.projectId === project.id).length} tasks</p>
      <div class="project-foot">
        <span class="priority-pill priority-low">${progress}% complete</span>
        <div class="project-actions">
          <button class="inline-btn" data-action="edit-project">Edit</button>
          <button class="inline-btn danger" data-action="delete-project">Delete</button>
        </div>
      </div>
    `;
    projectCard.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (action === 'edit-project') {
        editProject(project.id);
        return;
      }
      if (action === 'delete-project') {
        deleteProject(project.id);
        return;
      }
      state.selectedProjectId = project.id;
      renderProjects();
      renderBoard();
      renderFilters();
    });
    if (state.selectedProjectId === project.id) {
      projectCard.style.borderColor = 'var(--accent)';
    }
    projectsContainer.appendChild(projectCard);
  });
}

function renderFilters() {
  const options = state.currentUser.projects.map((project) => `<option value="${project.id}" ${state.filters.project === project.id ? 'selected' : ''}>${project.name}</option>`).join('');
  if (projectFilter) {
    projectFilter.innerHTML = `<option value="All">All projects</option>${options}`;
  }
}

function resetProjectModal() {
  document.getElementById('projectId').value = '';
  document.getElementById('projectName').value = '';
  document.getElementById('projectDescription').value = '';
  document.getElementById('projectDeadline').value = '';
  document.getElementById('projectTimeline').value = 'Planning';
  document.getElementById('projectModalTitle').textContent = 'Create project';
  document.getElementById('projectSubmitBtn').textContent = 'Create project';
}

function closeProjectModal() {
  document.getElementById('projectModal').classList.add('hidden');
  resetProjectModal();
}

function openProjectModal() {
  resetProjectModal();
  document.getElementById('projectModal').classList.remove('hidden');
  document.getElementById('projectName').focus();
}

function editProject(projectId) {
  const project = state.currentUser.projects.find((item) => item.id === projectId);
  if (!project) return;
  document.getElementById('projectId').value = project.id;
  document.getElementById('projectName').value = project.name;
  document.getElementById('projectDescription').value = project.description || '';
  document.getElementById('projectDeadline').value = project.deadline || '';
  document.getElementById('projectTimeline').value = project.timeline || 'Planning';
  document.getElementById('projectModalTitle').textContent = 'Edit project';
  document.getElementById('projectSubmitBtn').textContent = 'Save project';
  document.getElementById('projectModal').classList.remove('hidden');
  document.getElementById('projectName').focus();
}

function deleteProject(projectId) {
  if (!window.confirm('Delete this project and its tasks?')) return;
  state.currentUser.projects = state.currentUser.projects.filter((project) => project.id !== projectId);
  state.currentUser.tasks = state.currentUser.tasks.filter((task) => task.projectId !== projectId);
  if (state.selectedProjectId === projectId) {
    state.selectedProjectId = state.currentUser.projects[0]?.id || null;
  }
  saveUser();
  renderProjects();
  renderBoard();
  renderStats();
  renderFilters();
  pushActivity('Deleted a project and its tasks.');
  showAlert('Project deleted.');
}

function handleProjectSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('projectName').value.trim();
  if (!name) {
    showAlert('Project name is required.');
    return;
  }

  const description = document.getElementById('projectDescription').value.trim();
  const deadline = document.getElementById('projectDeadline').value;
  const timeline = document.getElementById('projectTimeline').value;
  const projectId = document.getElementById('projectId').value;

  if (projectId) {
    const project = state.currentUser.projects.find((item) => item.id === projectId);
    if (project) {
      project.name = name;
      project.description = description || 'Focused project workspace';
      project.deadline = deadline;
      project.timeline = timeline;
      saveUser();
      renderProjects();
      renderBoard();
      renderFilters();
      pushActivity(`Updated ${project.name}.`);
      showAlert(`Project “${project.name}” updated.`);
      closeProjectModal();
      return;
    }
  }

  const project = {
    id: `project-${Date.now()}`,
    name,
    description: description || 'Freshly created workspace',
    deadline,
    timeline,
    createdAt: new Date().toISOString()
  };

  state.currentUser.projects.unshift(project);
  state.selectedProjectId = project.id;
  saveUser();
  renderProjects();
  renderBoard();
  renderFilters();
  pushActivity(`Created project ${project.name}.`);
  showAlert(`Project “${project.name}” created.`);
  closeProjectModal();
}

function addSuggestedTasks(projectId, projectName) {
  const suggestions = helpers.buildTaskSuggestions(projectName);
  suggestions.forEach((suggestion) => {
    state.currentUser.tasks.push({
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: suggestion.title,
      priority: suggestion.priority,
      dueDate: suggestion.dueDate,
      status: 'Todo',
      description: suggestion.description,
      projectId,
      createdAt: new Date().toISOString()
    });
  });
  saveUser();
  renderBoard();
  renderStats();
  pushActivity('Added suggested tasks to your workspace.');
  showAlert('Suggested tasks added.');
}

function resetTaskModal() {
  document.getElementById('taskId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskPriority').value = 'Medium';
  document.getElementById('taskDueDate').value = '';
  document.getElementById('taskStatus').value = 'Todo';
  document.getElementById('taskAttachments').value = '';
  document.getElementById('taskModalTitle').textContent = 'Create task';
  document.getElementById('taskSubmitBtn').textContent = 'Create task';
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.add('hidden');
  resetTaskModal();
}

function openTaskModal(taskId = null) {
  if (!state.selectedProjectId && state.currentUser.projects.length) {
    state.selectedProjectId = state.currentUser.projects[0].id;
  }

  if (!state.selectedProjectId) {
    showAlert('Create or select a project first.');
    return;
  }

  resetTaskModal();

  if (taskId) {
    const task = state.currentUser.tasks.find((item) => item.id === taskId);
    if (!task) return;
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskPriority').value = task.priority || 'Medium';
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskStatus').value = task.status || 'Todo';
    document.getElementById('taskAttachments').value = (task.attachments || []).join(', ');
    document.getElementById('taskModalTitle').textContent = 'Edit task';
    document.getElementById('taskSubmitBtn').textContent = 'Save task';
  }

  document.getElementById('taskModal').classList.remove('hidden');
  document.getElementById('taskTitle').focus();
}

function handleTaskSubmit(event) {
  event.preventDefault();

  const title = document.getElementById('taskTitle').value.trim();
  if (!title) {
    showAlert('Task title is required.');
    return;
  }

  const description = document.getElementById('taskDescription').value.trim();
  const priority = document.getElementById('taskPriority').value;
  const dueDate = document.getElementById('taskDueDate').value;
  const status = document.getElementById('taskStatus').value;
  const attachments = document.getElementById('taskAttachments').value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const taskId = document.getElementById('taskId').value;

  if (taskId) {
    const task = state.currentUser.tasks.find((item) => item.id === taskId);
    if (task) {
      task.title = title;
      task.description = description;
      task.priority = priority;
      task.dueDate = dueDate || task.dueDate;
      task.status = status;
      task.attachments = attachments;
      if (status === 'Done' && !task.completedAt) {
        task.completedAt = new Date().toISOString();
      }
      saveUser();
      renderBoard();
      renderStats();
      renderActivity();
      pushActivity(`Updated task ${task.title}.`);
      showAlert(`Task “${task.title}” updated.`);
    }
  } else {
    const task = {
      id: `task-${Date.now()}`,
      title,
      priority,
      dueDate: dueDate || new Date().toISOString().slice(0, 10),
      status,
      description: description || 'Created from the task workspace.',
      projectId: state.selectedProjectId,
      attachments,
      createdAt: new Date().toISOString()
    };

    state.currentUser.tasks.push(task);
    saveUser();
    renderBoard();
    renderStats();
    renderActivity();
    pushActivity(`Created task ${task.title}.`);
    showAlert(`Task “${task.title}” added.`);
  }

  closeTaskModal();
}

function buildContributionGrid(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (34 - index));
    const key = date.toISOString().slice(0, 10);
    const value = tasks.filter((task) => task.status === 'Done' && task.completedAt && task.completedAt.slice(0, 10) === key).length;
    const intensity = value === 0 ? 0 : value <= 1 ? 1 : value <= 2 ? 2 : value <= 3 ? 3 : 4;
    return { key, value, intensity, label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
  });
}

function renderBoard() {
  refreshCurrentUserFromStorage();
  const visibleTasks = state.currentUser.tasks.filter((task) => {
    if (!state.selectedProjectId) return true;
    return task.projectId === state.selectedProjectId;
  });
  const filteredTasks = helpers.filterTasks(visibleTasks, state.filters, state.currentUser.projects);

  const columns = {
    Todo: filteredTasks.filter((task) => task.status === 'Todo'),
    'In Progress': filteredTasks.filter((task) => task.status === 'In Progress'),
    Done: filteredTasks.filter((task) => task.status === 'Done')
  };

  taskBoard.innerHTML = '';

  if (!filteredTasks.length) {
    taskBoard.innerHTML = '<div class="empty-state"><h3>No tasks match your filters</h3><p>Try clearing a filter or create a new task.</p></div>';
    return;
  }

  Object.entries(columns).forEach(([title, tasks]) => {
    const column = document.createElement('section');
    column.className = 'board-column';
    column.innerHTML = `<h3>${title}</h3><p class="column-meta">${tasks.length} item${tasks.length === 1 ? '' : 's'}</p>`;
    tasks.forEach((task) => {
      const card = document.createElement('article');
      card.className = 'task-card';
      card.draggable = true;
      card.innerHTML = `
        <div class="top">
          <strong>${task.title}</strong>
          <span class="priority-pill ${helpers.getPriorityTone(task.priority)}">${task.priority}</span>
        </div>
        <p>${task.description || 'No notes yet.'}</p>
        <div class="project-foot">
          <span class="status-pill ${helpers.getTaskStatusTone(task.status)}">${task.status}</span>
          <span class="text-soft">${helpers.formatDisplayDate(task.dueDate)}</span>
        </div>
        <div class="actions">
          <button class="inline-btn" data-action="edit">Edit</button>
          <button class="inline-btn danger" data-action="delete">Delete</button>
        </div>
      `;
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', task.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', (event) => {
        const action = event.target.dataset.action;
        if (action === 'delete') {
          removeTask(task.id);
        } else if (action === 'edit') {
          editTask(task.id);
        }
      });
      column.appendChild(card);
    });
    column.addEventListener('dragover', (event) => event.preventDefault());
    column.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedId = event.dataTransfer.getData('text/plain');
      const taskToMove = state.currentUser.tasks.find((item) => item.id === draggedId);
      if (taskToMove) {
        taskToMove.status = title;
        if (title === 'Done' && !taskToMove.completedAt) {
          taskToMove.completedAt = new Date().toISOString();
        } else if (title !== 'Done') {
          delete taskToMove.completedAt;
        }
        saveUser();
        pushActivity(`Moved ${taskToMove.title} to ${title}.`);
        renderBoard();
        renderStats();
        renderActivity();
      }
    });
    taskBoard.appendChild(column);
  });
}

function renderActivity() {
  refreshCurrentUserFromStorage();
  const feed = state.currentUser.activity.length ? state.currentUser.activity : [
    { id: 'default-1', message: 'Create your first project to begin.', createdAt: new Date().toISOString() }
  ];
  activityFeed.innerHTML = feed.map((entry) => `<div class="activity-item">${entry.message}</div>`).join('');
}

function renderHeatmap() {
  refreshCurrentUserFromStorage();
  const grid = buildContributionGrid(state.currentUser.tasks);
  heatmap.innerHTML = grid.map((item) => `<div class="heatmap-cell level-${item.intensity}" title="${item.label}: ${item.value} completed"></div>`).join('');
  heatmap.insertAdjacentHTML('afterend', '<div class="heatmap-legend"><span>Less</span><span class="legend-swatch level-0"></span><span class="legend-swatch level-1"></span><span class="legend-swatch level-2"></span><span class="legend-swatch level-3"></span><span class="legend-swatch level-4"></span><span>More</span></div>');
}

function removeTask(taskId) {
  if (!window.confirm('Delete this task?')) return;
  state.currentUser.tasks = state.currentUser.tasks.filter((task) => task.id !== taskId);
  saveUser();
  pushActivity('Removed a task from the workspace.');
  renderBoard();
  renderStats();
  renderActivity();
  showAlert('Task removed.');
}

function editTask(taskId) {
  openTaskModal(taskId);
}

function bindEvents() {
  document.getElementById('logout')?.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    window.location.href = 'index.html';
  });

  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === DB_KEY || event.key === SESSION_KEY) {
      refreshCurrentUserFromStorage();
      renderStats();
      renderProjects();
      renderFilters();
      renderBoard();
      renderActivity();
      renderHeatmap();
    }
  });

  window.addEventListener('nexus:tasks-updated', () => {
    refreshCurrentUserFromStorage();
    renderStats();
    renderProjects();
    renderFilters();
    renderBoard();
    renderActivity();
    renderHeatmap();
  });

  document.getElementById('newProject').addEventListener('click', openProjectModal);
  autoSuggestButton.addEventListener('click', () => {
    const project = state.currentUser.projects.find((item) => item.id === state.selectedProjectId);
    if (!project) {
      showAlert('Select a project first.');
      return;
    }
    addSuggestedTasks(project.id, project.name);
  });
  addTaskButton.addEventListener('click', () => openTaskModal());
  quickActionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.quickAction;
      if (action === 'new-task') {
        openTaskModal();
      } else if (action === 'new-project') {
        openProjectModal();
      } else if (action === 'open-board') {
        window.location.href = 'board.html';
      }
    });
  });

  document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
  document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('cancelTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('taskModal').addEventListener('click', (event) => {
    if (event.target.id === 'taskModal') {
      closeTaskModal();
    }
  });

  document.getElementById('projectForm').addEventListener('submit', handleProjectSubmit);
  document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
  document.getElementById('cancelProjectModal').addEventListener('click', closeProjectModal);
  document.getElementById('projectModal').addEventListener('click', (event) => {
    if (event.target.id === 'projectModal') {
      closeProjectModal();
    }
  });

  searchInput?.addEventListener('input', (event) => {
    state.filters.query = event.target.value;
    renderBoard();
  });
  dashboardSearchInput?.addEventListener('input', (event) => {
    state.filters.query = event.target.value;
    renderBoard();
  });
  priorityFilter?.addEventListener('change', (event) => {
    state.filters.priority = event.target.value;
    renderBoard();
  });
  statusFilter?.addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderBoard();
  });
  projectFilter?.addEventListener('change', (event) => {
    state.filters.project = event.target.value;
    renderBoard();
  });
  dueFilter?.addEventListener('change', (event) => {
    state.filters.dueRange = event.target.value;
    renderBoard();
  });

  taskBoard.addEventListener('dragover', (event) => event.preventDefault());
  taskBoard.addEventListener('drop', (event) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');
    const taskToMove = state.currentUser.tasks.find((item) => item.id === draggedId);
    if (taskToMove) {
      taskToMove.status = 'In Progress';
      delete taskToMove.completedAt;
      saveUser();
      pushActivity(`Moved ${taskToMove.title} to In Progress.`);
      renderBoard();
      renderStats();
      renderActivity();
    }
  });
}

function initDashboard() {
  if (!state.currentUser.projects.length) {
    state.currentUser.projects.unshift({
      id: 'project-demo',
      name: 'Launch Sprint',
      description: 'A starter project for your first week.',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      timeline: 'Execution',
      createdAt: new Date().toISOString()
    });
    state.selectedProjectId = 'project-demo';
    state.currentUser.tasks = [
      { id: 'task-demo-1', title: 'Draft roadmap', priority: 'High', dueDate: new Date().toISOString().slice(0, 10), status: 'Todo', description: 'Capture your plan.', projectId: 'project-demo', createdAt: new Date().toISOString() },
      { id: 'task-demo-2', title: 'Review notes', priority: 'Medium', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), status: 'In Progress', description: 'Share updates.', projectId: 'project-demo', createdAt: new Date().toISOString() },
      { id: 'task-demo-3', title: 'Ship weekly update', priority: 'Low', dueDate: new Date(Date.now() + 172800000).toISOString().slice(0, 10), status: 'Done', description: 'Celebrate the close.', projectId: 'project-demo', completedAt: new Date().toISOString(), createdAt: new Date().toISOString() }
    ];
    state.currentUser.activity = [
      { id: 'activity-demo-1', message: 'Created project Launch Sprint.', createdAt: new Date().toISOString() },
      { id: 'activity-demo-2', message: 'Completed Ship weekly update.', createdAt: new Date().toISOString() }
    ];
    saveUser();
  }

  if (!state.selectedProjectId && state.currentUser.projects.length) {
    state.selectedProjectId = state.currentUser.projects[0].id;
  }

  const preferredTheme = localStorage.getItem('nexus-theme') || state.currentUser.theme || 'light';
  state.currentUser.theme = preferredTheme;
  applyTheme(preferredTheme, false);
  renderStats();
  renderProjects();
  renderFilters();
  renderBoard();
  renderActivity();
  renderHeatmap();
  bindEvents();

  const dueSoonTasks = helpers.getDueSoonTasks(state.currentUser.tasks);
  if (dueSoonTasks.length) {
    showAlert(`Reminder: ${dueSoonTasks[0].title} is due soon.`);
  }
}

if (!sessionEmail || !localStorage.getItem(JWT_KEY) || !currentUser) {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(JWT_KEY);
  localStorage.removeItem(PROVIDER_KEY);
  window.location.href = 'index.html';
} else {
  state = {
    currentUser,
    selectedProjectId: null,
    filters: { query: '', priority: 'All', status: 'All', project: 'All', dueRange: 'All' }
  };
  initDashboard();
}
