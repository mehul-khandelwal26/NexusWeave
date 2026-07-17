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
const selectedLabelContainer = document.querySelector('[data-label-chips]');
const attachmentInput = document.querySelector('[data-attachment-input]');
const attachmentList = document.querySelector('[data-attachment-list]');
const openAttachmentsButton = document.querySelector('[data-open-attachments]');
const STORAGE_KEYS = {
  tasks: 'nexusweave.tasks',
  labels: 'nexusweave.labels',
  projects: 'nexusweave.projects',
};
const DEFAULT_LABELS = ['Work', 'College', 'Personal', 'Urgent', 'Meeting'];
let tasks = loadTasks();
let labels = loadLabels();
let projects = loadProjects();
let selectedLabels = [];
let selectedAttachments = [];
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
};

function openModal() {
  if (!modal) return;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
};

function closeModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
};

function openLabelModal() {
  if (!labelModal) return;
  renderLabelOptions();
  labelModal.classList.add('is-open');
  labelModal.setAttribute('aria-hidden', 'false');
};

function closeLabelModal() {
  if (!labelModal) return;
  labelModal.classList.remove('is-open');
  labelModal.setAttribute('aria-hidden', 'true');
};

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.tasks);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Unable to load tasks', error);
    return [];
  }
};

function loadLabels() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.labels);
    return stored ? JSON.parse(stored) : [...DEFAULT_LABELS];
  } catch (error) {
    console.warn('Unable to load labels', error);
    return [...DEFAULT_LABELS];
  }
};

function saveTasks() {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
};

function saveLabels() {
  localStorage.setItem(STORAGE_KEYS.labels, JSON.stringify(labels));
};

function loadProjects() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.projects);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Unable to load projects', error);
    return [];
  }
};

function saveProjects() {
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
};

function getProjectFormValues() {
  return {
    name: projectForm?.querySelector('#project-name')?.value || '',
    description: projectForm?.querySelector('#project-description')?.value || '',
    color: projectForm?.querySelector('#project-color')?.value || '#7c3aed',
    status: projectForm?.querySelector('#project-status')?.value || 'active',
  };
}

function validateProjectForm(values) {
  if (!values.name.trim()) {
    return 'Project Name is required.';
  }

  return null;
};

function buildProjectObject(values) {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: values.name.trim(),
    description: values.description.trim(),
    color: values.color || '#7c3aed',
    status: values.status || 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function resetProjectForm() {
  if (!projectForm) return;
  projectForm.reset();
  showFeedback('');
}

function handleProjectSubmit(event) {
  event.preventDefault();
  const values = getProjectFormValues();
  const validationError = validateProjectForm(values);

  if (validationError) {
    showFeedback(validationError, 'error');
    return;
  }

  const project = buildProjectObject(values);
  projects = [...projects, project];
  saveProjects();
  showFeedback('Project created successfully.', 'success');
  showToast('Project created successfully.');
  resetProjectForm();
};

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
};

function showFeedback(message, type = 'success') {
  const feedbackTarget = projectFeedback || taskFeedback;
  if (!feedbackTarget) return;
  feedbackTarget.textContent = message;
  feedbackTarget.className = message ? `form-message ${type}` : 'form-message';
};

function showToast(message) {
  if (!taskToast) return;
  taskToast.textContent = message;
  taskToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => taskToast.classList.remove('show'), 2400);
};

function getTaskFormValues() {
  return {
  title: taskForm?.querySelector('#task-name')?.value || '',
  description: taskForm?.querySelector('#task-description')?.value || '',
  project: taskForm?.querySelector('#task-project')?.value || '',
  priority: taskForm?.querySelector('#task-priority')?.value || 'none',
  status: taskForm?.querySelector('#task-status')?.value || 'todo',
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
};

function buildTaskObject(values) {
  return {
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: values.title.trim(),
  description: values.description.trim(),
  project: values.project || null,
  priority: values.priority,
  status: values.status,
  deadline: values.deadlineDate ? { date: values.deadlineDate, time: values.deadlineTime || null } : null,
  reminder: values.reminderDate ? { date: values.reminderDate, time: values.reminderTime || null } : null,
  labels: [...selectedLabels],
  attachments: [...selectedAttachments],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  };
}

function resetTaskForm() {
  if (!taskForm) return;
  taskForm.reset();
  selectedLabels = [];
  selectedAttachments = [];
  renderSelectedLabels();
  renderAttachments();
  syncTimeInputStates();
  showFeedback('');
}

function renderSelectedLabels() {
  if (!selectedLabelContainer) return;
  if (!selectedLabels.length) {
    selectedLabelContainer.innerHTML = '';
    return;
  }

  selectedLabelContainer.innerHTML = selectedLabels
    .map((label) => `
      <button class="chip" type="button" data-remove-label="${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
        <span>×</span>
      </button>
    `)
    .join('');
}

function renderAttachments() {
  if (!attachmentList) return;
  if (!selectedAttachments.length) {
    attachmentList.innerHTML = '<p class="empty-state-inline">No attachments selected</p>';
    return;
  }

  attachmentList.innerHTML = selectedAttachments
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

function handleTaskSubmit(event) {
  event.preventDefault();
  const values = getTaskFormValues();
  const validationError = validateTaskForm(values);

  if (validationError) {
    showFeedback(validationError, 'error');
    return;
  }

  const task = buildTaskObject(values);
  tasks = [...tasks, task];
  saveTasks();
  showFeedback('Task created successfully.', 'success');
  showToast('Task created successfully.');
  resetTaskForm();
};

resetTaskFormButton?.addEventListener('click', resetTaskForm);
taskForm?.addEventListener('submit', handleTaskSubmit);
projectForm?.addEventListener('submit', handleProjectSubmit);

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

openAttachmentsButton?.addEventListener('click', () => attachmentInput?.click());
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

syncTimeInputStates();
renderSelectedLabels();
renderAttachments();
setActiveEntity('task');
