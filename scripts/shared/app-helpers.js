(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.AppHelpers = api;
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

  function filterTasks(tasks, query, priority, dueFilter) {
    const search = query.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesQuery = !search || task.title.toLowerCase().includes(search);
      const matchesPriority = !priority || priority === 'All' || task.priority === priority;

      let matchesDue = true;
      if (dueFilter && dueFilter !== 'All') {
        const today = new Date();
        const dueDate = task.dueDate ? new Date(task.dueDate) : null;

        if (dueFilter === 'Upcoming') {
          matchesDue = dueDate && dueDate >= today;
        } else if (dueFilter === 'Overdue') {
          matchesDue = dueDate && dueDate < today;
        } else if (dueFilter === 'This Week') {
          const end = new Date(today);
          end.setDate(today.getDate() + 7);
          matchesDue = dueDate && dueDate >= today && dueDate <= end;
        }
      }

      return matchesQuery && matchesPriority && matchesDue;
    });
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

  return {
    isValidEmail,
    validateAuthFields,
    createUserProfile,
    buildTaskSuggestions,
    filterTasks,
    getDueSoonTasks,
    getTaskSummary
  };
});
