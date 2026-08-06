/**
 * NexusWeave — Interactive Workflow Stepper Script
 * Dynamically switches between the 6 actual software workflow steps.
 */

(function () {
  const stepsData = {
    setup: {
      num: 1,
      badge: "Step 1: Onboarding",
      title: "1. Dual-Portal Workspace & Role Authorization",
      description: "Initialize an individual workspace or set up a multi-tenant organization using a secret security key. Access controls automatically distinguish Admin management rights from Employee execution views.",
      highlights: ["Multi-tenant Organization Keys", "Admin vs Employee Role Isolation", "Secure JWT Session Authorization"],
      visualTitle: "Security & Portal Configuration",
      visualHTML: `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <div style="display:flex;gap:0.5rem;">
            <span style="background:var(--purple-primary);color:#fff;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;">Admin View</span>
            <span style="background:var(--bg-input);color:var(--text-muted);padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:600;">Employee View</span>
          </div>
          <div style="background:var(--bg-page);padding:0.75rem;border-radius:6px;border:1px solid var(--border-subtle);font-size:0.82rem;">
            <div style="color:var(--text-subtle);font-size:0.72rem;margin-bottom:2px;">ORGANIZATION KEY</div>
            <code style="color:var(--purple-primary);font-weight:700;">org_secret_key_88492</code>
          </div>
        </div>
      `
    },
    plan: {
      num: 2,
      badge: "Step 2: AI Planning",
      title: "2. AI Milestone Generation & Task Decomposition",
      description: "Input high-level project goals in plain language. NexusWeave's integrated AI service automatically breaks down your brief into structured sprint milestones and actionable task items.",
      highlights: ["Natural Language Brief Parsing", "Automated Sprint Milestones", "Instant Task Item Breakdown"],
      visualTitle: "AI Prompt Decomposition",
      visualHTML: `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <div style="background:var(--bg-page);padding:0.6rem;border-radius:6px;border:1px solid var(--border-subtle);font-size:0.8rem;color:var(--text-muted);">
            <em>"Build an authentication system with Google OAuth"</em>
          </div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <span style="background:rgba(124, 58, 237, 0.15);color:var(--purple-primary);padding:3px 8px;border-radius:4px;font-size:0.72rem;font-weight:700;">✓ Milestone 1: OAuth Setup</span>
            <span style="background:rgba(52, 211, 153, 0.15);color:#34d399;padding:3px 8px;border-radius:4px;font-size:0.72rem;font-weight:700;">✓ Task: JWT Token Handshake</span>
          </div>
        </div>
      `
    },
    kanban: {
      num: 3,
      badge: "Step 3: Execution",
      title: "3. Interactive Kanban Board & Task Execution",
      description: "Track progress cleanly across custom sprint columns (To Do, In Progress, Done). Drag and drop tasks with priority tags, due date pickers, and team member assignments.",
      highlights: ["Drag & Drop Board Mechanics", "Priority & Due Date Labeling", "Assignee Avatar Mapping"],
      visualTitle: "Live Sprint Board View",
      visualHTML: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.78rem;">
          <div style="background:var(--bg-page);padding:0.6rem;border-radius:6px;border:1px solid var(--border-subtle);">
            <div style="font-weight:700;margin-bottom:0.3rem;">In Progress</div>
            <div style="background:var(--bg-card);padding:0.4rem;border-radius:4px;font-weight:600;">API Integration</div>
          </div>
          <div style="background:var(--bg-page);padding:0.6rem;border-radius:6px;border:1px solid var(--border-subtle);">
            <div style="font-weight:700;margin-bottom:0.3rem;color:#34d399;">Done</div>
            <div style="background:var(--bg-card);padding:0.4rem;border-radius:4px;font-weight:600;">XSS Sanitization</div>
          </div>
        </div>
      `
    },
    focus: {
      num: 4,
      badge: "Step 4: Focus Sprint",
      title: "4. Timestamp-Driven Pomodoro Focus Engine",
      description: "Eliminate timer drift caused by browser tab throttling. NexusWeave computes focus intervals from absolute target timestamps, logging completed sprints directly to your metrics.",
      highlights: ["Background Tab Drift Prevention", "25 Min Focus / 5 Min Break Intervals", "Productivity Metrics Synchronization"],
      visualTitle: "Focus Timer State",
      visualHTML: `
        <div style="text-align:center;padding:0.4rem;">
          <div style="font-size:1.8rem;font-weight:800;color:var(--purple-primary);letter-spacing:-0.03em;">24:58</div>
          <span style="font-size:0.72rem;background:rgba(52, 211, 153, 0.15);color:#34d399;padding:2px 8px;border-radius:999px;font-weight:700;">Deep Focus Session Active</span>
        </div>
      `
    },
    chat: {
      num: 5,
      badge: "Step 5: Collaboration",
      title: "5. Real-Time WebSocket Workspace Channels",
      description: "Collaborate continuously with team members. Direct WebSocket channels power live organization chat with typing indicators, online member lists, and real-time activity broadcasts.",
      highlights: ["Sub-50ms WebSocket Channel Sync", "Live Typing & Online Presence", "Activity Feed Log"],
      visualTitle: "Live WebSocket Channel",
      visualHTML: `
        <div style="display:flex;flex-direction:column;gap:0.4rem;font-size:0.78rem;">
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <span style="width:8px;height:8px;border-radius:50%;background:#34d399;"></span>
            <span style="font-weight:700;">Alex (Admin):</span>
            <span style="color:var(--text-muted);">WebSocket broadcast connected!</span>
          </div>
          <div style="font-size:0.7rem;color:var(--text-subtle);"><em>Sarah is typing...</em></div>
        </div>
      `
    },
    analytics: {
      num: 6,
      badge: "Step 6: Insights",
      title: "6. Team Output Velocity & Leaderboard Analytics",
      description: "Visualize individual output velocity, sprint milestone completion rates, and gamified member rankings on automated real-time workspace dashboards.",
      highlights: ["Gamified Member Ranking", "Milestone Velocity Metrics", "Attendance & Contribution Reports"],
      visualTitle: "Leaderboard Output",
      visualHTML: `
        <div style="display:flex;flex-direction:column;gap:0.3rem;font-size:0.78rem;">
          <div style="display:flex;justify-content:space-between;background:var(--bg-page);padding:0.4rem 0.6rem;border-radius:4px;">
            <span>🥇 Alex Morgan</span>
            <strong style="color:var(--purple-primary);">48 Tasks Completed</strong>
          </div>
          <div style="display:flex;justify-content:space-between;background:var(--bg-page);padding:0.4rem 0.6rem;border-radius:4px;">
            <span>🥈 Sarah Connor</span>
            <strong style="color:var(--purple-primary);">42 Tasks Completed</strong>
          </div>
        </div>
      `
    }
  };

  function renderStep(stepKey) {
    const data = stepsData[stepKey];
    if (!data) return;

    // Update active button state
    const buttons = document.querySelectorAll('.workflow-step-btn');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-step') === stepKey);
    });

    // Update Display Card
    const infoContainer = document.getElementById('workflowInfoContainer');
    const visualContainer = document.getElementById('workflowVisualContainer');

    if (infoContainer) {
      infoContainer.innerHTML = `
        <span class="workflow-card-badge">${data.badge}</span>
        <h3>${data.title}</h3>
        <p>${data.description}</p>
        <div class="workflow-highlights">
          ${data.highlights.map((h) => `<div class="workflow-highlight-item"><span class="icon">✓</span><span>${h}</span></div>`).join('')}
        </div>
      `;
    }

    if (visualContainer) {
      visualContainer.innerHTML = `
        <div class="visual-box-header">
          <span>${data.visualTitle}</span>
          <span style="font-size:0.7rem;color:var(--purple-primary);font-weight:700;">LIVE ENGINE</span>
        </div>
        <div class="visual-box-content">
          ${data.visualHTML}
        </div>
      `;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.workflow-step-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const stepKey = btn.getAttribute('data-step');
        renderStep(stepKey);
      });
    });

    // Initialize default step
    renderStep('setup');
  });
})();
