/* ============================================================
   NexusWeave — User Profile Controller (profile.js)
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const tracker = window.NexusTracker;

  const currentUser = api.getMe();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  /* ── DOM Elements ── */
  const userProfileAvatar = document.getElementById('userProfileAvatar');
  const userProfileName = document.getElementById('userProfileName');
  const userProfileEmail = document.getElementById('userProfileEmail');
  const userProfileRoleBadge = document.getElementById('userProfileRoleBadge');
  const userProfileDepartment = document.getElementById('userProfileDepartment');
  const userProfileOrg = document.getElementById('userProfileOrg');
  const userProfileBio = document.getElementById('userProfileBio');
  const userProfileSkills = document.getElementById('userProfileSkills');
  const userProfileActivityFeed = document.getElementById('userProfileActivityFeed');

  const profProjectsCount = document.getElementById('profProjectsCount');
  const profCompletedTasks = document.getElementById('profCompletedTasks');
  const profProductivityScore = document.getElementById('profProductivityScore');
  const profWeeklyHours = document.getElementById('profWeeklyHours');

  // Edit Modal Elements
  const editProfileModal = document.getElementById('editProfileModal');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const closeEditProfModal = document.getElementById('closeEditProfModal');
  const cancelEditProfModal = document.getElementById('cancelEditProfModal');
  const editProfileForm = document.getElementById('editProfileForm');
  const editProfName = document.getElementById('editProfName');
  const editProfDepartment = document.getElementById('editProfDepartment');
  const editProfBio = document.getElementById('editProfBio');
  const editProfSkills = document.getElementById('editProfSkills');
  const shareProfileBtn = document.getElementById('shareProfileBtn');

  function renderProfile() {
    const freshUser = api.getMe();
    const user = freshUser || currentUser;
    const isAdmin = user.role === 'admin';
    const orgInfo = user.organizationId ? api.getOrganization(user.organizationId) : null;

    if (userProfileAvatar) userProfileAvatar.textContent = (user.name || user.email).charAt(0).toUpperCase();
    if (userProfileName) userProfileName.textContent = user.name || 'User';
    if (userProfileEmail) userProfileEmail.textContent = user.email;
    if (userProfileRoleBadge) {
      userProfileRoleBadge.textContent = isAdmin ? '🛡️ Admin' : '👤 Employee';
      userProfileRoleBadge.className = `org-badge ${isAdmin ? 'badge-admin' : 'badge-employee'}`;
    }

    if (userProfileDepartment) userProfileDepartment.textContent = `🏢 ${user.department || 'General'}`;
    if (userProfileOrg) userProfileOrg.textContent = orgInfo ? orgInfo.name : 'Personal Workspace';

    if (userProfileBio) {
      userProfileBio.textContent = user.bio || 'No bio written yet. Click "Edit Profile" to add your bio and role description.';
    }

    // Skills
    if (userProfileSkills) {
      const skills = user.skills || ['JavaScript', 'Task Management', 'Agile Sprints', 'Collaboration'];
      userProfileSkills.innerHTML = skills.map(s => `<span class="filter-chip">${s}</span>`).join('');
    }

    // Metrics
    const tasks = user.tasks || [];
    const completed = tasks.filter(t => t.status === 'Done').length;
    const score = tracker ? tracker.calculateProductivityScore(user) : 85;
    const hours = tracker ? tracker.calculateWorkingHours(user.email, 'weekly') : 38;

    if (profProjectsCount) profProjectsCount.textContent = (user.projects || []).length;
    if (profCompletedTasks) profCompletedTasks.textContent = completed;
    if (profProductivityScore) profProductivityScore.textContent = `${score}%`;
    if (profWeeklyHours) profWeeklyHours.textContent = `${hours}h`;

    // Activity Feed
    if (userProfileActivityFeed) {
      const activity = user.activity || [];
      if (!activity.length) {
        userProfileActivityFeed.innerHTML = `<div class="empty-inline">No recent activity logged.</div>`;
      } else {
        userProfileActivityFeed.innerHTML = activity.slice(0, 8).map(act => `
          <div class="activity-item">
            <span>${act.text || act.message || JSON.stringify(act)}</span>
          </div>
        `).join('');
      }
    }
  }

  // Edit Modal Event Listeners
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      const user = api.getMe();
      if (editProfName) editProfName.value = user.name || '';
      if (editProfDepartment) editProfDepartment.value = user.department || 'Engineering';
      if (editProfBio) editProfBio.value = user.bio || '';
      if (editProfSkills) editProfSkills.value = (user.skills || ['JavaScript', 'Agile Sprints']).join(', ');
      editProfileModal.classList.remove('hidden');
    });
  }

  function closeEditModal() {
    if (editProfileModal) editProfileModal.classList.add('hidden');
  }

  if (closeEditProfModal) closeEditProfModal.addEventListener('click', closeEditModal);
  if (cancelEditProfModal) cancelEditProfModal.addEventListener('click', closeEditModal);

  if (editProfileForm) {
    editProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      const email = localStorage.getItem('session');

      if (users[email]) {
        users[email].name = editProfName.value.trim();
        users[email].department = editProfDepartment.value.trim();
        users[email].bio = editProfBio.value.trim();
        users[email].skills = editProfSkills.value.split(',').map(s => s.trim()).filter(Boolean);
        localStorage.setItem('users', JSON.stringify(users));
      }

      closeEditModal();
      renderProfile();
    });
  }

  if (shareProfileBtn) {
    shareProfileBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(window.location.href).then(() => {
        alert('Public profile link copied to clipboard!');
      }).catch(() => {
        alert('Copied profile URL!');
      });
    });
  }

  renderProfile();
})();
