(function () {
  const DB_KEY = 'users';
  const SESSION_KEY = 'session';
  const helpers = window.AppHelpers;

  let currentUser = window.NexusAPI ? window.NexusAPI.getMe() : null;

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // DOM Elements
  const overallCompletionRateEl = document.getElementById('overallCompletionRate');
  const todoCountEl = document.getElementById('todoCount');
  const progressCountEl = document.getElementById('progressCount');
  const completedCountEl = document.getElementById('completedCount');

  const highPriorityPctEl = document.getElementById('highPriorityPct');
  const mediumPriorityPctEl = document.getElementById('mediumPriorityPct');
  const lowPriorityPctEl = document.getElementById('lowPriorityPct');

  const highPriorityBarEl = document.getElementById('highPriorityBar');
  const mediumPriorityBarEl = document.getElementById('mediumPriorityBar');
  const lowPriorityBarEl = document.getElementById('lowPriorityBar');

  const projectProgressListEl = document.getElementById('projectProgressList');
  const actionItemsListEl = document.getElementById('actionItemsList');

  function calculateAndRender() {
    const tasks = currentUser.tasks || [];
    const projects = currentUser.projects || [];

    // Overall metrics
    const totalTasks = tasks.length;
    const todoTasks = tasks.filter(t => t.status === 'Todo').length;
    const progressTasks = tasks.filter(t => t.status === 'In Progress').length;
    const completedTasks = tasks.filter(t => t.status === 'Done').length;

    const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

    if (overallCompletionRateEl) overallCompletionRateEl.textContent = `${completionRate}%`;
    if (todoCountEl) todoCountEl.textContent = todoTasks;
    if (progressCountEl) progressCountEl.textContent = progressTasks;
    if (completedCountEl) completedCountEl.textContent = completedTasks;

    // Priorities
    const highTasks = tasks.filter(t => t.priority === 'High').length;
    const mediumTasks = tasks.filter(t => t.priority === 'Medium').length;
    const lowTasks = tasks.filter(t => t.priority === 'Low').length;

    const highPct = totalTasks ? Math.round((highTasks / totalTasks) * 100) : 0;
    const mediumPct = totalTasks ? Math.round((mediumTasks / totalTasks) * 100) : 0;
    const lowPct = totalTasks ? Math.round((lowTasks / totalTasks) * 100) : 0;

    if (highPriorityPctEl) highPriorityPctEl.textContent = `${highPct}%`;
    if (mediumPriorityPctEl) mediumPriorityPctEl.textContent = `${mediumPct}%`;
    if (lowPriorityPctEl) lowPriorityPctEl.textContent = `${lowPct}%`;

    if (highPriorityBarEl) highPriorityBarEl.style.width = `${highPct}%`;
    if (mediumPriorityBarEl) mediumPriorityBarEl.style.width = `${mediumPct}%`;
    if (lowPriorityBarEl) lowPriorityBarEl.style.width = `${lowPct}%`;

    // Projects
    if (projectProgressListEl) {
      if (!projects.length) {
        projectProgressListEl.innerHTML = '<div class="empty-inline">No projects found.</div>';
      } else {
        projectProgressListEl.innerHTML = projects.map(project => {
          const progress = helpers.getProjectProgress(project, tasks);
          const projectTasksCount = tasks.filter(t => t.projectId === project.id).length;
          return `
            <div class="project-progress-item">
              <div class="project-progress-info">
                <strong>${project.name}</strong>
                <span>${progress}% complete • ${projectTasksCount} task(s)</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${progress}%; background: var(--accent);"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Action Items (Overdue tasks)
    if (actionItemsListEl) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueTasks = tasks.filter(task => {
        if (task.status === 'Done' || !task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < today;
      });

      if (!overdueTasks.length) {
        actionItemsListEl.innerHTML = '<div class="empty-inline">All tasks are on track. Great job!</div>';
      } else {
        actionItemsListEl.innerHTML = overdueTasks.map(task => {
          const projectObj = projects.find(p => p.id === task.projectId);
          const projectName = projectObj ? projectObj.name : 'No project';
          return `
            <div class="action-task-item">
              <div class="action-task-details">
                <strong>${task.title}</strong>
                <span class="text-soft">${projectName} • Overdue since ${helpers.formatDisplayDate(task.dueDate)}</span>
              </div>
              <span class="priority-pill priority-high">Overdue</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  // Handle external storage changes
  window.addEventListener('nexus:tasks-updated', async () => {
    if (window.NexusAPI) {
      const data = await window.NexusAPI.getUserData();
      if (data) {
        currentUser.tasks = data.tasks || [];
        currentUser.projects = data.projects || [];
      }
      calculateAndRender();
    }
  });

  async function init() {
    if (window.NexusAPI) {
      const data = await window.NexusAPI.getUserData();
      if (data) {
        currentUser.tasks = data.tasks || [];
        currentUser.projects = data.projects || [];
      }
    }
    calculateAndRender();
  }

  init();
})();
