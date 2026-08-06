(function () {
  const storageKey = 'nexus-theme';
  const toggleButtons = document.querySelectorAll('[data-theme-toggle]');

  function getStoredTheme() {
    return localStorage.getItem(storageKey) || 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(storageKey, theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    toggleButtons.forEach((button) => {
      const label = button.lastElementChild;
      if (label) {
        label.textContent = theme === 'dark' ? 'Dark' : 'Light';
      }
    });
  }

  function initTheme() {
    const savedTheme = getStoredTheme();
    applyTheme(savedTheme);
    toggleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
    });
  }

  window.addEventListener('DOMContentLoaded', initTheme);
})();
