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
    const payload = { sub: user.id, email: user.email, name: user.name, role: user.role, orgId: user.organizationId, exp: Date.now() + 4 * 60 * 60 * 1000 };
    return `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.nexusweave_sig`;
  }

  function setSession(user, provider) {
    const token = createJwt(user);
    const sessions = JSON.parse(localStorage.getItem('nw_sessions')) || [];
    const sessionId = generateId('sess');
    sessions.push({
      id: sessionId,
      userId: user.id,
      token,
      provider,
      createdAt: Date.now(),
      expiresAt: Date.now() + 4 * 60 * 60 * 1000
    });
    localStorage.setItem('nw_sessions', JSON.stringify(sessions));
    localStorage.setItem('session', user.email);
    localStorage.setItem('jwt', token);
    localStorage.setItem('authProvider', provider);
  }

  function clearSession() {
    localStorage.removeItem('session');
    localStorage.removeItem('jwt');
    localStorage.removeItem('authProvider');
  }

  function sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    return sanitized;
  }

  root.NexusAPI = {
    /* ── Auth ── */
    async signup({ name, email, password, role, orgName, orgKey, orgVisibility, orgId }) {
      const users = getUsers();
      if (users[email]) {
        return { success: false, error: 'Email already exists.' };
      }

      let assignedOrgId = null;
      const orgs = getOrgs();

      if (role === 'admin') {
        if (!orgName || !orgKey) {
          return { success: false, error: 'Organization name and key are required.' };
        }
        if (orgs.some(o => o.name === orgName)) {
          return { success: false, error: 'Organization name already exists.' };
        }
        assignedOrgId = generateId('org');
        const newOrg = {
          id: assignedOrgId,
          name: orgName,
          orgKey,
          visibility: orgVisibility || 'public',
          createdBy: email,
          admins: [email],
          members: [email],
          createdAt: Date.now()
        };
        orgs.push(newOrg);
        saveOrgs(orgs);
      } else if (role === 'employee') {
        if (!orgId) {
          return { success: false, error: 'Organization is required.' };
        }
        const org = orgs.find(o => o.id === orgId);
        if (!org) {
          return { success: false, error: 'Organization not found.' };
        }
        if (org.visibility === 'private' && org.orgKey !== orgKey) {
          return { success: false, error: 'Invalid organization key.' };
        }
        if (!org.members.includes(email)) org.members.push(email);
        saveOrgs(orgs);
        assignedOrgId = org.id;
      }

      const newUser = {
        id: generateId('user'),
        name,
        email,
        password,
        role,
        organizationId: assignedOrgId,
        theme: 'light',
        projects: [],
        tasks: [],
        activity: [],
        createdAt: Date.now()
      };

      users[email] = newUser;
      saveUsers(users);
      setSession(newUser, 'email');

      return { success: true, token: localStorage.getItem('jwt'), user: sanitizeUser(newUser) };
    },

    async login({ email, password, role }) {
      const users = getUsers();
      const user = users[email];
      if (!user) {
        return { success: false, error: 'Invalid email or password.' };
      }
      if (user.password !== password) {
        return { success: false, error: 'Invalid email or password.' };
      }
      if (!user.role) {
        return { success: false, error: 'Please re-register with the updated system.' };
      }
      if (user.role !== role) {
        return { success: false, error: 'Role mismatch.' };
      }

      setSession(user, 'email');
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
      if (!user) return null;

      try {
        const payloadStr = atob(token.split('.')[1]);
        const payload = JSON.parse(payloadStr);
        if (payload.exp < Date.now()) {
          clearSession();
          return null;
        }
      } catch (e) {
        return null;
      }

      return sanitizeUser(user);
    },

    isAuthenticated() {
      return this.getMe() !== null;
    },

    getRole() {
      const user = this.getMe();
      return user ? user.role : null;
    },

    /* ── Org Reads (public, sanitized) ── */
    getOrganization(orgId) {
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return null;
      return {
        id: org.id,
        name: org.name,
        visibility: org.visibility,
        memberCount: org.members.length,
        createdAt: org.createdAt
      };
    },

    /* Returns ALL orgs with visibility info (for join/signup dropdowns) */
    getPublicOrganizations() {
      const orgs = getOrgs();
      return orgs.map(org => ({
        id: org.id,
        name: org.name,
        visibility: org.visibility,
        memberCount: org.members.length
      }));
    },

    /* Full org object — only for the admin who owns it */
    getOrgFull(orgId) {
      const email = localStorage.getItem('session');
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return null;
      // Expose full data only to org admins
      const isOrgAdmin = (org.admins || [org.createdBy]).includes(email);
      if (!isOrgAdmin) return null;
      return { ...org };
    },

    /* Search organizations by name (employee use) */
    searchOrganizations(query = '') {
      const orgs = getOrgs();
      const q = query.toLowerCase().trim();
      const filtered = q ? orgs.filter(o => o.name.toLowerCase().includes(q)) : orgs;
      return filtered.map(org => ({
        id: org.id,
        name: org.name,
        visibility: org.visibility,
        memberCount: org.members.length
      }));
    },

    /* Get all full user objects in an org (for admin member list) */
    getAllUsersInOrg(orgId) {
      const users = getUsers();
      const orgs = getOrgs();
      const org = orgs.find(o => o.id === orgId);
      if (!org) return [];
      return org.members
        .map(email => users[email])
        .filter(Boolean)
        .map(u => sanitizeUser(u));
    },

    /* ── Org Management (Admin) ── */
    updateOrgSettings(orgId, { name, visibility }) {
      const sessionEmail = localStorage.getItem('session');
      const orgs = getOrgs();
      const idx = orgs.findIndex(o => o.id === orgId);
      if (idx === -1) return { success: false, error: 'Organization not found.' };

      const org = orgs[idx];
      const isOrgAdmin = (org.admins || [org.createdBy]).includes(sessionEmail);
      if (!isOrgAdmin) return { success: false, error: 'Permission denied.' };

      // Check name uniqueness (exclude self)
      if (name && name !== org.name && orgs.some((o, i) => i !== idx && o.name === name)) {
        return { success: false, error: 'Organization name already taken.' };
      }

      if (name) org.name = name;
      if (visibility) org.visibility = visibility;

      orgs[idx] = org;
      saveOrgs(orgs);
      return { success: true };
    },

    regenerateOrgKey(orgId) {
      const sessionEmail = localStorage.getItem('session');
      const orgs = getOrgs();
      const idx = orgs.findIndex(o => o.id === orgId);
      if (idx === -1) return { success: false, error: 'Organization not found.' };

      const org = orgs[idx];
      const isOrgAdmin = (org.admins || [org.createdBy]).includes(sessionEmail);
      if (!isOrgAdmin) return { success: false, error: 'Permission denied.' };

      const newKey = Math.random().toString(36).substr(2, 12).toUpperCase();
      org.orgKey = newKey;
      orgs[idx] = org;
      saveOrgs(orgs);
      return { success: true, newKey };
    },

    removeMemberFromOrg(orgId, targetEmail) {
      const sessionEmail = localStorage.getItem('session');
      if (targetEmail === sessionEmail) return { success: false, error: 'You cannot remove yourself.' };

      const orgs = getOrgs();
      const idx = orgs.findIndex(o => o.id === orgId);
      if (idx === -1) return { success: false, error: 'Organization not found.' };

      const org = orgs[idx];
      const isOrgAdmin = (org.admins || [org.createdBy]).includes(sessionEmail);
      if (!isOrgAdmin) return { success: false, error: 'Permission denied.' };

      // Cannot remove another admin
      if ((org.admins || []).includes(targetEmail)) {
        return { success: false, error: 'Cannot remove another admin.' };
      }

      org.members = org.members.filter(e => e !== targetEmail);
      orgs[idx] = org;
      saveOrgs(orgs);

      // Clear org from removed user
      const users = getUsers();
      if (users[targetEmail]) {
        users[targetEmail].organizationId = null;
        saveUsers(users);
      }

      return { success: true };
    },

    promoteToAdmin(orgId, targetEmail) {
      const sessionEmail = localStorage.getItem('session');
      const orgs = getOrgs();
      const idx = orgs.findIndex(o => o.id === orgId);
      if (idx === -1) return { success: false, error: 'Organization not found.' };

      const org = orgs[idx];
      const isOrgAdmin = (org.admins || [org.createdBy]).includes(sessionEmail);
      if (!isOrgAdmin) return { success: false, error: 'Permission denied.' };

      if (!org.members.includes(targetEmail)) {
        return { success: false, error: 'User is not a member of this organization.' };
      }

      if (!org.admins) org.admins = [org.createdBy];
      if (!org.admins.includes(targetEmail)) org.admins.push(targetEmail);
      orgs[idx] = org;
      saveOrgs(orgs);

      // Update user role to admin
      const users = getUsers();
      if (users[targetEmail]) {
        users[targetEmail].role = 'admin';
        users[targetEmail].organizationId = orgId;
        saveUsers(users);
      }

      return { success: true };
    },

    /* ── Org Join / Leave (Employee) ── */
    joinOrganization({ orgId, orgKey }) {
      const sessionEmail = localStorage.getItem('session');
      if (!sessionEmail) return { success: false, error: 'Not authenticated.' };

      const orgs = getOrgs();
      const idx = orgs.findIndex(o => o.id === orgId);
      if (idx === -1) return { success: false, error: 'Organization not found.' };

      const org = orgs[idx];

      if (org.members.includes(sessionEmail)) {
        return { success: false, error: 'You are already a member of this organization.' };
      }

      if (org.visibility === 'private' && org.orgKey !== orgKey) {
        return { success: false, error: 'Invalid organization key.' };
      }

      org.members.push(sessionEmail);
      orgs[idx] = org;
      saveOrgs(orgs);

      // Update user's organizationId
      const users = getUsers();
      if (users[sessionEmail]) {
        users[sessionEmail].organizationId = orgId;
        saveUsers(users);
        // Refresh session JWT with updated orgId
        setSession(users[sessionEmail], localStorage.getItem('authProvider') || 'email');
      }

      return { success: true, orgName: org.name };
    },

    leaveOrganization() {
      const sessionEmail = localStorage.getItem('session');
      if (!sessionEmail) return { success: false, error: 'Not authenticated.' };

      const users = getUsers();
      const user = users[sessionEmail];
      if (!user || !user.organizationId) return { success: false, error: 'You are not in an organization.' };

      const orgs = getOrgs();
      const idx = orgs.findIndex(o => o.id === user.organizationId);
      if (idx !== -1) {
        // Prevent the sole admin from leaving
        const org = orgs[idx];
        const admins = org.admins || [org.createdBy];
        if (admins.includes(sessionEmail) && admins.length === 1) {
          return { success: false, error: 'You are the sole admin. Transfer admin or delete the organization first.' };
        }
        org.members = org.members.filter(e => e !== sessionEmail);
        if (org.admins) org.admins = org.admins.filter(e => e !== sessionEmail);
        orgs[idx] = org;
        saveOrgs(orgs);
      }

      user.organizationId = null;
      saveUsers(users);
      setSession(user, localStorage.getItem('authProvider') || 'email');

      return { success: true };
    },

    /* ── User Data ── */
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
    }
  };
})(window);
