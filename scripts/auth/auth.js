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
  let selectedRole = 'admin';

  function populateOrgDropdown() {
    const orgs = api.getPublicOrganizations();
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
    formErrors.textContent = '';
    formErrors.classList.add('hidden');

    if (loginMode) {
      nameField.classList.add('hidden');
      adminOrgFields.classList.add('hidden');
      employeeOrgFields.classList.add('hidden');
      googleLoginBtn.style.display = '';
    } else {
      nameField.classList.remove('hidden');
      googleLoginBtn.style.display = 'none';

      if (selectedRole === 'admin') {
        adminOrgFields.classList.remove('hidden');
        employeeOrgFields.classList.add('hidden');
      } else {
        adminOrgFields.classList.add('hidden');
        employeeOrgFields.classList.remove('hidden');
        populateOrgDropdown();
      }
    }
  }

  function toggleMode() {
    loginMode = !loginMode;
    if (loginMode) {
      panelTitle.textContent = 'Welcome Back';
      authSubtitle.textContent = 'Enter your details to access your account.';
      switchText.textContent = "Don't have an account?";
      toggleModeBtn.textContent = 'Sign up';
      submitBtn.textContent = 'Log In';
    } else {
      panelTitle.textContent = 'Create an Account';
      authSubtitle.textContent = 'Sign up to start managing your tasks efficiently.';
      switchText.textContent = 'Already have an account?';
      toggleModeBtn.textContent = 'Log in';
      submitBtn.textContent = 'Sign Up';
    }
    updateFormVisibility();
  }

  function showError(msg) {
    formErrors.textContent = msg;
    formErrors.classList.remove('hidden');
  }

  roleAdminBtn.addEventListener('click', (e) => {
    e.preventDefault();
    selectedRole = 'admin';
    roleAdminBtn.classList.add('active');
    roleEmployeeBtn.classList.remove('active');
    updateFormVisibility();
  });

  roleEmployeeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    selectedRole = 'employee';
    roleEmployeeBtn.classList.add('active');
    roleAdminBtn.classList.remove('active');
    updateFormVisibility();
  });

  orgSelect.addEventListener('change', () => {
    const selectedOpt = orgSelect.options[orgSelect.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.visibility === 'private') {
      employeeKeyField.classList.remove('hidden');
    } else {
      employeeKeyField.classList.add('hidden');
    }
  });

  toggleModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMode();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formErrors.classList.add('hidden');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (loginMode) {
      const { valid, errors } = helpers.validateLoginFields({ email, password, role: selectedRole });
      if (!valid) {
        showError(errors[0]);
        return;
      }

      const res = await api.login({ email, password, role: selectedRole });
      if (res.success) {
        window.location.href = 'dashboard.html';
      } else {
        showError(res.error || 'Login failed');
      }
    } else {
      const formData = {
        name: signupName.value,
        email,
        password,
        role: selectedRole,
        orgName: orgName.value,
        orgKey: selectedRole === 'admin' ? orgKey.value : employeeOrgKey.value,
        orgVisibility: orgVisibility.value,
        orgId: orgSelect.value
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

  googleLoginBtn.addEventListener('click', () => {
    showError('Google login is mock implemented via standard auth for now.');
  });
  
  updateFormVisibility();
});
