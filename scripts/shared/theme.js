(function () {
  const storageKey = 'nexus-theme';
  const toggleButtons = document.querySelectorAll('[data-theme-toggle]');

  function getStoredTheme() {
    return localStorage.getItem(storageKey) || 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    toggleButtons.forEach((button) => {
      const label = button.lastElementChild;
      if (label) {
        label.textContent = theme === 'dark' ? 'Dark' : 'Light';
      }
    });
  }

  function persistTheme(theme) {
    const api = window.NexusAPI;
    if (api && api.isAuthenticated && api.isAuthenticated() && api.updateProfile) {
      api.updateProfile({ theme }).catch(() => {});
    }
  }

  function initTheme() {
    const localTheme = localStorage.getItem(storageKey);
    const themeToPaint = localTheme || 'dark';
    
    // Paint from the local copy first to avoid a flash
    applyTheme(themeToPaint);

    const api = window.NexusAPI;
    if (api && api.isAuthenticated && api.isAuthenticated()) {
      const cached = api.getMe();
      if (cached && cached.theme) {
        if (!localTheme && cached.theme !== themeToPaint) {
          applyTheme(cached.theme);
        } else if (localTheme && cached.theme !== localTheme) {
          persistTheme(localTheme);
        }
      }
    }

    toggleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        localStorage.setItem(storageKey, nextTheme);
        persistTheme(nextTheme);
      });
    });
  }

  window.addEventListener('DOMContentLoaded', initTheme);
})();
