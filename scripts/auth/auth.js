document.addEventListener('DOMContentLoaded', () => {
  const helpers = window.AppHelpers;
  const api = window.NexusAPI;

  if (api.isAuthenticated()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const panelTitle = document.getElementById('panelTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const formErrors = document.getElementById('formErrors');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const toggleModeBtn = document.getElementById('toggleMode');
  const switchText = document.getElementById('switchText');
  const submitBtn = document.querySelector('.login-btn');

  // Dual Portal Tabs
  const portalPersonalBtn = document.getElementById('portalPersonalBtn');
  const portalOrgBtn = document.getElementById('portalOrgBtn');

  // Role Selector & Fields
  const roleSelector = document.getElementById('roleSelector');
  const roleAdminBtn = document.getElementById('roleAdminBtn');
  const roleEmployeeBtn = document.getElementById('roleEmployeeBtn');
  const nameField = document.getElementById('nameField');
  const signupName = document.getElementById('signupName');
  
  const adminOrgFields = document.getElementById('adminOrgFields');
  const orgName = document.getElementById('orgName');
  const orgKey = document.getElementById('orgKey');
  const orgVisibility = document.getElementById('orgVisibility');
  
  const employeeOrgFields = document.getElementById('employeeOrgFields');
  const orgSelect = document.getElementById('orgSelect');
  const employeeKeyField = document.getElementById('employeeKeyField');
  const employeeOrgKey = document.getElementById('employeeOrgKey');

  let loginMode = true;
  let portalScope = 'personal'; // 'personal' | 'organization'
  let orgRole = 'admin'; // 'admin' | 'employee'

  function getEffectiveRole() {
    if (portalScope === 'personal') return 'personal';
    return orgRole;
  }

  function populateOrgDropdown() {
    const orgs = api.getPublicOrganizations();
    if (!orgSelect) return;
    orgSelect.innerHTML = '<option value="">Select Organization</option>';
    orgs.forEach(org => {
      const opt = document.createElement('option');
      opt.value = org.id;
      opt.textContent = org.name + (org.visibility === 'private' ? ' 🔒' : '');
      opt.dataset.visibility = org.visibility;
      orgSelect.appendChild(opt);
    });
  }

  function updateFormVisibility() {
    if (formErrors) {
      formErrors.textContent = '';
      formErrors.classList.add('hidden');
    }

    // Portal Tabs UI
    if (portalScope === 'personal') {
      portalPersonalBtn?.classList.add('active');
      portalOrgBtn?.classList.remove('active');
      roleSelector?.classList.add('hidden');
      adminOrgFields?.classList.add('hidden');
      employeeOrgFields?.classList.add('hidden');
    } else {
      portalOrgBtn?.classList.add('active');
      portalPersonalBtn?.classList.remove('active');
      roleSelector?.classList.remove('hidden');

      if (!loginMode) {
        if (orgRole === 'admin') {
          adminOrgFields?.classList.remove('hidden');
          employeeOrgFields?.classList.add('hidden');
        } else {
          adminOrgFields?.classList.add('hidden');
          employeeOrgFields?.classList.remove('hidden');
          populateOrgDropdown();
        }
      } else {
        adminOrgFields?.classList.add('hidden');
        employeeOrgFields?.classList.add('hidden');
      }
    }

    // Login vs Signup mode UI
    if (loginMode) {
      nameField?.classList.add('hidden');
      adminOrgFields?.classList.add('hidden');
      employeeOrgFields?.classList.add('hidden');
      if (googleLoginBtn) googleLoginBtn.style.display = '';

      if (panelTitle) panelTitle.textContent = portalScope === 'personal' ? 'Welcome Back' : `Welcome Back (${orgRole.toUpperCase()})`;
      if (authSubtitle) authSubtitle.textContent = portalScope === 'personal' ? 'Log into your personal workspace' : `Log into your ${orgRole} team portal`;
      if (switchText) switchText.textContent = "Don't have an account?";
      if (toggleModeBtn) toggleModeBtn.textContent = 'Sign up';
      if (submitBtn) submitBtn.textContent = 'Log In';
    } else {
      nameField?.classList.remove('hidden');
      if (googleLoginBtn) googleLoginBtn.style.display = 'none';

      if (panelTitle) panelTitle.textContent = portalScope === 'personal' ? 'Create Personal Account' : `Create ${orgRole === 'admin' ? 'Organization' : 'Employee'} Account`;
      if (authSubtitle) authSubtitle.textContent = portalScope === 'personal' ? 'Start managing your personal tasks & heatmap' : 'Join or create your company workspace';
      if (switchText) switchText.textContent = 'Already have an account?';
      if (toggleModeBtn) toggleModeBtn.textContent = 'Log in';
      if (submitBtn) submitBtn.textContent = 'Sign Up';
    }
  }

  function toggleMode() {
    loginMode = !loginMode;
    updateFormVisibility();
  }

  function showError(msg) {
    if (formErrors) {
      formErrors.textContent = msg;
      formErrors.classList.remove('hidden');
    }
  }

  // Portal Switcher Listeners
  portalPersonalBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    portalScope = 'personal';
    updateFormVisibility();
  });

  portalOrgBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    portalScope = 'organization';
    updateFormVisibility();
  });

  // Org Role Switcher Listeners
  roleAdminBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    orgRole = 'admin';
    roleAdminBtn.classList.add('active');
    roleEmployeeBtn.classList.remove('active');
    updateFormVisibility();
  });

  roleEmployeeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    orgRole = 'employee';
    roleEmployeeBtn.classList.add('active');
    roleAdminBtn.classList.remove('active');
    updateFormVisibility();
  });

  orgSelect?.addEventListener('change', () => {
    const selectedOpt = orgSelect.options[orgSelect.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.visibility === 'private') {
      employeeKeyField?.classList.remove('hidden');
    } else {
      employeeKeyField?.classList.add('hidden');
    }
  });

  toggleModeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMode();
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formErrors) formErrors.classList.add('hidden');

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const role = getEffectiveRole();

    if (loginMode) {
      const { valid, errors } = helpers.validateLoginFields({ email, password, role });
      if (!valid) {
        showError(errors[0]);
        return;
      }

      const res = await api.login({ email, password, role });
      if (res.success) {
        window.location.href = 'dashboard.html';
      } else {
        showError(res.error || 'Login failed');
      }
    } else {
      const formData = {
        name: signupName ? signupName.value : '',
        email,
        password,
        role,
        orgName: orgName ? orgName.value : '',
        orgKey: role === 'admin' ? (orgKey ? orgKey.value : '') : (employeeOrgKey ? employeeOrgKey.value : ''),
        orgVisibility: orgVisibility ? orgVisibility.value : 'public',
        orgId: orgSelect ? orgSelect.value : ''
      };

      const { valid, errors } = helpers.validateSignupFields(formData);
      if (!valid) {
        showError(errors[0]);
        return;
      }

      const res = await api.signup(formData);
      if (res.success) {
        window.location.href = 'dashboard.html';
      } else {
        showError(res.error || 'Signup failed');
      }
    }
  });

  googleLoginBtn?.addEventListener('click', async () => {
    const mockEmail = `user.${Math.floor(Math.random() * 1000)}@gmail.com`;
    const mockName = 'Google Developer';
    const res = await api.signup({
      name: mockName,
      email: mockEmail,
      password: 'google_oauth_pass',
      role: 'personal'
    });
    if (res.success) {
      window.location.href = 'dashboard.html';
    } else {
      showError(res.error || 'Google login failed');
    }
  });

  updateFormVisibility();
});
