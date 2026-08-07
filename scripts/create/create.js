const toggleButtons = Array.from(document.querySelectorAll('[data-entity-toggle]'));
const entityForms = Array.from(document.querySelectorAll('[data-entity-form]'));
const modal = document.querySelector('[data-create-modal]');
const labelModal = document.querySelector('[data-label-modal]');
const openModalButtons = Array.from(document.querySelectorAll('[data-open-modal]'));
const closeModalButtons = Array.from(document.querySelectorAll('[data-close-modal]'));
const openLabelModalButtons = Array.from(document.querySelectorAll('[data-open-label-modal]'));
const closeLabelModalButtons = Array.from(document.querySelectorAll('[data-close-label-modal]'));
const dateInputs = Array.from(document.querySelectorAll('[data-date-input]'));
const taskForm = document.querySelector('form[data-entity-form="task"]');
const projectForm = document.querySelector('form[data-entity-form="project"]');
const taskFeedback = document.querySelector('[data-task-feedback]');
const projectFeedback = document.querySelector('[data-project-feedback]');
const taskToast = document.querySelector('[data-task-toast]');
const resetTaskFormButton = document.querySelector('[data-reset-task-form]');
const labelSearchInput = document.querySelector('[data-label-search]');
const newLabelInput = document.querySelector('[data-new-label-input]');
const createLabelButton = document.querySelector('[data-create-label]');
const labelOptionsContainer = document.querySelector('[data-label-options]');
const selectedLabelContainers = Array.from(document.querySelectorAll('[data-label-chips]'));
const attachmentInput = document.querySelector('[data-attachment-input]');
const attachmentLists = Array.from(document.querySelectorAll('[data-attachment-list]'));
const openAttachmentsButtons = Array.from(document.querySelectorAll('[data-open-attachments]'));

// Session and User-Scoped Database Setup
const DB_KEY = 'users';
const SESSION_KEY = 'session';
const JWT_KEY = 'jwt';
const DEFAULT_LABELS = ['Work', 'College', 'Personal', 'Urgent', 'Meeting'];

const sessionEmail = sessionStorage.getItem(SESSION_KEY);

let currentUser = window.NexusAPI ? window.NexusAPI.getMe() : null;

// Auth Redirect
if (!currentUser) {
  window.location.href = 'index.html';
}

let tasks = [];
let projects = [];
let labels = [...DEFAULT_LABELS];
let orgUsers = [];

let selectedLabels = [];
let selectedAttachments = [];
let selectedTasksForNewProject = [];
let aiSuggestedTasks = null;
let aiSuggestedBg = null;
let toastTimer = null;

