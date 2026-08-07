document.addEventListener('DOMContentLoaded', async () => {
  const api = window.NexusAPI;
  
  // Wait for authentication
  let currentUser = api.getMe();
  if (!currentUser) {
    try {
      await api.fetchBackendUser();
      currentUser = api.getMe();
    } catch (e) {
      console.warn("Could not authenticate user", e);
    }
  }

  if (!currentUser) {
    window.location.href = '../index.html';
    return;
  }

  const projectGrid = document.getElementById('projectGrid');
  const emptyState = document.getElementById('emptyState');
  const projectSearch = document.getElementById('projectSearch');

  const drawer = document.getElementById('projectDrawer');
  const drawerTitle = document.getElementById('drawerProjectTitle');
  const drawerMeta = document.getElementById('drawerProjectMeta');
  const drawerDescription = document.getElementById('drawerProjectDescription');
  const drawerDetails = document.getElementById('drawerProjectDetails');
  const drawerTasks = document.getElementById('drawerProjectTasks');
  const closeDrawerBtn = document.getElementById('closeProjectDrawer');

  let allProjects = [];
  let allTasks = [];
  let activeProjectId = null;

  async function loadData() {
    try {
      // Fetch fresh data from backend
      const projectsRes = await api.tryBackendRequest('/api/projects');
      if (projectsRes) {
        allProjects = projectsRes;
      } else {
        allProjects = currentUser.projects || [];
      }

      const tasksRes = await api.tryBackendRequest('/api/tasks');
      if (tasksRes) {
        allTasks = tasksRes;
      } else {
        allTasks = currentUser.tasks || [];
      }

      renderProjects();
    } catch (err) {
      console.error('Failed to load project data:', err);
      // fallback
      allProjects = currentUser.projects || [];
      allTasks = currentUser.tasks || [];
      renderProjects();
    }
  }

  function renderProjects(query = '') {
    const filtered = allProjects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || (p.description && p.description.toLowerCase().includes(query.toLowerCase())));

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      projectGrid.innerHTML = '';
      return;
    }

    emptyState.classList.add('hidden');
    projectGrid.innerHTML = filtered.map(p => {
      const pTasks = allTasks.filter(t => t.projectId === (p.id || p._id));
      const completed = pTasks.filter(t => t.status === 'Done').length;
      const progress = pTasks.length > 0 ? Math.round((completed / pTasks.length) * 100) : 0;
      
      const deadlineStr = p.deadline ? new Date(p.deadline).toLocaleDateString() : 'No deadline';
      const statusIcon = p.timelineStatus === 'Execution' ? '🚀' : '📝';
      
      return `
        <article class="task-card" data-project-id="${p.id || p._id}" style="cursor:pointer; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div class="task-header">
              <span class="task-priority medium">${statusIcon} ${p.timelineStatus || 'Planning'}</span>
            </div>
            <h3 class="task-title" style="margin-top: 0.5rem;">${p.name}</h3>
            <p class="task-meta" style="margin-top: 0.25rem;">📅 ${deadlineStr}</p>
          </div>
          <div style="margin-top: 1rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--ink-soft); margin-bottom:0.25rem;">
              <span>Progress</span>
              <span>${progress}%</span>
            </div>
            <div style="width:100%; background:var(--border); height:6px; border-radius:3px; overflow:hidden;">
              <div style="height:100%; background:var(--accent); width:${progress}%; transition:width 0.3s;"></div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderProjectDrawer(projectId) {
    const project = allProjects.find(p => (p.id || p._id) === projectId);
    if (!project) return;
    
    activeProjectId = projectId;
    drawerTitle.textContent = project.name;
    
    const deadlineStr = project.deadline ? new Date(project.deadline).toLocaleDateString() : 'None set';
    drawerMeta.textContent = `📅 Deadline: ${deadlineStr} • ⏱️ Status: ${project.timelineStatus || 'Planning'}`;
    drawerDescription.textContent = project.description || 'No description provided.';
    
    let detailsHtml = '';
    
    if (project.labels && project.labels.length > 0) {
      detailsHtml += `<div style="margin-top:1rem;"><strong>Labels:</strong><div class="task-labels" style="margin-top:0.5rem;">${project.labels.map(l => `<span class="task-label">${l}</span>`).join('')}</div></div>`;
    }
    
    if (project.attachments && project.attachments.length > 0) {
      detailsHtml += `<div style="margin-top:1rem;"><strong>Attachments:</strong><ul style="margin-top:0.5rem; padding-left:1.5rem; color:var(--ink-soft); font-size:0.85rem;">${project.attachments.map(a => `<li>${a}</li>`).join('')}</ul></div>`;
    }
    
    drawerDetails.innerHTML = detailsHtml;

    // Render project tasks
    const pTasks = allTasks.filter(t => t.projectId === projectId);
    if (pTasks.length === 0) {
      drawerTasks.innerHTML = '<p class="text-soft" style="font-size:0.85rem;">No tasks assigned to this project yet.</p>';
    } else {
      drawerTasks.innerHTML = pTasks.map(t => {
        let statusBadge = '';
        if (t.status === 'Done') statusBadge = '<span style="color:var(--success);font-size:0.8rem;">✓ Done</span>';
        else if (t.status === 'In Progress') statusBadge = '<span style="color:var(--accent);font-size:0.8rem;">⌛ In Progress</span>';
        else statusBadge = '<span style="color:var(--ink-soft);font-size:0.8rem;">○ Todo</span>';
        
        return `
          <div style="padding: 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight: 500; font-size:0.9rem;">${t.title}</div>
              <div style="font-size:0.8rem; color:var(--ink-soft); margin-top:0.2rem;">${t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString()}` : 'No due date'}</div>
            </div>
            <div>${statusBadge}</div>
          </div>
        `;
      }).join('');
    }

    drawer.classList.add('is-open');
  }

  if (projectGrid) {
    projectGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.task-card');
      if (card) {
        renderProjectDrawer(card.dataset.projectId);
      }
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      drawer.classList.remove('is-open');
      activeProjectId = null;
    });
  }

  if (projectSearch) {
    projectSearch.addEventListener('input', (e) => {
      renderProjects(e.target.value);
    });
  }

  // Initial load
  loadData();
});
