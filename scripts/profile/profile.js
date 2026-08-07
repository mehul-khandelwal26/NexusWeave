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
      const isPersonal = user.role === 'personal';
      userProfileRoleBadge.textContent = isPersonal ? '👤 Personal' : isAdmin ? '🛡️ Admin' : '👤 Employee';
      userProfileRoleBadge.className = `org-badge ${isPersonal ? 'badge-personal' : isAdmin ? 'badge-admin' : 'badge-employee'}`;
    }

    if (userProfileDepartment) userProfileDepartment.textContent = `🏢 ${user.department || (user.role === 'personal' ? 'Individual' : 'Engineering')}`;
    if (userProfileOrg) userProfileOrg.textContent = orgInfo ? orgInfo.name : 'Personal Workspace';

    if (userProfileBio) {
      userProfileBio.textContent = user.bio || 'No bio written yet. Click "Edit Profile" to add your bio and role description.';
    }

    // Skills
    if (userProfileSkills) {
      const skills = user.skills || [];
      userProfileSkills.innerHTML = skills.length
        ? skills.map(s => `<span class="filter-chip">${s}</span>`).join('')
        : `<span class="empty-inline">No skills added yet.</span>`;
    }

    // Metrics
    const tasks = user.tasks || [];
    const completed = tasks.filter(t => t.status === 'Done').length;
    const score = tracker ? tracker.calculateProductivityScore(user) : 0;

    if (profProjectsCount) profProjectsCount.textContent = (user.projects || []).length;
    if (profCompletedTasks) profCompletedTasks.textContent = completed;
    if (profProductivityScore) profProductivityScore.textContent = tasks.length ? `${score}%` : '—';

    if (profWeeklyHours && api.fetchFocusSummary) {
      api.fetchFocusSummary(7)
        .then((summary) => { profWeeklyHours.textContent = `${summary ? summary.totalHours : 0}h`; })
        .catch(() => { profWeeklyHours.textContent = '0h'; });
    }

    // Render Profile Heatmap Grid
    renderProfileHeatmap(tasks);
  }

  async function renderActivityFeed() {
    if (!userProfileActivityFeed) return;

    const activity = api.fetchActivity ? await api.fetchActivity({ scope: 'me', limit: 12 }) : null;

    if (!activity) {
      userProfileActivityFeed.innerHTML = `<div class="empty-inline">Could not load activity from the server.</div>`;
      return;
    }
    if (!activity.length) {
      userProfileActivityFeed.innerHTML = `<div class="empty-inline">No recent activity logged.</div>`;
      return;
    }

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML)
      ? AppHelpers.escapeHTML(s)
      : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    userProfileActivityFeed.innerHTML = activity.slice(0, 8).map(act => `
      <div class="activity-item">
        <span>${esc(act.text)}</span>
        <small style="display:block;color:var(--ink-soft);font-size:0.72rem;">${esc(new Date(act.createdAt).toLocaleString())}</small>
      </div>
    `).join('');
  }

  function renderProfileHeatmap(tasks) {
    const grid = document.getElementById('profHeatmapGrid');
    if (!grid) return;

    const completionMap = {};
    tasks.forEach(t => {
      if (t.status === 'Done' && t.completedAt) {
        const dateKey = new Date(t.completedAt).toISOString().split('T')[0];
        completionMap[dateKey] = (completionMap[dateKey] || 0) + 1;
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    let cellsHTML = '';
    let totalContributions = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    for (let d = 0; d < 365; d++) {
      const currentDate = new Date(startDate.getTime() + d * 86400000);
      const dateKey = currentDate.toISOString().split('T')[0];
      const count = completionMap[dateKey] || 0;

      totalContributions += count;

      if (count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }

      let intensity = 0;
      if (count === 1) intensity = 1;
      else if (count === 2) intensity = 2;
      else if (count === 3) intensity = 3;
      else if (count >= 4) intensity = 4;

      const formattedDate = currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const tooltip = `${count} task(s) completed on ${formattedDate}`;

      cellsHTML += `<div class="heatmap-cell level-${intensity}" title="${tooltip}"></div>`;
    }

    let checkDate = new Date(today);
    let todayKey = checkDate.toISOString().split('T')[0];
    if (!completionMap[todayKey]) {
      checkDate.setDate(checkDate.getDate() - 1);
      todayKey = checkDate.toISOString().split('T')[0];
    }
    while (completionMap[todayKey] && completionMap[todayKey] > 0) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      todayKey = checkDate.toISOString().split('T')[0];
    }

    grid.innerHTML = cellsHTML;

    const currentStreakEl = document.getElementById('profCurrentStreak');
    const longestStreakEl = document.getElementById('profLongestStreak');
    const totalContributionsEl = document.getElementById('profTotalContributions');

    if (currentStreakEl) currentStreakEl.textContent = `${currentStreak} Days`;
    if (longestStreakEl) longestStreakEl.textContent = `${longestStreak} Days`;
    if (totalContributionsEl) totalContributionsEl.textContent = `${totalContributions}`;
  }

  // Edit Modal Event Listeners
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      const user = api.getMe();
      if (editProfName) editProfName.value = user.name || '';
      if (editProfDepartment) editProfDepartment.value = user.department || 'Engineering';
      if (editProfBio) editProfBio.value = user.bio || '';
      if (editProfSkills) editProfSkills.value = (user.skills || []).join(', ');
      editProfileModal.classList.remove('hidden');
    });
  }

  function closeEditModal() {
    if (editProfileModal) editProfileModal.classList.add('hidden');
  }

  if (closeEditProfModal) closeEditProfModal.addEventListener('click', closeEditModal);
  if (cancelEditProfModal) cancelEditProfModal.addEventListener('click', closeEditModal);

  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await api.updateProfile({
        name: editProfName.value.trim(),
        department: editProfDepartment.value.trim(),
        bio: editProfBio.value.trim(),
        skills: editProfSkills.value.split(',').map(s => s.trim()).filter(Boolean)
      });
      if (!result.success) {
        alert(result.error || 'Failed to save profile.');
        return;
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

  async function bootstrapProfile() {
    try {
      if (api.refreshMe) {
        const refreshed = await api.refreshMe();
        if (refreshed) {
          Object.assign(currentUser, refreshed);
        }
      }
      const data = await api.getUserData();
      if (data) {
        currentUser.tasks = data.tasks || [];
        currentUser.projects = data.projects || [];
        api.saveUserData({ projects: data.projects, tasks: data.tasks });
      }
    } catch (err) {
      console.warn('Profile refresh failed; showing local data.', err);
    }
    renderProfile();
    renderActivityFeed();
  }

  // Render immediately, then refresh from server
  renderProfile();
  bootstrapProfile();
})();
