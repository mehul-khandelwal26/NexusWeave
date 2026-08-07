/**
 * NexusWeave — Interactive Command Palette (Ctrl+K / Cmd+K)
 */

(function () {
  let modal, overlay, input, list;

  const commands = [
    { label: "🚀 Create new project with AI Assistant", action: () => window.location.href = "#auth" },
    { label: "🏢 Switch to Organization Portal", action: () => { const btn = document.getElementById('portalOrgBtn'); if (btn) btn.click(); window.location.href = "#auth"; } },
    { label: "👤 Switch to Personal Workspace", action: () => { const btn = document.getElementById('portalPersonalBtn'); if (btn) btn.click(); window.location.href = "#auth"; } },
    { label: "⏱️ Launch 25-Min Pomodoro Focus Timer", action: () => window.location.href = "#features" },
    { label: "💬 Open Real-time WebSocket Team Chat", action: () => window.location.href = "#features" },
    { label: "🌓 Toggle Light / Dark Theme", action: () => { const btn = document.querySelector('[data-theme-toggle]'); if (btn) btn.click(); } }
  ];

  function createModal() {
    overlay = document.createElement('div');
    overlay.id = 'cmdOverlay';
    overlay.className = 'cmd-overlay hidden';

    overlay.innerHTML = `
      <div class="cmd-dialog">
        <div class="cmd-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="cmdInput" placeholder="Type a command or search workspace..." autocomplete="off" />
          <kbd>ESC</kbd>
        </div>
        <div class="cmd-list" id="cmdList"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    input = document.getElementById('cmdInput');
    list = document.getElementById('cmdList');

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideModal();
    });

    input.addEventListener('input', renderList);
  }

  function renderList() {
    const query = input.value.toLowerCase().trim();
    const filtered = commands.filter(c => c.label.toLowerCase().includes(query));

    list.innerHTML = filtered.map((c, i) => `
      <div class="cmd-item" data-index="${i}">
        <span>${c.label}</span>
        <span class="cmd-arrow">↵</span>
      </div>
    `).join('');

    const items = list.querySelectorAll('.cmd-item');
    items.forEach((item, i) => {
      item.addEventListener('click', () => {
        filtered[i].action();
        hideModal();
      });
    });
  }

  function showModal() {
    if (!overlay) createModal();
    overlay.classList.remove('hidden');
    input.value = '';
    renderList();
    setTimeout(() => input.focus(), 50);
  }

  function hideModal() {
    if (overlay) overlay.classList.add('hidden');
  }

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay && !overlay.classList.contains('hidden')) {
        hideModal();
      } else {
        showModal();
      }
    }
    if (e.key === 'Escape') hideModal();
  });

  window.addEventListener('DOMContentLoaded', () => {
    createModal();
    const triggers = document.querySelectorAll('[data-cmd-trigger]');
    triggers.forEach(t => t.addEventListener('click', showModal));
  });
})();
