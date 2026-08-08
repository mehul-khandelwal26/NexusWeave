document.addEventListener('DOMContentLoaded', () => {
  const helpers = window.AppHelpers;
  const api = window.NexusAPI;

  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const panelTitle = document.getElementById('panelTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const formErrors = document.getElementById('formErrors');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const demoLoginBtn = document.getElementById('demoLoginBtn');

  // Toggle Password Visibility
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      const eyeShow = togglePasswordBtn.querySelector('.eye-show');
      const eyeHide = togglePasswordBtn.querySelector('.eye-hide');
      if (eyeShow && eyeHide) {
        eyeShow.classList.toggle('hidden', isPassword);
        eyeHide.classList.toggle('hidden', !isPassword);
      }
    });
  }

  // Gmail Auto-Fill Button
  const gmailAppendBtn = document.getElementById('gmailAppendBtn');
  if (gmailAppendBtn && emailInput) {
    gmailAppendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      let val = emailInput.value.trim();
      if (!val) {
        emailInput.value = 'user@gmail.com';
      } else if (val.includes('@')) {
        emailInput.value = val.split('@')[0] + '@gmail.com';
      } else {
        emailInput.value = val + '@gmail.com';
      }
      emailInput.focus({ preventScroll: true });
    });
  }

  // Pixel-Perfect Top Scroll Calculator for Sign In Card
  function scrollToSignIn() {
    const panelCard = document.querySelector('.panel-card');
    const navbar = document.querySelector('.site-header');
    const navHeight = navbar ? navbar.offsetHeight + 16 : 80;
    if (panelCard) {
      const targetY = panelCard.getBoundingClientRect().top + window.pageYOffset - navHeight;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Bind to all Sign In links and hash targets
  document.querySelectorAll('a[href="#auth"], a[href="#hero"], a[href="#loginForm"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      if (link.classList.contains('primary-link') || link.textContent.includes('Get Started')) {
        loginMode = false;
        updateFormVisibility();
        setTimeout(() => {
          if (signupName) signupName.focus({ preventScroll: true });
        }, 150);
      }
      
      scrollToSignIn();
    });
  });

  if (window.location.hash === '#auth' || window.location.hash === '#hero') {
    setTimeout(scrollToSignIn, 150);
  }

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

  const toggleModeBtn = document.getElementById('toggleMode');
  const switchText = document.getElementById('switchText');
  const submitBtn = document.querySelector('.login-btn');

  let loginMode = true;
  let portalScope = 'personal'; // 'personal' | 'organization'
  let orgRole = 'admin'; // 'admin' | 'employee'

  function getEffectiveRole() {
    if (portalScope === 'personal') return 'personal';
    return orgRole;
  }

  async function populateOrgDropdown() {
    const orgs = await api.getPublicOrganizations();
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

    // Portal Tabs UI & Sliding Pill
    const pill = document.getElementById('portalTabPill');
    if (pill) {
      pill.style.transform = portalScope === 'personal' ? 'translateX(0)' : 'translateX(100%)';
    }

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

      if (panelTitle) panelTitle.textContent = portalScope === 'personal' ? 'Welcome Back' : `Welcome Back (${orgRole.toUpperCase()})`;
      if (authSubtitle) authSubtitle.textContent = portalScope === 'personal' ? 'Log into your personal workspace' : `Log into your ${orgRole} team portal`;
      if (switchText) switchText.textContent = "Don't have an account?";
      if (toggleModeBtn) toggleModeBtn.textContent = 'Sign up';
      if (submitBtn) submitBtn.textContent = 'Log In';
    } else {
      nameField?.classList.remove('hidden');

      if (panelTitle) panelTitle.textContent = portalScope === 'personal' ? 'Create Personal Account' : `Create ${orgRole === 'admin' ? 'Organization' : 'Employee'} Account`;
      if (authSubtitle) authSubtitle.textContent = portalScope === 'personal' ? 'Start managing your personal tasks & heatmap' : 'Join or create your company workspace';
      if (switchText) switchText.textContent = 'Already have an account?';
      if (toggleModeBtn) toggleModeBtn.textContent = 'Log in';
      if (submitBtn) submitBtn.textContent = 'Sign Up';
    }
  }

  // Real-Time Inline Email Validation
  if (emailInput) {
    const feedback = document.getElementById('emailFeedback');
    emailInput.addEventListener('input', () => {
      const val = emailInput.value.trim();
      if (!feedback) return;
      if (!val) {
        feedback.textContent = '';
        feedback.className = 'email-feedback-badge';
        return;
      }
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
      if (isValid) {
        feedback.textContent = '✓ Valid email format';
        feedback.className = 'email-feedback-badge valid';
      } else {
        feedback.textContent = '✕ Please enter a valid work email (name@company.com)';
        feedback.className = 'email-feedback-badge invalid';
      }
    });
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

  async function handleAuthSubmission() {
    if (formErrors) formErrors.classList.add('hidden');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const role = getEffectiveRole();

    if (loginMode) {
      const { valid, errors } = helpers.validateLoginFields({ email, password, role });
      if (!valid) {
        showError(errors[0]);
        return;
      }

      const res = await api.login({ email, password, role });
      if (res.success) {
        const explicitTheme = sessionStorage.getItem('explicit-theme');
        if (explicitTheme && explicitTheme !== res.user.theme) {
          await api.updateProfile({ theme: explicitTheme });
        }
        sessionStorage.removeItem('explicit-theme');
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
        orgId: orgSelect ? orgSelect.value : '',
        theme: localStorage.getItem('nexus-theme') || 'dark'
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
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleAuthSubmission();
  });

  // Demo Quick Login Button
  demoLoginBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (emailInput) emailInput.value = 'demo@nexusweave.com';
    if (passwordInput) passwordInput.value = 'password123';
    loginMode = true;
    updateFormVisibility();
    await handleAuthSubmission();
  });

  // Google Sign-In / Sign-Up via Google Identity Services (GIS).
  // The styled "Continue with Google" button proxies a click to Google's own
  // hidden button, since GIS requires its official widget to be the thing the
  // user actually clicks (for security/anti-automation reasons).
  const gsiButtonContainer = document.getElementById('gsiButtonContainer');
  let gsiReady = false;

  async function handleGoogleCredential(response) {
    if (!response || !response.credential) {
      showError('Google sign-in failed. Please try again.');
      return;
    }

    const role = getEffectiveRole();
    const payload = {
      credential: response.credential,
      role,
      theme: localStorage.getItem('nexus-theme') || 'dark'
    };

    // Only relevant when signing up through the Organization portal.
    if (!loginMode && role === 'admin') {
      payload.orgName = orgName ? orgName.value : '';
      payload.orgKey = orgKey ? orgKey.value : '';
      payload.orgVisibility = orgVisibility ? orgVisibility.value : 'public';
    } else if (!loginMode && role === 'employee') {
      payload.orgId = orgSelect ? orgSelect.value : '';
      payload.orgKey = employeeOrgKey ? employeeOrgKey.value : '';
    }

    const res = await api.googleAuth(payload);
    if (res.success) {
      window.location.href = 'dashboard.html';
    } else {
      showError(res.error || 'Google sign-in failed.');
    }
  }

  async function initGoogleSignIn() {
    if (!window.google?.accounts?.id || !gsiButtonContainer) return;
    try {
      const clientId = await api.getGoogleClientId();
      if (!clientId) {
        console.warn('Google Client ID not found. Did you forget to restart your backend server after updating .env?');
        return; // Not configured server-side yet.
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton(gsiButtonContainer, {
        type: 'standard',
        theme: 'outline',
        size: 'large'
      });
      gsiReady = true;
    } catch (err) {
      console.error('Failed to initialize Google Sign-In:', err);
    }
  }
  // If the Google script is loaded asynchronously, window.google might not exist yet.
  function tryInitGoogle() {
    if (window.google && window.google.accounts) {
      initGoogleSignIn();
    } else {
      setTimeout(tryInitGoogle, 200); // Check again in 200ms
    }
  }
  
  if (document.readyState === 'complete') {
    tryInitGoogle();
  } else {
    window.addEventListener('load', tryInitGoogle);
  }

  googleLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!gsiReady) {
      showError('Google sign-in is not available right now. Please use email and password.');
      return;
    }
    // Proxy the click to Google's real, official button.
    const realGoogleBtn = gsiButtonContainer.querySelector('div[role="button"]');
    if (realGoogleBtn) {
      realGoogleBtn.click();
    } else {
      showError('Google sign-in is not available right now. Please use email and password.');
    }
  });

  updateFormVisibility();
});
