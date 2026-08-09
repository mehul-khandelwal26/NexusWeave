(function () {
  const trigger = document.querySelector('[data-profile-menu-trigger]');
  const menu = document.querySelector('[data-profile-menu]');
  const avatar = document.querySelector('[data-profile-avatar]');
  const nameEl = document.querySelector('[data-profile-name]');
  const emailEl = document.querySelector('[data-profile-email]');

  if (!trigger || !menu) return;

  function updateProfile() {
    const sessionEmail = sessionStorage.getItem('session');
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const user = sessionEmail ? users[sessionEmail] : null;

    const displayName = user && user.name ? user.name : (sessionEmail ? sessionEmail.split('@')[0] : 'Profile');
    const initial = displayName.charAt(0).toUpperCase();

    if (avatar) {
      if (user && user.photo) {
        avatar.style.backgroundImage = `url(${user.photo})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
        avatar.innerHTML = '';
      } else {
        avatar.style.backgroundImage = 'none';
        avatar.textContent = (user && user.name) ? user.name.charAt(0).toUpperCase() : 'U';
      }
    }

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = sessionEmail || 'workspace';

    // Role badge
    const existingBadge = trigger.querySelector('.profile-role-badge');
    if (existingBadge) existingBadge.remove();

    if (user && user.role) {
      const badge = document.createElement('span');
      badge.className = `profile-role-badge role-${user.role}`;
      badge.textContent = user.role === 'personal' ? '👤 Personal' : user.role === 'admin' ? '🛡️ Admin' : '👤 Employee';
      const meta = trigger.querySelector('.profile-meta');
      if (meta) meta.appendChild(badge);
    }
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
      if (action === 'profile') {
        window.location.href = 'profile.html';
      } else if (action === 'copy-link') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(window.location.origin + '/pages/profile.html')
            .then(() => window.alert('Public profile link copied!'))
            .catch(() => window.alert('Failed to copy link to clipboard.'));
        } else {
          window.alert('Clipboard is not available in this browser.');
        }
      } else if (action === 'logout') {
        sessionStorage.removeItem('session');
        sessionStorage.removeItem('jwt');
        sessionStorage.removeItem('authProvider');
        sessionStorage.removeItem('nw_sessions');
        window.location.href = 'index.html';
      }
    });
  });

  updateProfile();
})();