function setActiveEntity(targetKey) {
  toggleButtons.forEach((button) => {
    const isActive = button.dataset.target === targetKey;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  entityForms.forEach((form) => {
    const isActive = form.dataset.entityForm === targetKey;
    form.classList.toggle('is-active', isActive);
  });
}

function openModal() {
  if (!modal) return;
  renderExistingTasksForModal();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function openLabelModal() {
  if (!labelModal) return;
  renderLabelOptions();
  labelModal.classList.add('is-open');
  labelModal.setAttribute('aria-hidden', 'false');
}

function closeLabelModal() {
  if (!labelModal) return;
  labelModal.classList.remove('is-open');
  labelModal.setAttribute('aria-hidden', 'true');
}

/** Mirrors the server state into the shared cache the other pages read. */
function syncLocalCache() {
  if (window.NexusAPI && window.NexusAPI.saveUserData) {
    window.NexusAPI.saveUserData({ tasks, projects });
  }
  window.dispatchEvent(new CustomEvent('nexus:tasks-updated'));
}

function saveTasks() {
  syncLocalCache();
}

function saveLabels() {
  window.dispatchEvent(new CustomEvent('nexus:tasks-updated'));
}

function saveProjects() {
  syncLocalCache();
}

function getProjectFormValues() {
  return {
    name: projectForm?.querySelector('#project-name')?.value || '',
    description: projectForm?.querySelector('#project-description')?.value || '',
    deadline: projectForm?.querySelector('#project-deadline')?.value || '',
  };
}

function validateProjectForm(values) {
  if (!values.name.trim()) {
    return 'Project Name is required.';
  }
  return null;
}

function buildProjectObject(values) {
  return {
    id: `project-${Date.now()}`,
    name: values.name.trim(),
    description: values.description.trim() || 'Focused project workspace',
    deadline: values.deadline,
    timeline: 'Planning',
    boardBg: aiSuggestedBg || 'none',
    labels: [...selectedLabels],
    attachments: [...selectedAttachments],
    createdAt: new Date().toISOString(),
  };
}

function resetProjectForm() {
  if (!projectForm) return;
  projectForm.reset();
  selectedLabels = [];
  selectedAttachments = [];
  renderSelectedLabels();
  renderAttachments();
  showFeedback('');
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  const values = getProjectFormValues();
  const validationError = validateProjectForm(values);

  if (validationError) {
    showFeedback(validationError, 'error', projectFeedback);
    return;
  }

  const project = buildProjectObject(values);

  let createdProject = null;
  try {
    createdProject = await window.NexusAPI.createBackendProject(project);
  } catch (e) {
    console.warn('Failed to create project in backend', e);
  }

  if (!createdProject) {
    showFeedback('Could not save the project to the server. Please check your connection and try again.', 'error', projectFeedback);
    return;
  }
  createdProject.id = createdProject._id || createdProject.id;

  if (aiSuggestedTasks) {
    for (let i = 0; i < aiSuggestedTasks.length; i++) {
      const title = aiSuggestedTasks[i];
      const taskData = {
        title,
        priority: i === 0 ? 'High' : i <= 2 ? 'Medium' : 'Low',
        dueDate: new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10),
        status: i === 3 ? 'In Progress' : 'Todo',
        description: 'AI-suggested workspace task breakdown.',
        projectId: createdProject.id,
        labels: [],
        attachments: []
      };
      
      try {
        const t = await window.NexusAPI.createBackendTask(taskData);
        if (t) {
          t.id = t._id || t.id;
          tasks.unshift(t);
        }
      } catch (e) {
        console.warn('Failed to create AI task in backend', e);
      }
    }
    aiSuggestedTasks = null;
  }
  aiSuggestedBg = null;

  // Link selected tasks to this project
  for (let i = 0; i < selectedTasksForNewProject.length; i++) {
    const taskId = selectedTasksForNewProject[i];
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.projectId = createdProject.id;
      if (window.NexusAPI && window.NexusAPI.updateBackendTask) {
        try {
          await window.NexusAPI.updateBackendTask(taskId, { projectId: createdProject.id });
        } catch(e) {}
      }
    }
  }

  projects = [createdProject, ...projects];
  saveProjects();
  showFeedback('Project created successfully.', 'success', projectFeedback);
  showToast('Project created successfully.');
  
  selectedTasksForNewProject = [];
  updateSelectedTasksCount();
  resetProjectForm();
  populateProjectDropdown();

  const aiSuggestBtn = document.getElementById('aiSuggestBtn');
  if (aiSuggestBtn) {
    aiSuggestBtn.innerHTML = '✨ AI Auto-Suggest Tasks & Background';
  }
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function syncTimeInputStates() {
  dateInputs.forEach((input) => {
    const timeInput = input.closest('.field')?.querySelector('[data-time-input]');
    if (!timeInput) return;
    timeInput.disabled = !input.value;
  });
}

function showFeedback(message, type = 'success', target = null) {
  const feedbackTarget = target || taskFeedback || projectFeedback;
  if (!feedbackTarget) return;
  feedbackTarget.textContent = message;
  feedbackTarget.className = message ? `form-message ${type}` : 'form-message';
}

function showToast(message) {
  if (!taskToast) return;
  taskToast.textContent = message;
  taskToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => taskToast.classList.remove('show'), 2400);
}

function getTaskFormValues() {
  return {
    title: taskForm?.querySelector('#task-name')?.value || '',
    description: taskForm?.querySelector('#task-description')?.value || '',
    project: taskForm?.querySelector('#task-project')?.value || '',
    priority: taskForm?.querySelector('#task-priority')?.value || 'none',
    status: taskForm?.querySelector('#task-status')?.value || 'todo',
    assignee: taskForm?.querySelector('#taskAssignee')?.value || '',
    deadlineDate: taskForm?.querySelector('#task-deadline-date')?.value || '',
    deadlineTime: taskForm?.querySelector('#task-deadline-time')?.value || '',
    reminderDate: taskForm?.querySelector('#task-reminder-date')?.value || '',
    reminderTime: taskForm?.querySelector('#task-reminder-time')?.value || '',
  };
}

function validateTaskForm(values) {
  if (!values.title.trim()) {
    return 'Task Name is required.';
  }

  if ((values.deadlineTime && !values.deadlineDate) || (values.reminderTime && !values.reminderDate)) {
    return 'A date is required when a time is selected.';
  }

  return null;
}

function buildTaskObject(values) {
  let priority = 'Medium';
  if (values.priority === 'high') priority = 'High';
  if (values.priority === 'low') priority = 'Low';
  if (values.priority === 'medium') priority = 'Medium';

  let status = 'Todo';
  if (values.status === 'todo') status = 'Todo';
  if (values.status === 'in-progress') status = 'In Progress';
  if (values.status === 'done') status = 'Done';

  let isOrgTask = false;
  let assignedUserEmail = null;
  if (values.assignee === 'ORG_TASK') {
     isOrgTask = true;
  } else if (values.assignee) {
     assignedUserEmail = values.assignee;
  }

  const taskObj = {
    id: `task-${Date.now()}`,
    title: values.title.trim(),
    description: values.description.trim() || 'Created from the task workspace.',
    projectId: values.project || null,
    priority: priority,
    status: status,
    dueDate: values.deadlineDate || '',
    dueTime: values.deadlineTime || '',
    reminderDate: values.reminderDate || '',
    reminderTime: values.reminderTime || '',
    isOrgTask: isOrgTask,
    assignedUserEmail: assignedUserEmail,
    labels: [...selectedLabels],
    attachments: selectedAttachments.map(a => a.name),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (status === 'Done') {
    taskObj.completedAt = new Date().toISOString();
  }

  return taskObj;
}

function resetTaskForm() {
  if (!taskForm) return;
  taskForm.reset();
  if (window.NexusDateTimePicker && window.NexusDateTimePicker.resetForm) {
    window.NexusDateTimePicker.resetForm(taskForm);
  }
  selectedLabels = [];
  selectedAttachments = [];
  renderSelectedLabels();
  renderAttachments();
  syncTimeInputStates();
  showFeedback('');
}

function renderSelectedLabels() {
  const containers = document.querySelectorAll('[data-label-chips]');
  containers.forEach(container => {
    container.innerHTML = selectedLabels
      .map((label) => `
        <button class="chip" type="button" data-remove-label="${escapeHtml(label)}">
          <span>${escapeHtml(label)}</span>
          <span>×</span>
        </button>
      `)
      .join('');
  });
}

function renderAttachments() {
  const lists = document.querySelectorAll('[data-attachment-list]');
  lists.forEach(list => {
    if (!selectedAttachments.length) {
      list.innerHTML = '<p class="empty-state-inline">No attachments selected</p>';
      return;
    }

    list.innerHTML = selectedAttachments
      .map((attachment, index) => `
        <div class="attachment-item">
          <div>
            <strong>${escapeHtml(attachment.name)}</strong>
            <span>${escapeHtml(attachment.type || 'unknown')} • ${(attachment.size / 1024).toFixed(1)} KB</span>
          </div>
          <button class="chip" type="button" data-remove-attachment="${index}">×</button>
        </div>
      `)
      .join('');
  });
}

function renderLabelOptions() {
  if (!labelOptionsContainer) return;
  const searchValue = labelSearchInput?.value?.trim().toLowerCase() || '';
  const filteredLabels = labels.filter((label) => label.toLowerCase().includes(searchValue));

  if (!filteredLabels.length) {
    labelOptionsContainer.innerHTML = '<p class="empty-state-inline">No labels found</p>';
    return;
  }

  labelOptionsContainer.innerHTML = filteredLabels
    .map((label) => {
      const checked = selectedLabels.includes(label) ? 'checked' : '';
      return `
        <label class="label-option">
          <input type="checkbox" value="${escapeHtml(label)}" ${checked} />
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    })
    .join('');
}

function addLabelSelection(label) {
  if (!label || selectedLabels.includes(label)) return;
  selectedLabels = [...selectedLabels, label];
  renderSelectedLabels();
  renderLabelOptions();
}

function removeLabelSelection(label) {
  selectedLabels = selectedLabels.filter((item) => item !== label);
  renderSelectedLabels();
  renderLabelOptions();
}

function handleCreateLabel() {
  const value = newLabelInput?.value?.trim();
  if (!value) return;
  if (!labels.includes(value)) {
    labels = [...labels, value];
    saveLabels();
  }
  addLabelSelection(value);
  if (newLabelInput) newLabelInput.value = '';
  if (labelSearchInput) labelSearchInput.value = '';
  renderLabelOptions();
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const values = getTaskFormValues();
  const validationError = validateTaskForm(values);

  if (validationError) {
    showFeedback(validationError, 'error', taskFeedback);
    return;
  }

  const task = buildTaskObject(values);

  // The database is the only place a task really exists — a task that lives
  // solely in this tab would silently disappear on the next page load.
  let createdTask = null;
  try {
    createdTask = await window.NexusAPI.createBackendTask(task);
  } catch (err) {
    console.warn('Backend task creation failed:', err);
  }

  if (!createdTask) {
    showFeedback('Could not save the task to the server. Please check your connection and try again.', 'error', taskFeedback);
    return;
  }

  createdTask.id = createdTask._id || createdTask.id;
  tasks = [createdTask, ...tasks];
  saveTasks();
  showFeedback('Task created successfully.', 'success', taskFeedback);
  showToast('Task created successfully.');
  resetTaskForm();
}

function populateProjectDropdown() {
  const dropdown = document.getElementById('task-project');
  if (!dropdown) return;
  dropdown.innerHTML = '<option value="">None</option>';
  projects.forEach((project) => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    dropdown.appendChild(option);
  });
}

function renderExistingTasksForModal() {
  const lists = modal.querySelectorAll('.task-selection-list');
  if (lists.length < 2) return;

  const unassignedList = lists[0];
  const assignedList = lists[1];

  const unassigned = tasks.filter((task) => !task.projectId);
  const assigned = tasks.filter((task) => task.projectId);

  const filterInput = modal.querySelector('.modal-search input');
  const query = filterInput ? filterInput.value.toLowerCase() : '';

  function renderList(container, taskArray) {
    const filtered = taskArray.filter(task => task.title.toLowerCase().includes(query));
    if (!filtered.length) {
      container.innerHTML = '<p class="empty-state-inline">No tasks available</p>';
      return;
    }

    container.innerHTML = filtered.map(task => {
      const isChecked = selectedTasksForNewProject.includes(task.id) ? 'checked' : '';
      return `
        <label class="task-selection-item">
          <input type="checkbox" value="${task.id}" ${isChecked} data-task-select />
          <span>${escapeHtml(task.title)}</span>
        </label>
      `;
    }).join('');
  }

  renderList(unassignedList, unassigned);
  renderList(assignedList, assigned);
}

function updateSelectedTasksCount() {
  const placeholder = projectForm.querySelector('.placeholder-state');
  if (!placeholder) return;

  if (selectedTasksForNewProject.length === 0) {
    placeholder.innerHTML = '<p>No tasks selected</p>';
  } else {
    placeholder.innerHTML = `<p><strong>${selectedTasksForNewProject.length}</strong> task(s) selected to link to this project.</p>`;
  }
}

resetTaskFormButton?.addEventListener('click', resetTaskForm);
taskForm?.addEventListener('submit', handleTaskSubmit);
projectForm?.addEventListener('submit', handleProjectSubmit);

const aiSuggestBtn = document.getElementById('aiSuggestBtn');
const aiSuggestStatus = document.getElementById('aiSuggestStatus');

aiSuggestBtn?.addEventListener('click', () => {
  const nameInput = document.getElementById('project-name');
  const projectName = nameInput ? nameInput.value.trim() : '';
  if (!projectName) {
    showToast('Please enter a project name first.');
    return;
  }

  aiSuggestStatus?.classList.remove('hidden');
  aiSuggestBtn.disabled = true;

  setTimeout(() => {
    aiSuggestStatus?.classList.add('hidden');
    aiSuggestBtn.disabled = false;

    const nameLower = projectName.toLowerCase();
    let suggestions = [];
    if (nameLower.includes('web') || nameLower.includes('app') || nameLower.includes('site') || nameLower.includes('design')) {
      suggestions = [
        'Design landing page high-fidelity mockups',
        'Set up structural components & stylesheet foundations',
        'Implement user auth flow redirects',
        'Deploy staging build to Vercel/Netlify'
      ];
    } else if (nameLower.includes('research') || nameLower.includes('paper') || nameLower.includes('study') || nameLower.includes('college')) {
      suggestions = [
        'Conduct literature review of current sources',
        'Define research methodology and target goals',
        'Draft initial abstract, outline and findings',
        'Format bibliography and proofread paper'
      ];
    } else {
      suggestions = [
        `Define scope & core milestones for ${projectName}`,
        'Assign team member roles & project timeline schedules',
        'Draft initial mockups & functional specs draft',
        'Conduct final milestone delivery demo review'
      ];
    }

    aiSuggestedTasks = suggestions;

    let bgTheme = 'aurora';
    if (nameLower.includes('web') || nameLower.includes('app') || nameLower.includes('site') || nameLower.includes('design')) bgTheme = 'tech';
    else if (nameLower.includes('research') || nameLower.includes('paper') || nameLower.includes('study') || nameLower.includes('college')) bgTheme = 'calm';

    const themeUrls = {
      tech: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800')",
      calm: "url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=800')",
      aurora: "url('https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=800')"
    };
    aiSuggestedBg = themeUrls[bgTheme] || themeUrls.aurora;

    showToast(`AI successfully generated ${suggestions.length} suggestions and custom workspace background.`);
    aiSuggestBtn.innerHTML = '✨ AI Suggested (Ready)';
  }, 1500);
});

toggleButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveEntity(button.dataset.target));
});

openModalButtons.forEach((button) => button.addEventListener('click', openModal));
closeModalButtons.forEach((button) => button.addEventListener('click', closeModal));
openLabelModalButtons.forEach((button) => button.addEventListener('click', openLabelModal));
closeLabelModalButtons.forEach((button) => button.addEventListener('click', closeLabelModal));

if (modal) {
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  const modalSearch = modal.querySelector('.modal-search input');
  modalSearch?.addEventListener('input', renderExistingTasksForModal);

  modal.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-task-select]');
    if (!checkbox) return;
    const taskId = checkbox.value;
    if (checkbox.checked) {
      if (!selectedTasksForNewProject.includes(taskId)) {
        selectedTasksForNewProject.push(taskId);
      }
    } else {
      selectedTasksForNewProject = selectedTasksForNewProject.filter(id => id !== taskId);
    }
    updateSelectedTasksCount();
  });
}

if (labelModal) {
  labelModal.addEventListener('click', (event) => {
    if (event.target === labelModal) {
      closeLabelModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal();
    closeLabelModal();
  }
});

dateInputs.forEach((input) => {
  const syncInputState = () => {
    const timeInput = input.closest('.field')?.querySelector('[data-time-input]');
    if (!timeInput) return;
    timeInput.disabled = !input.value;
  };

  input.addEventListener('change', syncInputState);
  input.addEventListener('input', syncInputState);
});

selectedLabelContainer?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-label]');
  if (!button) return;
  removeLabelSelection(button.dataset.removeLabel);
});

attachmentList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-attachment]');
  if (!button) return;
  selectedAttachments.splice(Number(button.dataset.removeAttachment), 1);
  renderAttachments();
});

labelOptionsContainer?.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[type="checkbox"]');
  if (!checkbox) return;
  const label = checkbox.value;
  if (checkbox.checked) {
    addLabelSelection(label);
  } else {
    removeLabelSelection(label);
  }
});

labelSearchInput?.addEventListener('input', renderLabelOptions);
createLabelButton?.addEventListener('click', handleCreateLabel);
newLabelInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleCreateLabel();
  }
});

openAttachmentsButtons.forEach(btn => {
  btn.addEventListener('click', () => attachmentInput?.click());
});
attachmentInput?.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);
  selectedAttachments = [
    ...selectedAttachments,
    ...files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || 'unknown',
    })),
  ];
  renderAttachments();
  event.target.value = '';
});

// Init page
async function init() {
  if (window.NexusAPI) {
    const data = await window.NexusAPI.getUserData();
    if (data) {
      tasks = data.tasks || [];
      projects = data.projects || [];
    }
    if (currentUser && currentUser.role === 'admin' && window.NexusAPI.fetchBackendOrgUsers) {
      orgUsers = await window.NexusAPI.fetchBackendOrgUsers();
      const assigneeList = document.getElementById('assigneeList');
      if (assigneeList) {
        let optionsHTML = `<option value="">Myself (Unassigned)</option>`;
        optionsHTML += `<option value="ORG_TASK">Entire Organization</option>`;
        orgUsers.forEach(u => {
          optionsHTML += `<option value="${u.email}">${u.name} (${u.email})</option>`;
        });
        assigneeList.innerHTML = optionsHTML;
      }
    }
  }

  syncTimeInputStates();
  renderSelectedLabels();
  renderAttachments();
  setActiveEntity('task');
  populateProjectDropdown();
  updateSelectedTasksCount();
}
init();
