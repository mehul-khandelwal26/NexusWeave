(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.AppHelpers = api;

  document.addEventListener('keydown', (event) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      const addTaskBtn = document.getElementById('addTask');
      if (addTaskBtn) {
        addTaskBtn.click();
      } else {
        const path = window.location.pathname;
        const isOnLanding = path.endsWith('index.html') || path.endsWith('/') || path === '';
        if (!isOnLanding) {
          window.location.href = 'create.html?type=task';
        }
      }
    } else if (event.key === '/') {
      const searchInput = document.getElementById('taskSearch') || document.getElementById('dashboardTaskSearch');
      if (searchInput) {
        event.preventDefault();
        searchInput.focus();
      }
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateAuthFields(email, password) {
    const errors = [];

    if (!email.trim()) {
      errors.push('Email is required.');
    } else if (!isValidEmail(email)) {
      errors.push('Please enter a valid email address.');
    }

    if (!password.trim()) {
      errors.push('Password is required.');
    }

    return { valid: errors.length === 0, errors };
  }

  function createUserProfile(email, password) {
    return {
      email,
      password,
      theme: 'light',
      projects: [],
      tasks: [],
      activity: [],
      createdAt: Date.now()
    };
  }

  function buildTaskSuggestions(projectName) {
    const base = projectName.trim() || 'your project';
    const today = new Date();

    function addDays(days) {
      const next = new Date(today);
      next.setDate(today.getDate() + days);
      return next.toISOString().slice(0, 10);
    }

    return [
      { title: `Plan the first milestone for ${base}`, priority: 'High', dueDate: addDays(2), status: 'Todo', description: 'Capture the initial success criteria.' },
      { title: `Share the ${base} brief with stakeholders`, priority: 'Medium', dueDate: addDays(5), status: 'Todo', description: 'Collect perspectives and align priorities.' },
      { title: `Review launch tasks for ${base}`, priority: 'Low', dueDate: addDays(8), status: 'Todo', description: 'Check the delivery checklist before handoff.' }
    ];
  }

  function normalizeTask(task, fallbackProjectId) {
    const labels = Array.isArray(task?.labels)
      ? task.labels
      : typeof task?.labels === 'string'
        ? task.labels.split(',').map((label) => label.trim()).filter(Boolean)
        : [];

    return {
      ...task,
      title: task?.title || 'Untitled task',
      status: task?.status || 'Todo',
      priority: task?.priority || 'Medium',
      description: task?.description || '',
      dueDate: task?.dueDate || '',
      projectId: task?.projectId || fallbackProjectId || null,
      labels,
      attachments: Array.isArray(task?.attachments) ? task.attachments : []
    };
  }

  function formatDisplayDate(value) {
    if (!value) return 'No deadline';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No deadline';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getPriorityTone(priority) {
    switch (priority) {
      case 'High': return 'priority-high';
      case 'Low': return 'priority-low';
      default: return 'priority-medium';
    }
  }

  function getTaskStatusTone(status) {
    switch (status) {
      case 'Done': return 'status-done';
      case 'In Progress': return 'status-progress';
      default: return 'status-todo';
    }
  }

  function getTaskDueState(task) {
    if (!task?.dueDate || task.status === 'Done') return 'on-track';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    if (Number.isNaN(dueDate.getTime())) return 'on-track';
    const diff = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'overdue';
    if (diff <= 2) return 'soon';
    return 'upcoming';
  }

  function filterTasks(tasks, filters = {}, projects = []) {
    const search = (filters.query || '').trim().toLowerCase();
    const projectLookup = new Map((projects || []).map((project) => [project.id, project]));

    return tasks.filter((task) => {
      const normalizedTask = normalizeTask(task);
      const matchesQuery = !search || [normalizedTask.title, normalizedTask.description, normalizedTask.priority, normalizedTask.status, ...(normalizedTask.labels || []), projectLookup.get(normalizedTask.projectId)?.name || '']
        .join(' ')
        .toLowerCase()
        .includes(search);

      const matchesPriority = !filters.priority || filters.priority === 'All' || normalizedTask.priority === filters.priority;
      const matchesStatus = !filters.status || filters.status === 'All' || normalizedTask.status === filters.status;
      const matchesProject = !filters.project || filters.project === 'All' || normalizedTask.projectId === filters.project;
      const matchesLabel = !filters.label || filters.label === 'All' || !filters.label.trim() || (normalizedTask.labels || []).includes(filters.label.trim());

      let matchesDue = true;
      if (filters.dueRange && filters.dueRange !== 'All') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = normalizedTask.dueDate ? new Date(normalizedTask.dueDate) : null;
        if (dueDate) {
          dueDate.setHours(0, 0, 0, 0);
        }

        if (filters.dueRange === 'Upcoming') {
          matchesDue = dueDate && dueDate >= today;
        } else if (filters.dueRange === 'Overdue') {
          matchesDue = dueDate && dueDate < today;
        } else if (filters.dueRange === 'This Week') {
          const end = new Date(today);
          end.setDate(today.getDate() + 7);
          matchesDue = dueDate && dueDate >= today && dueDate <= end;
        }
      }

      return matchesQuery && matchesPriority && matchesStatus && matchesProject && matchesLabel && matchesDue;
    });
  }

  function sortTasks(tasks, sortKey = 'updatedAt', direction = 'desc') {
    const sorted = [...tasks].sort((left, right) => {
      const leftValue = left[sortKey] || '';
      const rightValue = right[sortKey] || '';

      if (sortKey === 'dueDate') {
        const leftDate = leftValue ? new Date(leftValue).getTime() : Number.POSITIVE_INFINITY;
        const rightDate = rightValue ? new Date(rightValue).getTime() : Number.POSITIVE_INFINITY;
        return leftDate - rightDate;
      }

      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        return leftValue.localeCompare(rightValue);
      }

      return (leftValue > rightValue ? 1 : -1);
    });

    return direction === 'desc' ? sorted.reverse() : sorted;
  }

  function getDueSoonTasks(tasks) {
    const today = new Date();
    const soon = new Date(today);
    soon.setDate(today.getDate() + 3);

    return tasks.filter((task) => {
      if (!task.dueDate || task.status === 'Done') {
        return false;
      }
      const dueDate = new Date(task.dueDate);
      return dueDate >= today && dueDate <= soon;
    });
  }

  function getTaskSummary(tasks) {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === 'Done').length;
    const inProgress = tasks.filter((task) => task.status === 'In Progress').length;

    return { total, done, inProgress };
  }

  function getProjectProgress(project, tasks) {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    if (!projectTasks.length) return 0;
    const done = projectTasks.filter((task) => task.status === 'Done').length;
    return Math.round((done / projectTasks.length) * 100);
  }

  function getWeeklyCompletion(tasks) {
    const counts = Array.from({ length: 7 }, (_, index) => ({ day: index, value: 0 }));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tasks.filter((task) => task.status === 'Done').forEach((task) => {
      if (!task.completedAt) return;
      const completedAt = new Date(task.completedAt);
      const diffDays = Math.floor((today - completedAt) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        counts[6 - diffDays].value += 1;
      }
    });

    return counts.map((item, index) => ({
      ...item,
      label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]
    }));
  }

  return {
    isValidEmail,
    validateAuthFields,
    createUserProfile,
    buildTaskSuggestions,
    normalizeTask,
    formatDisplayDate,
    getPriorityTone,
    getTaskStatusTone,
    getTaskDueState,
    filterTasks,
    sortTasks,
    getDueSoonTasks,
    getTaskSummary,
    getProjectProgress,
    getWeeklyCompletion
  };
});
