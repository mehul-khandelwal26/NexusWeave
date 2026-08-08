/* ============================================================
   NexusWeave — Organization Management
   Handles: Admin panel (view members, remove, promote, key)
            Employee panel (search, join public/private orgs)
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── Auth Guard ── */
  let currentUser = api ? api.getMe() : null;
  let searchDebounceTimer = null;
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  async function bootstrapOrgPage() {
    try {
      if (api.refreshMe) {
        const refreshed = await api.refreshMe();
        if (refreshed) {
          currentUser = refreshed;
        }
      }
    } catch (err) {
      console.warn('Org page refresh failed; using local session.', err);
    }
    startOrgUI();
  }

  function startOrgUI() {
  const isAdmin = currentUser.role === 'admin';

  /* ── Panel Visibility ── */
  const adminPanel = document.getElementById('adminPanel');
  const employeePanel = document.getElementById('employeePanel');
  const pageRoleLabel = document.getElementById('pageRoleLabel');

  if (isAdmin) {
    if (adminPanel) adminPanel.classList.remove('hidden');
    if (employeePanel) employeePanel.classList.add('hidden');
    if (pageRoleLabel) pageRoleLabel.textContent = '🛡️ Admin Panel';
  } else {
    if (adminPanel) adminPanel.classList.add('hidden');
    if (employeePanel) employeePanel.classList.remove('hidden');
    if (pageRoleLabel) pageRoleLabel.textContent = currentUser.role === 'personal' ? '👤 Personal Account — Join Org' : '👤 Member Panel';
  }

  /* ─────────────────────────────────────────────
     NOTIFICATION SYSTEM
  ───────────────────────────────────────────── */
  const notifContainer = document.getElementById('orgNotifContainer');

  function showNotif(message, type = 'info') {
    if (!notifContainer) return;
    const notif = document.createElement('div');
    notif.className = `org-notif org-notif-${type}`;
    notif.innerHTML = `
      <span class="org-notif-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
      <span>${esc(message)}</span>
      <button class="org-notif-close" type="button">×</button>
    `;
    notif.querySelector('.org-notif-close').addEventListener('click', () => notif.remove());
    notifContainer.appendChild(notif);

    // Animate in
    requestAnimationFrame(() => notif.classList.add('org-notif-visible'));

    // Auto-dismiss after 4s
    setTimeout(() => {
      notif.classList.remove('org-notif-visible');
      setTimeout(() => notif.remove(), 350);
    }, 4000);
  }

  /* ─────────────────────────────────────────────
     ADMIN PANEL
  ───────────────────────────────────────────── */
  if (isAdmin) {
    const orgNameDisplay = document.getElementById('orgNameDisplay');
    const orgVisibilityDisplay = document.getElementById('orgVisibilityDisplay');
    const orgVisibilityDisplay = document.getElementById('orgVisibilityDisplay');
    const orgKeyValue = document.getElementById('orgKeyValue');
    const toggleKeyBtn = document.getElementById('toggleKeyVisibility');
    const copyKeyBtn = document.getElementById('copyOrgKey');
    const memberList = document.getElementById('memberList');
    const memberCount = document.getElementById('memberCount');
    const orgMemberSearch = document.getElementById('orgMemberSearch');

    // Edit org form
    const editOrgNameInput = document.getElementById('editOrgName');
    const editOrgVisibilityInput = document.getElementById('editOrgVisibility');
    const saveOrgBtn = document.getElementById('saveOrgSettings');
    const regenKeyBtn = document.getElementById('regenOrgKey');

    // Load current admin's org from backend
    async function loadAdminOrg() {
      const org = await api.fetchOrganization(currentUser.organizationId);
      if (!org) {
        showNotif('No organization found. Please re-register or refresh after login.', 'error');
        return;
      }

      if (orgNameDisplay) orgNameDisplay.textContent = org.name;
      if (orgVisibilityDisplay) {
        orgVisibilityDisplay.textContent = org.visibility === 'private' ? '🔒 Private' : '🌐 Public';
        orgVisibilityDisplay.className = `org-badge ${org.visibility === 'private' ? 'badge-private' : 'badge-public'}`;
      }
      if (orgKeyValue) orgKeyValue.value = org.orgKey || '';
      if (editOrgNameInput) editOrgNameInput.value = org.name;
      if (editOrgVisibilityInput) editOrgVisibilityInput.value = org.visibility;

      renderMembers(org);
    }

    // Render member list
    async function renderMembers(org, filter = '') {
      if (!memberList) return;

      const allUsers = await api.getAllUsersInOrg(org.id);
      if (!allUsers) {
        memberList.innerHTML = `<div class="empty-inline">Failed to load members.</div>`;
        return;
      }
      const filtered = filter
        ? allUsers.filter(u =>
            u.name.toLowerCase().includes(filter.toLowerCase()) ||
            u.email.toLowerCase().includes(filter.toLowerCase())
          )
        : allUsers;

      if (memberCount) memberCount.textContent = allUsers.length;

      if (!filtered.length) {
        memberList.innerHTML = `<div class="empty-inline">No members found.</div>`;
        return;
      }

      const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      memberList.innerHTML = filtered.map(member => {
        const isSelf = member.email === currentUser.email;
        const isThisAdmin = member.role === 'admin';
        return `
          <div class="member-row" data-email="${esc(member.email)}">
            <div class="member-info">
              <span class="member-avatar">${esc((member.name || member.email || 'U').charAt(0).toUpperCase())}</span>
              <div class="member-details">
                <strong>${esc(member.name || 'Unknown')}</strong>
                <small>${esc(member.email)}</small>
              </div>
            </div>
            <div class="member-actions">
              <span class="org-badge ${isThisAdmin ? 'badge-admin' : 'badge-employee'}">${isThisAdmin ? '🛡️ Admin' : '👤 Employee'}</span>
              ${!isSelf && !isThisAdmin ? `<button class="inline-btn" data-action="promote" data-email="${esc(member.email)}">Promote</button>` : ''}
              ${!isSelf ? `<button class="inline-btn danger" data-action="remove" data-email="${esc(member.email)}">Remove</button>` : '<span class="member-you-tag">You</span>'}
            </div>
          </div>
        `;
      }).join('');

      // Bind actions
      memberList.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const email = btn.dataset.email;
          if (action === 'remove') handleRemoveMember(email);
          if (action === 'promote') handlePromoteMember(email);
        });
      });
    }

    // Remove member
    async function handleRemoveMember(email) {
      if (!confirm(`Remove ${email} from the organization?`)) return;
      const result = await api.removeMemberFromOrg(currentUser.organizationId, email);
      if (result && result.success) {
        showNotif(`${email} has been removed from the organization.`, 'success');
        loadAdminOrg();
      } else {
        showNotif(result.error || 'Failed to remove member.', 'error');
      }
    }

    // Promote member to admin
    async function handlePromoteMember(email) {
      if (!confirm(`Promote ${email} to Admin? They will gain full org management access.`)) return;
      const result = await api.promoteToAdmin(currentUser.organizationId, email);
      if (result && result.success) {
        showNotif(`${email} has been promoted to Admin.`, 'success');
        loadAdminOrg();
      } else {
        showNotif(result.error || 'Failed to promote member.', 'error');
      }
    }

    // Toggle key visibility
    let keyVisible = false;
    if (toggleKeyBtn && orgKeyValue) {
      orgKeyValue.type = 'password';
      toggleKeyBtn.addEventListener('click', () => {
        keyVisible = !keyVisible;
        orgKeyValue.type = keyVisible ? 'text' : 'password';
        toggleKeyBtn.textContent = keyVisible ? '🙈 Hide' : '👁 Show';
      });
    }

    // Copy key
    if (copyKeyBtn && orgKeyValue) {
      copyKeyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(orgKeyValue.value).then(() => {
          showNotif('Organization key copied to clipboard!', 'success');
        }).catch(() => {
          showNotif('Could not copy. Please copy manually.', 'warning');
        });
      });
    }

    // Regenerate key
    if (regenKeyBtn) {
      regenKeyBtn.addEventListener('click', async () => {
        if (!confirm('Regenerate the organization key? Employees with the old key will not be able to join with it.')) return;
        const result = await api.regenerateOrgKey(currentUser.organizationId);
        if (result && result.success) {
          if (orgKeyValue) orgKeyValue.value = result.newKey;
          showNotif('Organization key regenerated successfully!', 'success');
        } else {
          showNotif(result.error || 'Failed to regenerate key.', 'error');
        }
      });
    }

    // Save org settings
    if (saveOrgBtn) {
      saveOrgBtn.addEventListener('click', async () => {
        const newName = (editOrgNameInput?.value || '').trim();
        const newVisibility = editOrgVisibilityInput?.value;
        if (!newName) { showNotif('Organization name cannot be empty.', 'error'); return; }

        const result = await api.updateOrgSettings(currentUser.organizationId, { name: newName, visibility: newVisibility });
        if (result && result.success) {
          showNotif('Organization settings saved!', 'success');
          loadAdminOrg();
        } else {
          showNotif(result.error || 'Failed to save settings.', 'error');
        }
      });
    }

    // Member search
    if (orgMemberSearch) {
      orgMemberSearch.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(async () => {
          const org = await api.fetchOrganization(currentUser.organizationId);
          if (org) renderMembers(org, orgMemberSearch.value);
        }, 300);
      });
    }

    loadAdminOrg();
  }

  /* ─────────────────────────────────────────────
     EMPLOYEE PANEL
  ───────────────────────────────────────────── */
  if (!isAdmin) {
    const orgSearchInput = document.getElementById('orgSearchInput');
    const orgSearchBtn = document.getElementById('orgSearchBtn');
    const orgResultsList = document.getElementById('orgResultsList');
    const currentOrgCard = document.getElementById('currentOrgCard');
    const currentOrgName = document.getElementById('currentOrgName');
    const currentOrgVisibility = document.getElementById('currentOrgVisibility');
    const currentOrgMembers = document.getElementById('currentOrgMembers');
    const leaveOrgBtn = document.getElementById('leaveOrgBtn');

    // Join org modal elements
    const joinModal = document.getElementById('joinOrgModal');
    const joinModalOrgName = document.getElementById('joinModalOrgName');
    const joinKeyField = document.getElementById('joinKeyField');
    const joinOrgKeyInput = document.getElementById('joinOrgKey');
    const confirmJoinBtn = document.getElementById('confirmJoinBtn');
    const cancelJoinBtn = document.getElementById('cancelJoinBtn');
    const closeJoinModal = document.getElementById('closeJoinModal');

    let pendingJoinOrgId = null;

    // Show current org if already in one
    async function renderCurrentOrg() {
      if (!currentUser.organizationId) {
        if (currentOrgCard) currentOrgCard.classList.add('hidden');
        return;
      }
      const org = await api.fetchOrganization(currentUser.organizationId);
      if (!org) {
        if (currentOrgCard) currentOrgCard.classList.add('hidden');
        return;
      }
      if (currentOrgCard) currentOrgCard.classList.remove('hidden');
      if (currentOrgName) currentOrgName.textContent = org.name;
      if (currentOrgVisibility) {
        currentOrgVisibility.textContent = org.visibility === 'private' ? '🔒 Private' : '🌐 Public';
        currentOrgVisibility.className = `org-badge ${org.visibility === 'private' ? 'badge-private' : 'badge-public'}`;
      }
      const memberCountVal = org.memberCount != null ? org.memberCount : (org.members || []).length;
      if (currentOrgMembers) currentOrgMembers.textContent = `${memberCountVal} member${memberCountVal !== 1 ? 's' : ''}`;
    }

    // Search organizations
    async function searchOrgs(query = '') {
      const all = await api.searchOrganizations(query);
      if (!orgResultsList) return;

      if (!all) return;
      if (!all.length) {
        orgResultsList.innerHTML = `<div class="empty-inline">${query ? 'No organizations match your search.' : 'No organizations exist yet. Ask an admin to create one.'}</div>`;
        return;
      }

      orgResultsList.innerHTML = all.map(org => {
        const isCurrentOrg = org.id === currentUser.organizationId;
        return `
          <div class="org-result-card">
            <div class="org-result-info">
              <strong>${esc(org.name)}</strong>
              <span class="org-badge ${org.visibility === 'private' ? 'badge-private' : 'badge-public'}">${org.visibility === 'private' ? '🔒 Private' : '🌐 Public'}</span>
              <small class="org-result-meta">${org.memberCount} member${org.memberCount !== 1 ? 's' : ''}</small>
            </div>
            <div>
              ${isCurrentOrg
                ? '<span class="org-badge badge-current">✓ Joined</span>'
                : `<button class="primary-btn org-join-btn" data-org-id="${esc(org.id)}" data-org-name="${esc(org.name)}" data-org-visibility="${esc(org.visibility)}">Join</button>`
              }
            </div>
          </div>
        `;
      }).join('');

      // Bind join buttons
      orgResultsList.querySelectorAll('.org-join-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const orgId = btn.dataset.orgId;
          const orgName = btn.dataset.orgName;
          const visibility = btn.dataset.orgVisibility;
          openJoinModal(orgId, orgName, visibility);
        });
      });
    }

    // Open join modal
    function openJoinModal(orgId, orgName, visibility) {
      pendingJoinOrgId = orgId;
      if (joinModalOrgName) joinModalOrgName.textContent = orgName;

      // Show/hide key field based on visibility
      if (joinKeyField) {
        if (visibility === 'private') {
          joinKeyField.classList.remove('hidden');
        } else {
          joinKeyField.classList.add('hidden');
          if (joinOrgKeyInput) joinOrgKeyInput.value = '';
        }
      }
      if (joinModal) joinModal.classList.remove('hidden');
    }

    function closeJoinModalFn() {
      if (joinModal) joinModal.classList.add('hidden');
      if (joinOrgKeyInput) joinOrgKeyInput.value = '';
      pendingJoinOrgId = null;
    }

    if (cancelJoinBtn) cancelJoinBtn.addEventListener('click', closeJoinModalFn);
    if (closeJoinModal) closeJoinModal.addEventListener('click', closeJoinModalFn);
    if (joinModal) {
      joinModal.addEventListener('click', e => {
        if (e.target === joinModal) closeJoinModalFn();
      });
    }

    // Confirm join
    if (confirmJoinBtn) {
      confirmJoinBtn.addEventListener('click', async () => {
        if (!pendingJoinOrgId) return;
        const orgKey = joinOrgKeyInput ? joinOrgKeyInput.value.trim() : '';

        confirmJoinBtn.disabled = true;
        confirmJoinBtn.textContent = 'Joining…';

        const result = await api.joinOrganization({ orgId: pendingJoinOrgId, orgKey });
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = 'Join Organization';

        if (result && result.success) {
          closeJoinModalFn();
          showNotif(`🎉 You've joined ${esc(result.orgName)} successfully!`, 'success');
          const freshUser = api.getMe();
          if (freshUser) {
            currentUser.organizationId = freshUser.organizationId;
            currentUser.role = freshUser.role;
          }

          await renderCurrentOrg();
          searchOrgs(orgSearchInput ? orgSearchInput.value.trim() : '');
          // Soft reload so admin/employee panels reflect new role/JWT
          setTimeout(() => window.location.reload(), 800);
        } else {
          showNotif(result.error || 'Failed to join organization.', 'error');
        }
      });
    }

    // Search button + enter key
    if (orgSearchBtn) {
      orgSearchBtn.addEventListener('click', () => searchOrgs(orgSearchInput ? orgSearchInput.value.trim() : ''));
    }
    if (orgSearchInput) {
      orgSearchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') searchOrgs(orgSearchInput.value.trim());
      });
      orgSearchInput.addEventListener('input', () => {
        // Live search with debounce
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => searchOrgs(orgSearchInput.value.trim()), 300);
      });
    }

    // Leave org
    if (leaveOrgBtn) {
      leaveOrgBtn.addEventListener('click', async () => {
        if (!confirm('Leave your current organization? You can re-join later.')) return;
        const result = await api.leaveOrganization();
        if (result && result.success) {
          showNotif('You have left the organization.', 'info');
          currentUser.organizationId = null;
          renderCurrentOrg();
          searchOrgs();
        } else {
          showNotif(result.error || 'Failed to leave organization.', 'error');
        }
      });
    }

    // Initial render
    renderCurrentOrg();
    searchOrgs();
  }
  } // end startOrgUI

  bootstrapOrgPage();
})();
