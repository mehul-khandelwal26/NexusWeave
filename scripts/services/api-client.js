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
    const timeoutId = setTimeout(() => controller.abort(), 800);
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
      return { _error: true, status: res.status, message: errData.message || errData.error || 'Server error' };
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
        body: JSON.stringify({ username, email, password })
      });

      let token = null;
      if (backendRes && !backendRes._error && backendRes.token) {
        token = backendRes.token;
      }

      if (role === 'admin' && orgName) {
        const orgs = getOrgs();
        const newOrgId = generateId('org');
        const newOrg = {
          id: newOrgId,
          name: orgName,
          orgKey: orgKey || Math.random().toString(36).substr(2, 6),
          visibility: orgVisibility || 'private',
          adminEmail: email,
          members: [email],
          createdAt: Date.now()
        };
        orgs.push(newOrg);
        saveOrgs(orgs);
        orgId = newOrgId;
      }

      const users = getUsers();
      const now = new Date();
      const newUser = {
        id: backendRes?.user?.id || generateId('user'),
        name: username,
        email,
        password,
        role,
        organizationId: orgId || null,
        theme: 'light',
        projects: [
          { id: 'proj-1', name: 'General', description: 'Default project', deadline: '', timeline: 'Execution', createdAt: now.toISOString() }
        ],
        tasks: [],
        activity: [
          { id: 'act-1', text: 'Created workspace account.', time: 'Just now', createdAt: new Date().toISOString() }
        ],
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
        body: JSON.stringify({ email, password })
      });

      let token = null;
      let userData = null;

      if (backendRes && !backendRes._error && backendRes.token) {
        token = backendRes.token;
        userData = backendRes.user;
      }

      const users = getUsers();
      let user = users[email];

      if (!user && userData) {
        // Create local record if logged in from backend
        user = {
          id: userData.id,
          name: userData.username || email.split('@')[0],
          email: userData.email,
          password,
          role: role || 'personal',
          projects: [{ id: 'proj-1', name: 'General', description: 'Default project', deadline: '', timeline: 'Execution', createdAt: new Date().toISOString() }],
          tasks: [],
          activity: []
        };
        users[email] = user;
        saveUsers(users);
      } else if (!user) {
        // Fallback local check if backend returned error or unavailable
        if (backendRes && backendRes._error) {
          return { success: false, error: backendRes.message || 'Invalid email or password.' };
        }
        return { success: false, error: 'Account not found. Please register.' };
      }

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
      if (res && !res._error && Array.isArray(res)) {
        return res;
      }
      return null;
    },

    async createBackendTask(taskData) {
      const res = await tryBackendRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskData.title,
          description: taskData.description || '',
          priority: taskData.priority === 'Urgent' ? 'High' : (taskData.priority || 'Medium')
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

    /* ── Local Users / Orgs Helpers ── */
    getUserData() {
      const email = localStorage.getItem('session');
      if (!email) return null;
      const users = getUsers();
      const user = users[email];
      if (!user) return null;
      return { projects: user.projects || [], tasks: user.tasks || [], activity: user.activity || [] };
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
    getPublicOrganizations() {
      const orgs = getOrgs();
      return orgs.filter(o => o.visibility === 'public').map(o => ({ id: o.id, name: o.name, visibility: o.visibility }));
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

    getAllUsersInOrg(orgId) {
      if (!orgId) return [];
      const users = getUsers();
      return Object.values(users).filter(u => u.organizationId === orgId);
    },

    searchOrganizations(query = '') {
      const orgs = getOrgs();
      const q = (query || '').toLowerCase().trim();
      return orgs
        .filter(o => !q || o.name.toLowerCase().includes(q))
        .map(o => ({ id: o.id, name: o.name, visibility: o.visibility, memberCount: (o.members || []).length }));
    },

    joinOrganization({ orgId, orgKey }) {
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return { success: false, error: 'Organization not found.' };

      if (org.visibility === 'private' && org.orgKey !== orgKey) {
        return { success: false, error: 'Invalid organization key.' };
      }

      const email = localStorage.getItem('session');
      if (!email) return { success: false, error: 'Not authenticated.' };

      if (!org.members) org.members = [];
      if (!org.members.includes(email)) {
        org.members.push(email);
        saveOrgs(orgs);
      }

      const users = getUsers();
      if (users[email]) {
        users[email].organizationId = orgId;
        users[email].role = 'employee';
        saveUsers(users);
      }

      return { success: true, orgName: org.name };
    },

    leaveOrganization() {
      const email = localStorage.getItem('session');
      if (!email) return { success: false, error: 'Not authenticated.' };

      const users = getUsers();
      const user = users[email];
      if (!user || !user.organizationId) return { success: false, error: 'Not in an organization.' };

      const orgs = getOrgs();
      const org = orgs.find(o => o.id === user.organizationId);
      if (org) {
        org.members = (org.members || []).filter(m => m !== email);
        saveOrgs(orgs);
      }

      user.organizationId = null;
      user.role = 'personal';
      saveUsers(users);

      return { success: true };
    },

    removeMemberFromOrg(orgId, emailToRemove) {
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return { success: false, error: 'Organization not found.' };

      org.members = (org.members || []).filter(m => m !== emailToRemove);
      saveOrgs(orgs);

      const users = getUsers();
      if (users[emailToRemove]) {
        users[emailToRemove].organizationId = null;
        users[emailToRemove].role = 'personal';
        saveUsers(users);
      }

      return { success: true };
    },

    promoteToAdmin(orgId, emailToPromote) {
      const users = getUsers();
      if (!users[emailToPromote]) return { success: false, error: 'User not found.' };

      users[emailToPromote].role = 'admin';
      saveUsers(users);
      return { success: true };
    },

    regenerateOrgKey(orgId) {
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return { success: false, error: 'Organization not found.' };

      const newKey = Math.random().toString(36).substr(2, 6) + Date.now().toString(36).substr(-2);
      org.orgKey = newKey;
      saveOrgs(orgs);
      return { success: true, newKey };
    },

    updateOrgSettings(orgId, { name, visibility }) {
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return { success: false, error: 'Organization not found.' };

      if (name) org.name = name;
      if (visibility) org.visibility = visibility;
      saveOrgs(orgs);
      return { success: true };
    }
  };
})(window);
