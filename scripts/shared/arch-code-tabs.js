/**
 * NexusWeave — Architecture Syntax Code Showcase Tab Switcher
 */
(function () {
  const codeSnippets = {
    timer: {
      title: "Precision Focus Timer Timestamp Engine",
      filename: "focus-engine.js",
      code: `<span class="cm">// Eliminate JavaScript background tab throttle drift</span>
<span class="kw">function</span> <span class="fn">calculateRemainingSeconds</span>(targetEndTimestamp) {
  <span class="kw">const</span> now = Date.<span class="fn">now</span>();
  <span class="kw">const</span> remainingMs = Math.<span class="fn">max</span>(<span class="str">0</span>, targetEndTimestamp - now);
  <span class="kw">return</span> Math.<span class="fn">round</span>(remainingMs / <span class="str">1000</span>);
}`
    },
    rbac: {
      title: "Multi-Tenant RBAC Organization Scope",
      filename: "org-auth.js",
      code: `<span class="cm">// Verify user organization membership & role claims</span>
<span class="kw">function</span> <span class="fn">authorizeOrgAccess</span>(user, targetOrgId, requiredRole = <span class="str">'employee'</span>) {
  <span class="kw">if</span> (user.organizationId !== targetOrgId) {
    <span class="kw">throw new</span> <span class="fn">Error</span>(<span class="str">'Forbidden: Invalid organization scope'</span>);
  }
  <span class="kw">return</span> requiredRole === <span class="str">'admin'</span> ? user.role === <span class="str">'admin'</span> : <span class="str">true</span>;
}`
    },
    xss: {
      title: "XSS DOM Text Sanitization Engine",
      filename: "sanitize.js",
      code: `<span class="cm">// Sanitize all user inputs before rendering into DOM</span>
<span class="kw">function</span> <span class="fn">escapeHTML</span>(str) {
  <span class="kw">return</span> String(str)
    .<span class="fn">replace</span>(/&/g, <span class="str">'&amp;'</span>)
    .<span class="fn">replace</span>(/&lt;/g, <span class="str">'&lt;'</span>)
    .<span class="fn">replace</span>(/&gt;/g, <span class="str">'&gt;'</span>)
    .<span class="fn">replace</span>(/"/g, <span class="str">'&quot;'</span>);
}`
    },
    offline: {
      title: "Offline LocalStorage Cache & Sync Fallback",
      filename: "offline-sync.js",
      code: `<span class="cm">// Serve local cache when network is offline, auto-sync on reconnect</span>
<span class="kw">async function</span> <span class="fn">loadWorkspaceTasks</span>() {
  <span class="kw">try</span> {
    <span class="kw">const</span> remote = <span class="kw">await</span> api.<span class="fn">getTasks</span>();
    localStorage.<span class="fn">setItem</span>(<span class="str">'nexus_tasks_cache'</span>, JSON.<span class="fn">stringify</span>(remote));
    <span class="kw">return</span> remote;
  } <span class="kw">catch</span> (err) {
    <span class="kw">return</span> JSON.<span class="fn">parse</span>(localStorage.<span class="fn">getItem</span>(<span class="str">'nexus_tasks_cache'</span>) || <span class="str">'[]'</span>);
  }
}`
    }
  };

  function initCodeTabs() {
    const btns = document.querySelectorAll('[data-code-tab]');
    const displayTitle = document.getElementById('archCodeTitle');
    const displayFilename = document.getElementById('archCodeFilename');
    const displayBox = document.getElementById('archCodeBox');

    if (!btns.length || !displayBox) return;

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabKey = btn.getAttribute('data-code-tab');
        const data = codeSnippets[tabKey];
        if (!data) return;

        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (displayTitle) displayTitle.textContent = data.title;
        if (displayFilename) displayFilename.textContent = data.filename;
        displayBox.innerHTML = data.code;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initCodeTabs);
})();
