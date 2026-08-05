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

  function createJwt(user) {
    const payload = { sub: user.id || user._id, email: user.email, name: user.name || user.username, role: user.role || 'personal', orgId: user.organizationId || null, exp: Date.now() + 24 * 60 * 60 * 1000 };
    return `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.nexusweave_sig`;
  }

  function setSession(user, provider, token = null) {
    const jwtToken = token || createJwt(user);
    const sessions = JSON.parse(localStorage.getItem('nw_sessions')) || [];
    const sessionId = generateId('sess');
    sessions.push({
      id: sessionId,
      userId: user.id || user._id,
      token: jwtToken,
      provider,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    localStorage.setItem('nw_sessions', JSON.stringify(sessions));
    localStorage.setItem('session', user.email);
    localStorage.setItem('jwt', jwtToken);
    localStorage.setItem('authProvider', provider);
  }

  function clearSession() {
    localStorage.removeItem('session');
    localStorage.removeItem('jwt');
    localStorage.removeItem('authProvider');
  }

  const API_BASE = 'http://localhost:4000/api';

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
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      const errorMsg = (errData.errors && errData.errors[0]) || errData.message || errData.error || 'Server error';
      return { _error: true, status: res.status, message: errorMsg };
    } catch (e) {
      // Backend offline or timeout
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    return sanitized;
  }

  root.NexusAPI = {
    API_BASE,

    /* ── Auth ── */
    async signup({ name, email, password, role = 'personal', orgName, orgKey, orgVisibility, orgId }) {
      const username = name || email.split('@')[0];
      // Try To-Do_Board backend register endpoint (/api/auth/register)
      const backendRes = await tryBackendRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: username, email, password, role, orgName, orgKey, orgVisibility, orgId })
      });

      if (!backendRes) {
        return { success: false, error: 'Backend offline. Please try again later.' };
      }

      if (backendRes._error) {
        return { success: false, error: backendRes.message || 'Failed to sign up.' };
      }

      const token = backendRes.token;
      const userData = backendRes.user;
      const backendOrgId = userData.organizationId;

      if (role === 'admin' && orgName) {
        const orgs = getOrgs();
        // Check if we need to mirror it locally
        if (!orgs.find(o => o.id === backendOrgId)) {
          const newOrg = {
            id: backendOrgId,
            name: orgName,
            orgKey: orgKey || Math.random().toString(36).substr(2, 6),
            visibility: orgVisibility || 'private',
            adminEmail: email,
            members: [email],
            createdAt: Date.now()
          };
          orgs.push(newOrg);
          saveOrgs(orgs);
        }
      }

      const users = getUsers();
      const newUser = {
        id: userData.id,
        name: userData.name || username,
        email,
        password,
        role: userData.role || role,
        organizationId: backendOrgId || null,
        theme: 'light',
        projects: [],
        tasks: [],
        activity: [],
        createdAt: Date.now()
      };

      users[email] = newUser;
      saveUsers(users);
      setSession(newUser, 'email', token);

      return { success: true, token: localStorage.getItem('jwt'), user: sanitizeUser(newUser) };
    },

    async login({ email, password, role }) {
      // Try To-Do_Board backend login endpoint (/api/auth/login)
      const backendRes = await tryBackendRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role })
      });

      if (!backendRes) {
        return { success: false, error: 'Backend offline. Please try again later.' };
      }

      if (backendRes._error) {
        return { success: false, error: backendRes.message || 'Invalid email or password.' };
      }

      const token = backendRes.token;
      const userData = backendRes.user;

      const users = getUsers();
      let user = users[email];

      if (!user) {
        // Create local record if logged in from backend
        user = {
          id: userData.id,
          name: userData.name || email.split('@')[0],
          email: userData.email,
          password,
          role: userData.role || role || 'personal',
          organizationId: userData.organizationId || null,
          projects: [],
          tasks: [],
          activity: []
        };
      } else {
        // Sync local record
        user.id = userData.id;
        user.name = userData.name || user.name;
        user.role = userData.role || user.role;
        user.organizationId = userData.organizationId || null;
      }
      
      users[email] = user;
      saveUsers(users);

      setSession(user, 'email', token);
      return { success: true, token: localStorage.getItem('jwt'), user: sanitizeUser(user) };
    },

    async logout() {
      clearSession();
      return { success: true };
    },

    getMe() {
      const email = localStorage.getItem('session');
      const token = localStorage.getItem('jwt');
      if (!email || !token) return null;

      const users = getUsers();
      const user = users[email];
      if (!user) {
        return { email, name: email.split('@')[0], role: 'personal', projects: [], tasks: [], activity: [] };
      }

      const sanitized = sanitizeUser(user);
      if (!sanitized.role) sanitized.role = 'personal';
      return sanitized;
    },

    isAuthenticated() {
      return this.getMe() !== null;
    },

    getRole() {
      const user = this.getMe();
      return user ? user.role : null;
    },

    /* ── Backend API Direct Task Integration ── */
    async fetchBackendTasks() {
      const res = await tryBackendRequest('/tasks', { method: 'GET' });
      if (res && !res._error && res.tasks && Array.isArray(res.tasks)) {
        return res.tasks;
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

    /* ── Backend API Direct Project Integration ── */
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

    /* ── Backend API Direct Organization Integration ── */
    async fetchBackendOrgUsers() {
      const res = await tryBackendRequest('/orgs/users', { method: 'GET' });
      if (res && !res._error && res.users) {
        return res.users;
      }
      return [];
    },

    /* ── Fetch Combined Data ── */
    async getUserData() {
      const email = localStorage.getItem('session');
      if (!email) return null;
      
      const [tasksRes, projectsRes] = await Promise.all([
        tryBackendRequest('/tasks', { method: 'GET' }),
        tryBackendRequest('/projects', { method: 'GET' })
      ]);
      
      const tasks = (tasksRes && !tasksRes._error && tasksRes.tasks) ? tasksRes.tasks : [];
      const projects = (projectsRes && !projectsRes._error && projectsRes.projects) ? projectsRes.projects : [];
      
      // Map _id to id for frontend compatibility
      tasks.forEach(t => t.id = t._id);
      projects.forEach(p => p.id = p._id);
      
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

    getOrganization(orgId) {
      if (!orgId) return null;
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return null;
      return { id: org.id, name: org.name, visibility: org.visibility };
    },

    getOrgFull(orgId) {
      if (!orgId) return null;
      const orgs = getOrgs();
      return orgs.find(o => o.id === orgId) || null;
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
        .filter(o => !q || o.name.toLowerCase().includes(q))
        .map(o => ({ id: o.id, name: o.name, visibility: o.visibility, memberCount: o.memberCount || 0 }));
    },

    async joinOrganization({ orgId, orgKey }) {
      const res = await tryBackendRequest('/orgs/join', {
        method: 'POST',
        body: JSON.stringify({ orgId, orgKey })
      });
      if (res && !res._error) {
        const users = getUsers();
        const email = localStorage.getItem('session');
        if (users[email]) {
          users[email].organizationId = orgId;
          users[email].role = 'employee';
          saveUsers(users);
        }
        return { success: true, orgName: res.orgName };
      }
      return { success: false, error: res ? res.message : 'Failed to join organization' };
    },

    async leaveOrganization() {
      const res = await tryBackendRequest('/orgs/leave', { method: 'POST' });
      if (res && !res._error) {
        const users = getUsers();
        const email = localStorage.getItem('session');
        if (users[email]) {
          users[email].organizationId = null;
          users[email].role = 'personal';
          saveUsers(users);
        }
        return { success: true };
      }
      return { success: false, error: res ? res.message : 'Failed to leave organization' };
    },

    async removeMemberFromOrg(orgId, emailToRemove) {
      const res = await tryBackendRequest(`/orgs/${orgId}/members/${encodeURIComponent(emailToRemove)}`, { method: 'DELETE' });
      if (res && !res._error) return { success: true };
      return { success: false, error: res ? res.message : 'Failed to remove member' };
    },

    async promoteToAdmin(orgId, emailToPromote) {
      const res = await tryBackendRequest(`/orgs/${orgId}/promote`, {
        method: 'POST',
        body: JSON.stringify({ emailToPromote })
      });
      if (res && !res._error) return { success: true };
      return { success: false, error: res ? res.message : 'Failed to promote member' };
    },

    async regenerateOrgKey(orgId) {
      const res = await tryBackendRequest(`/orgs/${orgId}/regen-key`, { method: 'POST' });
      if (res && !res._error && res.newKey) return { success: true, newKey: res.newKey };
      return { success: false, error: res ? res.message : 'Failed to regenerate key' };
    },

    async updateOrgSettings(orgId, { name, visibility }) {
      const res = await tryBackendRequest(`/orgs/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, visibility })
      });
      if (res && !res._error) return { success: true };
      return { success: false, error: res ? res.message : 'Failed to update settings' };
    }
  };
})(window);
