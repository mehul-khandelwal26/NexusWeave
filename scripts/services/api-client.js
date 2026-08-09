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
    const sessions = JSON.parse(sessionStorage.getItem('nw_sessions')) || [];
    const sessionId = generateId('sess');
    sessions.push({
      id: sessionId,
      userId: user.id || user._id,
      token,
      provider,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    sessionStorage.setItem('nw_sessions', JSON.stringify(sessions));
    sessionStorage.setItem('session', user.email);
    sessionStorage.setItem('jwt', token);
    sessionStorage.setItem('authProvider', provider);
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
      boardBg: backendUser.boardBg || existing.boardBg || 'none',
      provider: backendUser.provider || provider || 'email',
      photo: backendUser.avatar || existing.photo || '',
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
    sessionStorage.removeItem('session');
    sessionStorage.removeItem('jwt');
    sessionStorage.removeItem('authProvider');
    sessionStorage.removeItem('nw_sessions');
  }

  const BACKEND_PORT = '4000';

  /**
   * Resolves where the API lives:
   *  - Same origin when Express is serving the pages itself, or when deployed behind
   *    a domain/reverse proxy (no port, or a non-dev port).
   *  - The backend port on the *current* hostname otherwise, so opening the site from
   *    a phone or another machine on the LAN works instead of pointing at that
   *    device's own localhost.
   */
  function resolveApiBase() {
    if (typeof window === 'undefined' || !window.location) {
      return 'https://webwondersnexusweave-production.up.railway.app/api';
    }
    const { protocol, hostname, port } = window.location;

    // Opened straight off disk or running locally
    if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:${BACKEND_PORT}/api`;
    }
    
    // Deployed to production (e.g. Vercel)
    return 'https://webwondersnexusweave-production.up.railway.app/api';
  }

  const API_BASE = resolveApiBase();

  const SERVER_UNREACHABLE = 'Cannot reach the NexusWeave server. Please make sure the backend is running and try again.';
  const DATABASE_UNAVAILABLE = 'The server is running but cannot reach its database. Check your internet connection, then confirm your IP is allowed in MongoDB Atlas (Network Access).';

  /**
   * Distinguishes "backend process is down" from "backend is up but the database is
   * not", so the user gets an actionable message instead of a generic one.
   * Returns { reachable, databaseUp, message }.
   */
  async function checkServerHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (data.database === 'connected') {
        return { reachable: true, databaseUp: true, message: '' };
      }
      return {
        reachable: true,
        databaseUp: false,
        message: data.databaseError || DATABASE_UNAVAILABLE
      };
    } catch (e) {
      return { reachable: false, databaseUp: false, message: SERVER_UNREACHABLE };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Turns a failed request into the most accurate explanation we can produce. */
  async function describeFailure(fallbackMessage) {
    const health = await checkServerHealth();
    if (!health.reachable) return SERVER_UNREACHABLE;
    if (!health.databaseUp) return health.message;
    return fallbackMessage || SERVER_UNREACHABLE;
  }


  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sendOnce(endpoint, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('jwt') || ''}`,
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
      return { _error: true, status: res.status, message: errorMsg, _databaseError: errData.databaseError || null };
    } catch (e) {
      // AbortError means the server may have received and processed the request, so it
      // is not safe to replay. A connection error means it never arrived.
      return { _error: true, _network: true, _replayable: e.name !== 'AbortError' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function tryBackendRequest(endpoint, options = {}) {
    let result = await sendOnce(endpoint, options);

    // A 503 is the backend explicitly saying it did not touch the database yet, and a
    // connection error means the request never landed. Both are safe to replay, and
    // both are what a server restart looks like from here. One quick retry keeps a
    // restart from surfacing as "the backend is not working".
    const isRestartWindow = result && result._error &&
      (result.status === 503 || (result._network && result._replayable));

    if (isRestartWindow) {
      await delay(1200);
      result = await sendOnce(endpoint, options);
    }

    if (result && result._network) {
      return null;
    }
    if (result && result._error && result.status === 503) {
      return { _error: true, status: 503, message: result._databaseError || DATABASE_UNAVAILABLE };
    }
    return result;
  }

  function sanitizeUser(user) {
    if (!user) return null;
    const sanitized = { ...user };
    delete sanitized.password;
    return sanitized;
  }

  function getSessionUser() {
    const email = sessionStorage.getItem('session');
    if (!email) return null;
    return getUsers()[email] || null;
  }

  /** Organization-scoped features (announcements, org roster) are off-limits to personal accounts. */
  function isOrgScopedSession() {
    const user = getSessionUser();
    return Boolean(user && user.role && user.role !== 'personal' && user.organizationId);
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
    checkServerHealth,
    describeFailure,

    /* ── Auth ── */
    async signup({ name, email, password, role = 'personal', orgName, orgKey, orgVisibility, orgId }) {
      const username = name || email.split('@')[0];

      const backendRes = await tryBackendRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: username, email, password, role, orgName, orgKey, orgVisibility, orgId })
      });

      if (!backendRes) {
        return { success: false, error: await describeFailure() };
      }
      if (backendRes._error) {
        return { success: false, error: backendRes.message || 'Failed to sign up.' };
      }

      const token = backendRes.token;
      const userData = backendRes.user;

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
      const backendRes = await tryBackendRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role })
      });

      // Credentials and account scope are only ever verified by the server. There is no
      // local fallback, otherwise a personal account could sign in through the org portal.
      if (!backendRes) {
        return { success: false, error: await describeFailure() };
      }
      if (backendRes._error) {
        return { success: false, error: backendRes.message || 'Invalid email or password.' };
      }

      const user = applyAuthResponse(backendRes.user, backendRes.token, 'email');
      return { success: true, token: backendRes.token, user };
    },

    async googleAuth({ credential, role = 'personal', orgName, orgKey, orgVisibility, orgId, theme }) {
      const backendRes = await tryBackendRequest('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential, role, orgName, orgKey, orgVisibility, orgId, theme })
      });

      if (!backendRes) {
        return { success: false, error: await describeFailure() };
      }
      if (backendRes._error) {
        return { success: false, error: backendRes.message || 'Google sign-in failed.' };
      }

      if (role === 'admin' && orgName && backendRes.user.organizationId) {
        upsertLocalOrg({
          id: backendRes.user.organizationId,
          name: orgName,
          orgKey: orgKey || '',
          visibility: orgVisibility || 'public',
          createdBy: backendRes.user.email,
          admins: [backendRes.user.email],
          members: [backendRes.user.email]
        });
      }

      const user = applyAuthResponse(backendRes.user, backendRes.token, 'google');
      return { success: true, token: backendRes.token, user };
    },

    async getGoogleClientId() {
      const res = await tryBackendRequest('/auth/google/config', { method: 'GET' });
      return res && !res._error ? res.clientId : null;
    },

    async logout() {
      clearSession();
      return { success: true };
    },

    getMeSync() {
      const email = sessionStorage.getItem('session');
      const token = sessionStorage.getItem('jwt');
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
      const email = sessionStorage.getItem('session');
      const token = sessionStorage.getItem('jwt');
      if (!email || !token) return null;

      const res = await tryBackendRequest('/auth/me', { method: 'GET' });
      if (res && !res._error && res.user) {
        if (res.token) {
          sessionStorage.setItem('jwt', res.token);
        }
        const user = applyAuthResponse(res.user, res.token || token, sessionStorage.getItem('authProvider') || 'email');
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
      
      if (!res || res._error) {
        // Local Fallback
        const session = sessionStorage.getItem('session');
        if (!session) return { success: false, error: 'Not logged in.' };
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        if (!users[session]) return { success: false, error: 'User not found.' };
        
        users[session] = { ...users[session], ...updates };
        localStorage.setItem('users', JSON.stringify(users));
        
        return { success: true, user: users[session] };
      }
      
      const token = res.token || sessionStorage.getItem('jwt');
      const user = applyAuthResponse(res.user, token, sessionStorage.getItem('authProvider') || 'email');
      return { success: true, user };
    },

    async deleteProfile() {
      const res = await tryBackendRequest('/auth/me', {
        method: 'DELETE'
      });
      
      if (!res || res._error) {
        // Local Fallback
        const session = sessionStorage.getItem('session');
        if (!session) return { success: false, error: 'Not logged in.' };
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        delete users[session];
        localStorage.setItem('users', JSON.stringify(users));
      }
      return { success: true };
    },

    isAuthenticated() {
      return Boolean(sessionStorage.getItem('session') && sessionStorage.getItem('jwt'));
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

    async fetchBackendLeaderboard() {
      const res = await tryBackendRequest('/orgs/leaderboard', { method: 'GET' });
      if (res && !res._error && res.success && Array.isArray(res.leaderboard)) {
        return res.leaderboard;
      }
      return null;
    },

    async getUserData() {
      const email = sessionStorage.getItem('session');
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
      const email = sessionStorage.getItem('session');
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
      let publicOrgs = await this.getPublicOrganizations();
      if (!publicOrgs) publicOrgs = [];
      
      // Combine with local orgs so private orgs known to the user appear
      let localOrgs = getOrgs() || [];
      
      let combinedMap = new Map();
      publicOrgs.forEach(o => combinedMap.set(o.id, o));
      localOrgs.forEach(o => {
        // Prefer local org data if it exists, or just add it if it's private
        combinedMap.set(o.id, { ...(combinedMap.get(o.id) || {}), ...o });
      });
      
      let allOrgs = Array.from(combinedMap.values());

      // Aggressively filter out test/unnecessary organizations from the view
      allOrgs = allOrgs.filter(o => {
        const n = o.name || '';
        if (n.startsWith('TestOrg')) return false;
        if (n.startsWith('WsOrg')) return false;
        if (n.startsWith('FinalOrg')) return false;
        if (n.startsWith('BrowserCheck')) return false;
        if (n.startsWith('Org178')) return false; // Matches Org178...
        return true;
      });

      const q = (query || '').toLowerCase().trim();
      return allOrgs
        .filter((o) => !q || (o.name && o.name.toLowerCase().includes(q)))
        .map((o) => ({ 
          id: o.id, 
          name: o.name, 
          visibility: o.visibility || 'public', 
          memberCount: o.members ? o.members.length : (o.memberCount || 0) 
        }));
    },

    async joinOrganization({ orgId, orgKey }) {
      const res = await tryBackendRequest('/orgs/join', {
        method: 'POST',
        body: JSON.stringify({ orgId, orgKey })
      });
      if (res && !res._error) {
        if (res.token && res.user) {
          applyAuthResponse(res.user, res.token, sessionStorage.getItem('authProvider') || 'email');
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
          applyAuthResponse(res.user, res.token, sessionStorage.getItem('authProvider') || 'email');
        } else {
          const users = getUsers();
          const email = sessionStorage.getItem('session');
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
        if (res.token && res.user) applyAuthResponse(res.user, res.token, sessionStorage.getItem('authProvider') || 'email');
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
        if (res.token && res.user) applyAuthResponse(res.user, res.token, sessionStorage.getItem('authProvider') || 'email');
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
    },

    /* ── Announcement API (organization accounts only) ── */
    isOrgAccount: isOrgScopedSession,

    async fetchAnnouncements() {
      if (!isOrgScopedSession()) return [];
      const res = await tryBackendRequest('/announcements', { method: 'GET' });
      if (res && !res._error && res.success && Array.isArray(res.announcements)) {
        return res.announcements;
      }
      return null;
    },

    async createAnnouncement({ title, content, attachments }) {
      if (!isOrgScopedSession()) {
        return { success: false, error: 'Announcements are only available to organization accounts.' };
      }
      const res = await tryBackendRequest('/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, content, attachments })
      });
      if (res && !res._error && res.success && res.announcement) {
        return { success: true, announcement: res.announcement };
      }
      return { success: false, error: res ? (res.message || (res.errors && res.errors[0])) : 'Failed to create announcement' };
    },

    /* ── Online Users & Attendance API ── */
    async fetchOnlineUsers() {
      const res = await tryBackendRequest('/orgs/online', { method: 'GET' });
      if (res && !res._error && res.success) {
        return res;
      }
      return null;
    },

    async fetchTodayAttendance() {
      const res = await tryBackendRequest('/orgs/attendance/today', { method: 'GET' });
      if (res && !res._error && res.success) {
        return res;
      }
      return null;
    },

    async markDatabaseAttendance() {
      const res = await tryBackendRequest('/orgs/attendance/mark', { method: 'POST' });
      if (res && !res._error && res.success) {
        return res;
      }
      return null;
    },

    async fetchAttendanceHistory(days = 30) {
      const res = await tryBackendRequest(`/orgs/attendance/history?days=${days}`, { method: 'GET' });
      if (res && !res._error && res.success) {
        return res;
      }
      return null;
    },

    async clearDatabaseAttendance() {
      const res = await tryBackendRequest('/orgs/attendance/mark', { method: 'DELETE' });
      if (res && !res._error && res.success) {
        return res;
      }
      return null;
    },

    /* ── Focus Session API ── */
    async logFocusSession(minutes, taskId = null) {
      const res = await tryBackendRequest('/focus', {
        method: 'POST',
        body: JSON.stringify({ minutes, taskId })
      });
      if (res && !res._error && res.success) {
        return res.session;
      }
      return null;
    },

    async fetchFocusSummary(days = 7) {
      const res = await tryBackendRequest(`/focus/summary?days=${days}`, { method: 'GET' });
      if (res && !res._error && res.success) {
        return res;
      }
      return null;
    },

    /* ── Activity Feed API ── */
    async fetchActivity({ scope = 'me', limit = 20 } = {}) {
      const res = await tryBackendRequest(`/activity?scope=${encodeURIComponent(scope)}&limit=${limit}`, { method: 'GET' });
      if (res && !res._error && Array.isArray(res.activity)) {
        return res.activity;
      }
      return null;
    },

    /* ── Calendar & Tasks API ── */
    async fetchCalendarTasks(year, month) {
      const query = (year && month) ? `?year=${year}&month=${month}` : '';
      const res = await tryBackendRequest(`/tasks/calendar${query}`, { method: 'GET' });
      if (res && !res._error && res.success) {
        return res;
      }
      return { success: false, tasks: [], countsByDate: {} };
    },

    async createTask(taskData) {
      const res = await tryBackendRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      if (res && !res._error && (res.task || res.success)) {
        return { success: true, task: res.task || res };
      }
      return { success: false, error: res ? (res.message || (res.errors && res.errors[0])) : 'Failed to create task' };
    }
  };

  // Backward-compatible: many pages call getMe() expecting sync. Keep sync alias via getMeSync
  // but prefer async. Pages that need auth will be updated to await getMe().
})(window);
