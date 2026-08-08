/* ============================================================
   NexusWeave — ChatGPT Inspired AI Assistant UI (ai-assistant.js)
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const nexusAI = window.NexusAI;

  const currentUser = api.getMe();
  if (!currentUser) return;

  const isAdmin = currentUser.role === 'admin';

  const AI_LOGO_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;flex-shrink:0;"><path d="M12 3C12 3 13.5 7.5 18 9C13.5 10.5 12 15 12 15C12 15 10.5 10.5 6 9C10.5 7.5 12 3 12 3Z" fill="currentColor"/><path d="M19 15C19 15 19.75 17.25 22 18C19.75 18.75 19 21 19 21C19 21 18.25 18.75 16 18C18.25 17.25 19 15 19 15Z" fill="currentColor" opacity="0.85"/><path d="M5 15C5 15 5.5 16.5 7 17C5.5 17.5 5 19 5 19C5 19 4.5 17.5 3 17C4.5 16.5 5 15 5 15Z" fill="currentColor" opacity="0.65"/></svg>`;

  /* ── Inject ChatGPT Sidebar UI ── */
  function injectAIUI() {
    if (document.getElementById('aiFabBtn')) return;

    // 1. Floating Action Button
    const fabBtn = document.createElement('button');
    fabBtn.id = 'aiFabBtn';
    fabBtn.className = 'ai-fab-btn';
    fabBtn.type = 'button';
    fabBtn.innerHTML = `
      <span class="ai-fab-glow-ring"></span>
      <svg class="ai-fab-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3C12 3 13.5 7.5 18 9C13.5 10.5 12 15 12 15C12 15 10.5 10.5 6 9C10.5 7.5 12 3 12 3Z" fill="currentColor"/>
        <path d="M19 15C19 15 19.75 17.25 22 18C19.75 18.75 19 21 19 21C19 21 18.25 18.75 16 18C18.25 17.25 19 15 19 15Z" fill="currentColor" opacity="0.85"/>
        <path d="M5 15C5 15 5.5 16.5 7 17C5.5 17.5 5 19 5 19C5 19 4.5 17.5 3 17C4.5 16.5 5 15 5 15Z" fill="currentColor" opacity="0.65"/>
      </svg>
      <span class="ai-fab-label">NexusAI</span>
    `;
    document.body.appendChild(fabBtn);

    // 2. ChatGPT Sidebar Drawer
    const drawer = document.createElement('div');
    drawer.id = 'aiSidebarDrawer';
    drawer.className = 'ai-sidebar-drawer';
    drawer.innerHTML = `
      <div class="ai-drawer-head">
        <div class="ai-brand-title">
          <span style="width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,var(--purple-primary),#a855f7);display:grid;place-items:center;color:#ffffff;box-shadow:0 4px 15px rgba(124,58,237,0.35);flex-shrink:0;">
            ${AI_LOGO_SVG}
          </span>
          <div>
            <strong style="font-size:0.95rem;display:block;">NexusAI Workspace Intelligence</strong>
            <small class="text-soft" style="font-size:0.75rem;">Powered by Context & OpenAI</small>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <button id="aiSettingsBtn" class="ghost-btn" style="padding:0.25rem 0.5rem;font-size:0.8rem;" title="Configure OpenAI API Key">⚙️ Key</button>
          <button id="closeAiDrawerBtn" class="ghost-btn" style="padding:0.2rem 0.5rem;font-size:1.1rem;">×</button>
        </div>
      </div>

      <!-- Quick Prompts Horizontal Scroll -->
      <div id="aiQuickPrompts" class="ai-quick-prompts"></div>

      <!-- Messages Stream -->
      <div id="aiMessagesStream" class="ai-messages-stream">
        <div class="ai-msg assistant">
          <div class="ai-msg-avatar">${AI_LOGO_SVG}</div>
          <div class="ai-msg-content">
            <p>Hello <strong>${currentUser.name || 'there'}</strong>! I am <strong>NexusAI</strong>, your productivity intelligence assistant.</p>
            <p>Select a quick prompt above or ask me anything about your tasks, deadlines, attendance, and team performance!</p>
          </div>
        </div>
      </div>

      <div id="aiTypingIndicator" class="ai-typing-indicator hidden">
        <span>NexusAI is analyzing workspace context</span>
        <div class="ai-dot-pulse"></div>
        <div class="ai-dot-pulse"></div>
        <div class="ai-dot-pulse"></div>
      </div>

      <!-- Chat Input Form -->
      <div class="ai-drawer-footer">
        <form id="aiPromptForm" class="ai-input-form">
          <input type="text" id="aiPromptInput" placeholder="Ask NexusAI a question…" autocomplete="off" />
          <button type="submit" class="primary-btn">Send</button>
        </form>
      </div>
    `;
    document.body.appendChild(drawer);

    // Populate Quick Prompts
    renderQuickPrompts();

    // Event Listeners
    fabBtn.addEventListener('click', () => {
      drawer.classList.toggle('is-open');
    });

    document.getElementById('closeAiDrawerBtn').addEventListener('click', () => {
      drawer.classList.remove('is-open');
    });

    document.getElementById('aiSettingsBtn').addEventListener('click', () => {
      openApiKeyPrompt();
    });

    const form = document.getElementById('aiPromptForm');
    const input = document.getElementById('aiPromptInput');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendPromptToAI(text);
    });
  }

  function renderQuickPrompts() {
    const container = document.getElementById('aiQuickPrompts');
    if (!container) return;

    const prompts = isAdmin
      ? [
          'Who is underperforming?',
          'Which employee missed deadlines?',
          'Generate weekly report.',
          'What should I work on?',
          'Summarize today\'s tasks.'
        ]
      : [
          'What should I work on?',
          'Summarize today\'s tasks.',
          'Prioritize my work.'
        ];

    container.innerHTML = prompts.map(p => `
      <button type="button" class="ai-quick-pill" data-prompt="${p}">${p}</button>
    `).join('');

    container.querySelectorAll('[data-prompt]').forEach(btn => {
      btn.addEventListener('click', () => {
        sendPromptToAI(btn.dataset.prompt);
      });
    });
  }

  async function sendPromptToAI(promptText) {
    const stream = document.getElementById('aiMessagesStream');
    const typing = document.getElementById('aiTypingIndicator');
    if (!stream) return;

    // Append User Message
    appendMessage('user', currentUser.name || 'User', promptText);

    // Show Typing Indicator
    if (typing) typing.classList.remove('hidden');
    stream.scrollTop = stream.scrollHeight;

    try {
      // Get Response from NexusAI Service
      const aiResponse = await nexusAI.ask(promptText);

      // Append AI Message
      appendMessage('assistant', 'NexusAI', aiResponse);
    } catch (err) {
      console.error('NexusAI error:', err);
      appendMessage('assistant', 'NexusAI', 'Sorry, I encountered an error processing your request. Please try again.');
    } finally {
      // Hide Typing Indicator
      if (typing) typing.classList.add('hidden');
    }
    stream.scrollTop = stream.scrollHeight;
  }

  function appendMessage(role, author, text) {
    const stream = document.getElementById('aiMessagesStream');
    if (!stream) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${role}`;

    const formattedText = formatMarkdownText(text);

    msgDiv.innerHTML = `
      <div class="ai-msg-avatar">${role === 'assistant' ? AI_LOGO_SVG : author.charAt(0).toUpperCase()}</div>
      <div class="ai-msg-content">${formattedText}</div>
    `;

    stream.appendChild(msgDiv);
  }

  function formatMarkdownText(raw) {
    if (!raw) return '';
    const esc = (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML : (str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    let safe = esc(raw);
    let html = safe
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--surface-muted);padding:0.1rem 0.35rem;border-radius:4px;">$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    return `<p>${html}</p>`;
  }

  function openApiKeyPrompt() {
    const currentKey = nexusAI.getApiKey();
    const newKey = prompt('Configure OpenAI API Key (Leave blank to use NexusAI Context Engine):', currentKey);
    if (newKey !== null) {
      nexusAI.setApiKey(newKey);
      alert(newKey.trim() ? 'OpenAI API Key saved successfully!' : 'Using NexusAI Built-in Context Engine.');
    }
  }

  // Initialize UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAIUI);
  } else {
    injectAIUI();
  }
})();
