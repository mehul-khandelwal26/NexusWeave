const DB_KEY = 'users';
const SESSION_KEY = 'session';
const JWT_KEY = 'jwt';
const PROVIDER_KEY = 'authProvider';
const helpers = window.AppHelpers;

let state = null;
const sessionEmail = localStorage.getItem(SESSION_KEY);
const database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
const storedTheme = localStorage.getItem('nexus-theme') || 'light';
let currentUser = sessionEmail ? database[sessionEmail] : null;

if (!currentUser) {
  const demoEmail = 'demo@nexusweave.app';
  currentUser = {
    email: demoEmail,
    password: 'demo123',
    theme: storedTheme,
    projects: [],
    tasks: [],
    createdAt: Date.now()
  };
  database[demoEmail] = currentUser;
  localStorage.setItem(DB_KEY, JSON.stringify(database));
  localStorage.setItem(SESSION_KEY, demoEmail);
}

const welcomeText = document.getElementById('welcomeText');
const projectCount = document.getElementById('projectCount');
const taskCount = document.getElementById('taskCount');
const doneCount = document.getElementById('doneCount');
const projectsContainer = document.getElementById('projects');
const taskBoard = document.getElementById('taskBoard');
const alertBox = document.getElementById('alertBox');
const themeToggle = document.querySelector('[data-theme-toggle]');
const searchInput = document.getElementById('taskSearch');
const priorityFilter = document.getElementById('priorityFilter');
const dueFilter = document.getElementById('dueFilter');
const addTaskButton = document.getElementById('addTask');
const autoSuggestButton = document.getElementById('autoSuggestTasks');

function saveUser() {
  if (!state) return;
  database[sessionEmail] = state.currentUser;
  localStorage.setItem(DB_KEY, JSON.stringify(database));
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

function renderStats() {
  const summary = helpers.getTaskSummary(state.currentUser.tasks);
  welcomeText.textContent = `Welcome, ${getDisplayName(sessionEmail)}`;
  projectCount.textContent = state.currentUser.projects.length;
  taskCount.textContent = summary.total;
  doneCount.textContent = summary.done;
}

function renderProjects() {
  projectsContainer.innerHTML = '';

  if (!state.currentUser.projects.length) {
    projectsContainer.innerHTML = '<div class="project"><strong>No projects yet</strong><div class="meta">Create your first workspace to start shaping your workflow.</div></div>';
    return;
  }

  state.currentUser.projects.forEach((project) => {
    const projectCard = document.createElement('div');
    projectCard.className = 'project';
    projectCard.innerHTML = `
      <strong>${project.name}</strong>
      <div class="meta">${project.description || 'Focused project workspace'}</div>
      <div class="meta">Deadline: ${project.deadline || 'No deadline'} • Timeline: ${project.timeline || 'Planning'}</div>
      <div class="project-actions">
        <button class="inline-btn" data-action="edit-project">Edit</button>
        <button class="inline-btn" data-action="delete-project">Delete</button>
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
    });
    if (state.selectedProjectId === project.id) {
      projectCard.style.borderColor = 'var(--accent)';
    }
    projectsContainer.appendChild(projectCard);
  });
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
      projectId
    });
  });
  saveUser();
  renderBoard();
  renderStats();
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
      saveUser();
      renderBoard();
      renderStats();
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
      attachments
    };

    state.currentUser.tasks.push(task);
    saveUser();
    renderBoard();
    renderStats();
    showAlert(`Task “${task.title}” added.`);
  }

  closeTaskModal();
}

function renderBoard() {
  const filteredTasks = helpers.filterTasks(
    state.currentUser.tasks.filter((task) => {
      if (!state.selectedProjectId) return true;
      return task.projectId === state.selectedProjectId;
    }),
    state.filters.query,
    state.filters.priority,
    state.filters.due
  );

  const columns = {
    Todo: filteredTasks.filter((task) => task.status === 'Todo'),
    'In Progress': filteredTasks.filter((task) => task.status === 'In Progress'),
    Done: filteredTasks.filter((task) => task.status === 'Done')
  };

  taskBoard.innerHTML = '';

  Object.entries(columns).forEach(([title, tasks]) => {
    const column = document.createElement('div');
    column.className = 'task-column';
    column.innerHTML = `<h3>${title}</h3>`;
    tasks.forEach((task) => {
      const card = document.createElement('article');
      card.className = 'task-card';
      card.draggable = true;
      card.innerHTML = `
        <div class="top">
          <strong>${task.title}</strong>
          <span class="badge">${task.priority}</span>
        </div>
        <p>${task.description || 'No notes yet.'}</p>
        <p>Due: ${task.dueDate || 'No date'}</p>
        <div class="actions">
          <button class="inline-btn" data-action="edit">Edit</button>
          <button class="inline-btn" data-action="delete">Delete</button>
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
      const draggedId = event.dataTransfer.getData('text/plain');
      const taskToMove = state.currentUser.tasks.find((item) => item.id === draggedId);
      if (taskToMove) {
        taskToMove.status = title;
        saveUser();
        renderBoard();
      }
    });
    taskBoard.appendChild(column);
  });
}

function removeTask(taskId) {
  if (!window.confirm('Delete this task?')) return;
  state.currentUser.tasks = state.currentUser.tasks.filter((task) => task.id !== taskId);
  saveUser();
  renderBoard();
  renderStats();
  showAlert('Task removed.');
}

function editTask(taskId) {
  openTaskModal(taskId);
}

function bindEvents() {
  document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    window.location.href = 'index.html';
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

  searchInput.addEventListener('input', (event) => {
    state.filters.query = event.target.value;
    renderBoard();
  });
  priorityFilter.addEventListener('change', (event) => {
    state.filters.priority = event.target.value;
    renderBoard();
  });
  dueFilter.addEventListener('change', (event) => {
    state.filters.due = event.target.value;
    renderBoard();
  });

  taskBoard.addEventListener('dragover', (event) => event.preventDefault());
  taskBoard.addEventListener('drop', (event) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');
    const taskToMove = state.currentUser.tasks.find((item) => item.id === draggedId);
    if (taskToMove) {
      taskToMove.status = 'In Progress';
      saveUser();
      renderBoard();
    }
  });
}

function initDashboard() {
  if (!state.currentUser.projects.length) {
    state.currentUser.projects.unshift({
      id: 'project-demo',
      name: 'Launch Sprint',
      description: 'A starter project for your first week.',
      createdAt: new Date().toISOString()
    });
    state.selectedProjectId = 'project-demo';
    state.currentUser.tasks = [
      { id: 'task-demo-1', title: 'Draft roadmap', priority: 'High', dueDate: new Date().toISOString().slice(0, 10), status: 'Todo', description: 'Capture your plan.', projectId: 'project-demo' },
      { id: 'task-demo-2', title: 'Review notes', priority: 'Medium', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), status: 'In Progress', description: 'Share updates.', projectId: 'project-demo' },
      { id: 'task-demo-3', title: 'Ship weekly update', priority: 'Low', dueDate: new Date(Date.now() + 172800000).toISOString().slice(0, 10), status: 'Done', description: 'Celebrate the close.', projectId: 'project-demo' }
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
  renderBoard();
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
    filters: { query: '', priority: 'All', due: 'All' }
  };
  initDashboard();
}
