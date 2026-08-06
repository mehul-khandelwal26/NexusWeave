(function(root) {
  function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function getUsers() {
    return JSON.parse(localStorage.getItem('users')) || {};
  }

  function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
  }

  function getOrgs() {
    return JSON.parse(localStorage.getItem('nw_orgs')) || [];
  }

  function saveOrgs(orgs) {
    localStorage.setItem('nw_orgs', JSON.stringify(orgs));
  }

  function upsertLocalOrg(org) {
    if (!org || !org.id) return;
    const orgs = getOrgs();
    const idx = orgs.findIndex((o) => o.id === org.id);
    const normalized = {
      id: org.id,
      name: org.name,
      orgKey: org.orgKey,
      visibility: org.visibility || 'public',
      adminEmail: (org.admins && org.admins[0]) || org.createdBy || null,
      members: org.members || [],
      admins: org.admins || [],
      createdAt: org.createdAt || Date.now()
    };
    if (idx >= 0) orgs[idx] = { ...orgs[idx], ...normalized };
    else orgs.push(normalized);
    saveOrgs(orgs);
    return normalized;
  }

  function setSession(user, provider, token) {
    if (!token) {
      throw new Error('Server authentication token is required');
    }
    const sessions = JSON.parse(localStorage.getItem('nw_sessions')) || [];
    const sessionId = generateId('sess');
    sessions.push({
      id: sessionId,
      userId: user.id || user._id,
      token,
      provider,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    localStorage.setItem('nw_sessions', JSON.stringify(sessions));
    localStorage.setItem('session', user.email);
    localStorage.setItem('jwt', token);
    localStorage.setItem('authProvider', provider);
  }

  function applyAuthResponse(backendUser, token, provider) {
    if (!token || !backendUser) return null;
    const email = backendUser.email;
    const users = getUsers();
    const existing = users[email] || {};
    const merged = {
      ...existing,
      id: backendUser.id || backendUser._id || existing.id,
      name: backendUser.name || existing.name || email.split('@')[0],
      email,
      role: backendUser.role || existing.role || 'personal',
      organizationId: backendUser.organizationId || null,
      department: backendUser.department || existing.department || 'Engineering',
      bio: backendUser.bio != null ? backendUser.bio : (existing.bio || ''),
      skills: backendUser.skills || existing.skills || [],
      theme: backendUser.theme || existing.theme || 'light',
      provider: backendUser.provider || provider || 'email',
      projects: existing.projects || [],
      tasks: existing.tasks || [],
      activity: existing.activity || []
    };
    delete merged.password;
    users[email] = merged;
    saveUsers(users);
    setSession(merged, provider || 'email', token);
    return sanitizeUser(merged);
  }

  function clearSession() {
    localStorage.removeItem('session');
    localStorage.removeItem('jwt');
    localStorage.removeItem('authProvider');
  }

  // Relative /api when served by Express on :4000; absolute URL for Live Server / other ports
  const API_BASE = (typeof window !== 'undefined' && window.location && String(window.location.port) === '4000')
    ? '/api'
    : 'http://localhost:4000/api';


  async function tryBackendRequest(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt') || ''}`,
          ...(options.headers || {})
        }
      });
      if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        return {
          _error: true,
          status: 401,
          message: (errData.errors && errData.errors[0]) || 'Session expired. Please log in again.'
        };
      }
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      const errorMsg = (errData.errors && errData.errors[0]) || errData.message || errData.error || 'Server error';
      return { _error: true, status: res.status, message: errorMsg };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function sanitizeUser(user) {
    if (!user) return null;
    const sanitized = { ...user };
    delete sanitized.password;
    return sanitized;
  }

  function syncLocalUserFromServer(userData) {
    if (!userData || !userData.email) return;
    const users = getUsers();
    const existing = users[userData.email] || {};
    users[userData.email] = {
      ...existing,
      ...userData,
      id: userData.id || userData._id || existing.id,
      projects: existing.projects || [],
      tasks: existing.tasks || [],
      activity: existing.activity || []
    };
    delete users[userData.email].password;
    saveUsers(users);
  }

  root.NexusAPI = {
    API_BASE,

    /* ── Auth ── */
    async signup({ name, email, password, role = 'personal', orgName, orgKey, orgVisibility, orgId }) {
      const username = name || email.split('@')[0];
      let token, userData;

      const backendRes = await tryBackendRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: username, email, password, role, orgName, orgKey, orgVisibility, orgId })
      });

      if (backendRes && !backendRes._error) {
        token = backendRes.token;
        userData = backendRes.user;
      } else if (backendRes && backendRes._error) {
        return { success: false, error: backendRes.message || 'Failed to sign up.' };
      } else {
        // Offline Fallback Mode
        token = 'jwt_offline_' + Date.now();
        let orgIdFinal = orgId || null;
        if (role === 'admin' && orgName) {
          orgIdFinal = generateId('org');
          upsertLocalOrg({
            id: orgIdFinal,
            name: orgName,
            orgKey: orgKey || '',
            visibility: orgVisibility || 'public',
            createdBy: email,
            admins: [email],
            members: [email]
          });
        }
        userData = {
          id: generateId('user'),
          name: username,
          email,
          role,
          organizationId: orgIdFinal,
          department: 'Engineering',
          theme: 'dark'
        };
      }

      if (role === 'admin' && orgName && userData.organizationId) {
        upsertLocalOrg({
          id: userData.organizationId,
          name: orgName,
          orgKey: orgKey || '',
          visibility: orgVisibility || 'public',
          createdBy: email,
          admins: [email],
          members: [email]
        });
      }

      const user = applyAuthResponse(userData, token, 'email');
      return { success: true, token, user };
    },

    async login({ email, password, role }) {
      let token, userData;

      const backendRes = await tryBackendRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role })
      });

      if (backendRes && !backendRes._error) {
        token = backendRes.token;
        userData = backendRes.user;
      } else if (backendRes && backendRes._error) {
        return { success: false, error: backendRes.message || 'Invalid email or password.' };
      } else {
        // Offline Fallback Mode
        const users = getUsers();
        const existing = users[email];
        token = 'jwt_offline_' + Date.now();
        if (existing) {
          userData = { ...existing };
        } else {
          userData = {
            id: generateId('user'),
            name: email.split('@')[0],
            email,
            role: role || 'personal',
            department: 'Engineering',
            theme: 'dark'
          };
        }
      }

      const user = applyAuthResponse(userData, token, 'email');
      return { success: true, token, user };
    },

    async logout() {
      clearSession();
      return { success: true };
    },

    getMeSync() {
      const email = localStorage.getItem('session');
      const token = localStorage.getItem('jwt');
      if (!email || !token) return null;

      const users = getUsers();
      const user = users[email];
      if (!user) {
        return {
          email,
          name: email.split('@')[0],
          role: 'personal',
          projects: [],
          tasks: [],
          activity: []
        };
      }

      const sanitized = sanitizeUser(user);
      if (!sanitized.role) sanitized.role = 'personal';
      return sanitized;
    },

    getMe() {
      return this.getMeSync();
    },

    /** Async: refresh profile + JWT from server */
    async refreshMe() {
      const email = localStorage.getItem('session');
      const token = localStorage.getItem('jwt');
      if (!email || !token) return null;

      const res = await tryBackendRequest('/auth/me', { method: 'GET' });
      if (res && !res._error && res.user) {
        if (res.token) {
          localStorage.setItem('jwt', res.token);
        }
        const user = applyAuthResponse(res.user, res.token || token, localStorage.getItem('authProvider') || 'email');
        if (user && user.organizationId) {
          try {
            await this.fetchOrganization(user.organizationId);
          } catch (_) { /* optional cache warm */ }
        }
        return user;
      }

      if (res && res.status === 401) {
        clearSession();
        return null;
      }

      return this.getMeSync();
    },

    async updateProfile(updates) {
      const res = await tryBackendRequest('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      if (!res) return { success: false, error: 'Backend offline.' };
      if (res._error) return { success: false, error: res.message || 'Failed to update profile.' };
      const token = res.token || localStorage.getItem('jwt');
      const user = applyAuthResponse(res.user, token, localStorage.getItem('authProvider') || 'email');
      return { success: true, user };
    },

    isAuthenticated() {
      return Boolean(localStorage.getItem('session') && localStorage.getItem('jwt'));
    },

    getRole() {
      const user = this.getMeSync();
      return user ? user.role : null;
    },

    /* ── Tasks ── */
    async fetchBackendTasks() {
      const res = await tryBackendRequest('/tasks', { method: 'GET' });
      if (res && !res._error && res.tasks && Array.isArray(res.tasks)) {
        return res.tasks;
      }
      return null;
    },

    async fetchTaskHeatmap() {
      const res = await tryBackendRequest('/tasks/heatmap', { method: 'GET' });
      if (res && !res._error && res.completionMap) {
        return res.completionMap;
      }
      return null;
    },

    async createBackendTask(taskData) {
      const res = await tryBackendRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskData.title,
          description: taskData.description || '',
          priority: taskData.priority,
          status: taskData.status,
          dueDate: taskData.dueDate,
          dueTime: taskData.dueTime,
          reminderDate: taskData.reminderDate,
          reminderTime: taskData.reminderTime,
          projectId: taskData.projectId,
          assignedUserEmail: taskData.assignedUserEmail,
          isOrgTask: taskData.isOrgTask,
          labels: taskData.labels,
          attachments: taskData.attachments
        })
      });
      if (res && !res._error && res.task) {
        return res.task;
      }
      return null;
    },

    async updateBackendTask(id, taskData) {
      const res = await tryBackendRequest(`/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(taskData)
      });
      if (res && !res._error && res.task) {
        return res.task;
      }
      return null;
    },

    async deleteBackendTask(id) {
      const res = await tryBackendRequest(`/tasks/${id}`, {
        method: 'DELETE'
      });
      if (res && !res._error) {
        return true;
      }
      return false;
    },

    /* ── Projects ── */
    async fetchBackendProjects() {
      const res = await tryBackendRequest('/projects', { method: 'GET' });
      if (res && !res._error && res.projects) {
        return res.projects;
      }
      return [];
    },

    async createBackendProject(projectData) {
      const res = await tryBackendRequest('/projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });
      if (res && !res._error && res.project) {
        return res.project;
      }
      return null;
    },

    async updateBackendProject(id, projectData) {
      const res = await tryBackendRequest(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(projectData)
      });
      if (res && !res._error && res.project) {
        return res.project;
      }
      return null;
    },

    async deleteBackendProject(id) {
      const res = await tryBackendRequest(`/projects/${id}`, { method: 'DELETE' });
      if (res && !res._error) return true;
      return false;
    },

    async fetchBackendOrgUsers() {
      const res = await tryBackendRequest('/orgs/users', { method: 'GET' });
      if (res && !res._error && res.users) {
        return res.users;
      }
      return [];
    },

    async getUserData() {
      const email = localStorage.getItem('session');
      if (!email) return null;

      const [tasksRes, projectsRes] = await Promise.all([
        tryBackendRequest('/tasks', { method: 'GET' }),
        tryBackendRequest('/projects', { method: 'GET' })
      ]);

      const tasks = (tasksRes && !tasksRes._error && tasksRes.tasks) ? tasksRes.tasks : [];
      const projects = (projectsRes && !projectsRes._error && projectsRes.projects) ? projectsRes.projects : [];

      tasks.forEach((t) => { t.id = t._id || t.id; });
      projects.forEach((p) => { p.id = p._id || p.id; });

      return { projects, tasks, activity: [] };
    },

    saveUserData({ projects, tasks, activity }) {
      const email = localStorage.getItem('session');
      if (!email) return false;
      const users = getUsers();
      const user = users[email];
      if (!user) return false;

      if (projects !== undefined) user.projects = projects;
      if (tasks !== undefined) user.tasks = tasks;
      if (activity !== undefined) user.activity = activity;

      saveUsers(users);
      return true;
    },

    requireAuth(redirectUrl = 'index.html') {
      if (!this.isAuthenticated()) {
        window.location.href = redirectUrl;
        return false;
      }
      return true;
    },

    /* ── Organization API ── */
    async getPublicOrganizations() {
      const res = await tryBackendRequest('/orgs/public', { method: 'GET' });
      if (res && res.orgs) return res.orgs;
      return [];
    },

    async fetchOrganization(orgId) {
      if (!orgId) return null;
      const res = await tryBackendRequest(`/orgs/${orgId}`, { method: 'GET' });
      if (res && !res._error && res.org) {
        upsertLocalOrg(res.org);
        return res.org;
      }
      return this.getOrgFull(orgId);
    },

    getOrganization(orgId) {
      if (!orgId) return null;
      const orgs = getOrgs();
      const org = orgs.find((o) => o.id === orgId);
      if (!org) return null;
      return { id: org.id, name: org.name, visibility: org.visibility };
    },

    getOrgFull(orgId) {
      if (!orgId) return null;
      const orgs = getOrgs();
      return orgs.find((o) => o.id === orgId) || null;
    },

    async getAllUsersInOrg(orgId) {
      const res = await tryBackendRequest('/orgs/users', { method: 'GET' });
      if (res && !res._error && res.users) {
        return res.users;
      }
      return [];
    },

    async searchOrganizations(query = '') {
      const orgs = await this.getPublicOrganizations();
      const q = (query || '').toLowerCase().trim();
      return orgs
        .filter((o) => !q || o.name.toLowerCase().includes(q))
        .map((o) => ({ id: o.id, name: o.name, visibility: o.visibility, memberCount: o.memberCount || 0 }));
    },

    async joinOrganization({ orgId, orgKey }) {
      const res = await tryBackendRequest('/orgs/join', {
        method: 'POST',
        body: JSON.stringify({ orgId, orgKey })
      });
      if (res && !res._error) {
        if (res.token && res.user) {
          applyAuthResponse(res.user, res.token, localStorage.getItem('authProvider') || 'email');
        }
        if (res.org) upsertLocalOrg(res.org);
        else if (orgId) await this.fetchOrganization(orgId);
        return { success: true, orgName: res.orgName };
      }
      return { success: false, error: res ? res.message : 'Failed to join organization' };
    },

    async leaveOrganization() {
      const res = await tryBackendRequest('/orgs/leave', { method: 'POST' });
      if (res && !res._error) {
        if (res.token && res.user) {
          applyAuthResponse(res.user, res.token, localStorage.getItem('authProvider') || 'email');
        } else {
          const users = getUsers();
          const email = localStorage.getItem('session');
          if (users[email]) {
            users[email].organizationId = null;
            users[email].role = 'personal';
            delete users[email].password;
            saveUsers(users);
          }
        }
        return { success: true };
      }
      return { success: false, error: res ? res.message : 'Failed to leave organization' };
    },

    async removeMemberFromOrg(orgId, emailToRemove) {
      const res = await tryBackendRequest(`/orgs/${orgId}/members/${encodeURIComponent(emailToRemove)}`, { method: 'DELETE' });
      if (res && !res._error) {
        if (res.token && res.user) applyAuthResponse(res.user, res.token, localStorage.getItem('authProvider') || 'email');
        await this.fetchOrganization(orgId);
        return { success: true };
      }
      return { success: false, error: res ? res.message : 'Failed to remove member' };
    },

    async promoteToAdmin(orgId, emailToPromote) {
      const res = await tryBackendRequest(`/orgs/${orgId}/promote`, {
        method: 'POST',
        body: JSON.stringify({ emailToPromote })
      });
      if (res && !res._error) {
        if (res.token && res.user) applyAuthResponse(res.user, res.token, localStorage.getItem('authProvider') || 'email');
        await this.fetchOrganization(orgId);
        return { success: true };
      }
      return { success: false, error: res ? res.message : 'Failed to promote member' };
    },

    async regenerateOrgKey(orgId) {
      const res = await tryBackendRequest(`/orgs/${orgId}/regen-key`, { method: 'POST' });
      if (res && !res._error && res.newKey) {
        if (res.org) upsertLocalOrg(res.org);
        else {
          const local = this.getOrgFull(orgId);
          if (local) {
            local.orgKey = res.newKey;
            upsertLocalOrg(local);
          }
        }
        return { success: true, newKey: res.newKey };
      }
      return { success: false, error: res ? res.message : 'Failed to regenerate key' };
    },

    async updateOrgSettings(orgId, { name, visibility }) {
      const res = await tryBackendRequest(`/orgs/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, visibility })
      });
      if (res && !res._error) {
        if (res.org) upsertLocalOrg(res.org);
        return { success: true };
      }
      return { success: false, error: res ? res.message : 'Failed to update settings' };
    },

    /* ── Messaging REST API ── */
    async fetchConversationMessages(targetUserId) {
      const res = await tryBackendRequest(`/messages/${encodeURIComponent(targetUserId)}`, { method: 'GET' });
      if (res && !res._error && res.messages) {
        return res;
      }
      return null;
    },

    async markMessagesAsRead(targetUserId) {
      const res = await tryBackendRequest(`/messages/read/${encodeURIComponent(targetUserId)}`, { method: 'PATCH' });
      if (res && !res._error) {
        return true;
      }
      return false;
    },

    async fetchUnreadCounts() {
      const res = await tryBackendRequest('/messages/unread', { method: 'GET' });
      if (res && !res._error) {
        return res;
      }
      return { total: 0, bySender: {} };
    }
  };

  // Backward-compatible: many pages call getMe() expecting sync. Keep sync alias via getMeSync
  // but prefer async. Pages that need auth will be updated to await getMe().
})(window);
