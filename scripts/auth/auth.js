const API_BASE = 'http://localhost:4000/api';

const SESSION_KEY = 'session';
const JWT_KEY = 'jwt';
const PROVIDER_KEY = 'authProvider';
const helpers = window.AppHelpers;

const form = document.getElementById('loginForm');
const userin = document.getElementById('email');
const passin = document.getElementById('password');
const switchh = document.getElementById('toggleMode');
const title = document.getElementById('panelTitle');
const subtitle = document.getElementById('authSubtitle');
const submit = document.querySelector('.login-btn');
const errorsBox = document.getElementById('formErrors');
const googleBtn = document.getElementById('googleLoginBtn');
const switchText = document.getElementById('switchText');

let loginMode = true;

function setAuthSession(token, user) {
  localStorage.setItem(SESSION_KEY, user.email);
  localStorage.setItem(JWT_KEY, token);
  localStorage.setItem(PROVIDER_KEY, user.provider);
}

function showErrors(errors) {
  errorsBox.innerHTML = errors.map((message) => `<div>${message}</div>`).join('');
}

function clearErrors() {
  errorsBox.textContent = '';
}

async function callApi(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    return { ok: false, errors: ['Could not reach the server. Is the backend running?'] };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, errors: data.errors || ['Something went wrong. Please try again.'] };
  }
  return { ok: true, ...data };
}

function toggleMode() {
  loginMode = !loginMode;
  if (loginMode) {
    title.textContent = 'Welcome back';
    subtitle.textContent = 'Log into your workspace';
    submit.textContent = 'Login';
    switchText.textContent = 'Don’t have an account?';
    switchh.textContent = 'Sign up';
  } else {
    title.textContent = 'Create account';
    subtitle.textContent = 'Start your next focused week';
    submit.textContent = 'Sign up';
    switchText.textContent = 'Already have an account?';
    switchh.textContent = 'Login';
  }
}

switchh.addEventListener('click', function (e) {
  e.preventDefault();
  clearErrors();
  toggleMode();
});

googleBtn.addEventListener('click', async function () {
  clearErrors();
  const requestedEmail = window.prompt('Enter your Google email to continue', userin.value.trim() || 'you@gmail.com');
  if (!requestedEmail) {
    showErrors(['Google sign-in was cancelled.']);
    return;
  }

  const normalizedEmail = requestedEmail.trim();
  if (!helpers.isValidEmail(normalizedEmail)) {
    showErrors(['Please enter a valid Google email address.']);
    return;
  }

  const result = await callApi('/auth/google-demo', { email: normalizedEmail });
  if (!result.ok) {
    showErrors(result.errors);
    return;
  }

  userin.value = normalizedEmail;
  setAuthSession(result.token, result.user);
  window.location.href = 'dashboard.html';
});

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  clearErrors();

  const email = userin.value.trim();
  const password = passin.value;
  const validation = helpers.validateAuthFields(email, password);

  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }

  submit.disabled = true;
  const endpoint = loginMode ? '/auth/login' : '/auth/signup';
  const result = await callApi(endpoint, { email, password });
  submit.disabled = false;

  if (!result.ok) {
    showErrors(result.errors);
    return;
  }

  setAuthSession(result.token, result.user);
  window.location.href = 'dashboard.html';
});

window.addEventListener('load', async () => {
  const jwt = localStorage.getItem(JWT_KEY);
  if (!jwt) return;

  // Verify the stored token is still valid before trusting the session.
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    if (response.ok) {
      window.location.href = 'dashboard.html';
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(JWT_KEY);
      localStorage.removeItem(PROVIDER_KEY);
    }
  } catch {

  }
});