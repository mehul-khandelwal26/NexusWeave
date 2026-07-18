(function () {
  const trigger = document.querySelector('[data-profile-menu-trigger]');
  const menu = document.querySelector('[data-profile-menu]');
  const avatar = document.querySelector('[data-profile-avatar]');
  const name = document.querySelector('[data-profile-name]');
  const email = document.querySelector('[data-profile-email]');
  const sessionEmail = localStorage.getItem('session');

  if (!trigger || !menu) return;

  function updateProfile() {
    const currentSession = localStorage.getItem('session');
    const displayName = currentSession ? currentSession.split('@')[0] : 'Profile';
    const initial = displayName.charAt(0).toUpperCase();
    if (avatar) avatar.textContent = initial;
    if (name) name.textContent = displayName;
    if (email) email.textContent = currentSession || 'workspace';
  }

  trigger.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (event) => {
    if (!trigger.contains(event.target) && !menu.contains(event.target)) {
      menu.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  document.querySelectorAll('[data-profile-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.profileAction;
      if (action === 'change-photo') {
        window.alert('Photo picker coming soon.');
      } else if (action === 'copy-link') {
        navigator.clipboard?.writeText(window.location.href);
        window.alert('Profile link copied.');
      } else if (action === 'settings') {
        window.alert('Profile settings open soon.');
      } else if (action === 'logout') {
        localStorage.removeItem('session');
        localStorage.removeItem('jwt');
        localStorage.removeItem('authProvider');
        window.location.href = 'index.html';
      }
    });
  });

  updateProfile();
})();
