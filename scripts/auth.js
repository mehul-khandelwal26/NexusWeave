const DB_KEY = 'users';
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

function reg() {
  const users = localStorage.getItem(DB_KEY);
  return users ? JSON.parse(users) : {};
}

function sav(users) {
  localStorage.setItem(DB_KEY, JSON.stringify(users));
}

function createJwtToken(email, provider = 'email') {
  const payload = {
    sub: email,
    email,
    provider,
    exp: Date.now() + 1000 * 60 * 60 * 4
  };
  return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify(payload))}.signature`;
}

function setAuthSession(email, provider = 'email') {
  localStorage.setItem(SESSION_KEY, email);
  localStorage.setItem(JWT_KEY, createJwtToken(email, provider));
  localStorage.setItem(PROVIDER_KEY, provider);
}

function showErrors(errors) {
  errorsBox.innerHTML = errors.map((message) => `<div>${message}</div>`).join('');
}

function clearErrors() {
  errorsBox.textContent = '';
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

googleBtn.addEventListener('click', function () {
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

  const users = reg();
  if (!users[normalizedEmail]) {
    users[normalizedEmail] = helpers.createUserProfile(normalizedEmail, 'google-sign-in');
    sav(users);
  }

  userin.value = normalizedEmail;
  setAuthSession(normalizedEmail, 'google');
  window.location.href = 'dashboard.html';
});

form.addEventListener('submit', function (e) {
  e.preventDefault();
  clearErrors();

  const email = userin.value.trim();
  const password = passin.value;
  const validation = helpers.validateAuthFields(email, password);

  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }

  const users = reg();

  if (!loginMode) {
    if (users[email]) {
      showErrors(['An account with that email already exists.']);
      return;
    }

    users[email] = helpers.createUserProfile(email, password);
    sav(users);
    setAuthSession(email, 'email');
    window.location.href = 'dashboard.html';
    return;
  }

  const user = users[email];
  if (!user) {
    showErrors(['Account not found.']);
    return;
  }

  if (user.password !== password) {
    showErrors(['Incorrect password.']);
    return;
  }

  setAuthSession(email, 'email');
  window.location.href = 'dashboard.html';
});

window.addEventListener('load', () => {
  const session = localStorage.getItem(SESSION_KEY);
  const jwt = localStorage.getItem(JWT_KEY);
  if (session && jwt) {
    window.location.href = 'dashboard.html';
  }
});
