/* ============================================================
   NexusWeave — Isolated AI Module (NexusAI Service)
   Supports: Employee Productivity Analysis, Admin Intelligence,
             OpenAI API Integration + Intelligent Context Engine.
   ============================================================ */

(function (root) {
  const api = window.NexusAPI;
  const tracker = window.NexusTracker;

  const API_KEY_STORAGE = 'nw_openai_key';

  const NexusAI = {
    getApiKey() {
      return localStorage.getItem(API_KEY_STORAGE) || '';
    },

    setApiKey(key) {
      localStorage.setItem(API_KEY_STORAGE, key.trim());
    },

    /* ── Compile Full Workspace Context ── */
    getWorkspaceContext() {
      const currentUser = api.getMe();
      if (!currentUser) return null;

      const isAdmin = currentUser.role === 'admin';
      const orgId = currentUser.organizationId;
      const orgUsers = orgId ? api.getAllUsersInOrg(orgId) : [currentUser];
      const orgInfo = orgId ? api.getOrganization(orgId) : null;

      // Compile Employee Tasks & Metrics
      const myTasks = currentUser.tasks || [];
      const myProjects = currentUser.projects || [];
      const myScore = tracker ? tracker.calculateProductivityScore(currentUser) : 85;
      const myHours = tracker ? tracker.calculateWorkingHours(currentUser.email, 'weekly') : 38;

      // Compile Org-wide Data for Admin
      let allOrgTasks = [];
      let underperformingMembers = [];
      let membersWithMissedDeadlines = [];

      const now = new Date();

      orgUsers.forEach(u => {
        const uTasks = u.tasks || [];
        allOrgTasks.push(...uTasks.map(t => ({ ...t, userEmail: u.email, userName: u.name || u.email })));

        const uScore = tracker ? tracker.calculateProductivityScore(u) : 85;
        if (uScore < 70) {
          underperformingMembers.push({ name: u.name || u.email, score: uScore, email: u.email });
        }

        const missed = uTasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate) < now);
        if (missed.length > 0) {
          membersWithMissedDeadlines.push({ name: u.name || u.email, email: u.email, missedCount: missed.length, missedTasks: missed.map(t => t.title) });
        }
      });

      return {
        user: currentUser,
        role: currentUser.role,
        isAdmin,
        orgInfo,
        myTasks,
        myProjects,
        myScore,
        myHours,
        orgUsers,
        allOrgTasks,
        underperformingMembers,
        membersWithMissedDeadlines
      };
    },

    /* ── Main Query Analyzer / Prompt Handler ── */
    async ask(promptText) {
      const ctx = this.getWorkspaceContext();
      if (!ctx) return 'Error: Unable to fetch workspace context. Please log in.';

      const apiKey = this.getApiKey();

      // If OpenAI API key is set, call OpenAI chat completions API
      if (apiKey) {
        try {
          return await this.callOpenAI(promptText, ctx, apiKey);
        } catch (err) {
          console.warn('OpenAI API call failed, falling back to NexusAI Context Engine:', err);
        }
      }

      // Fallback to Intelligent Context Engine (built-in AI reasoning)
      return this.analyzeWithContextEngine(promptText, ctx);
    },

    /* ── OpenAI API Integration ── */
    async callOpenAI(userPrompt, ctx, apiKey) {
      const systemPrompt = `You are NexusAI, the intelligent AI assistant inside NexusWeave Employee Productivity Platform.
You have access to the current workspace context:
- User: ${ctx.user.name} (${ctx.role} role)
- Organization: ${ctx.orgInfo ? ctx.orgInfo.name : 'Personal Workspace'}
- User Tasks: ${JSON.stringify(ctx.myTasks.map(t => ({ title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate })))}
- User Projects: ${JSON.stringify(ctx.myProjects.map(p => p.name))}
- Org Members Count: ${ctx.orgUsers.length}
- Underperforming Members: ${JSON.stringify(ctx.underperformingMembers)}
- Members with Missed Deadlines: ${JSON.stringify(ctx.membersWithMissedDeadlines)}

Be concise, structured, professional, and directly answer the user's question using bullet points and emojis.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      } else if (data.error) {
        throw new Error(data.error.message);
      }
      throw new Error('Invalid OpenAI response format');
    },

    /* ── Intelligent Context Engine (Local Rule & Context AI) ── */
    analyzeWithContextEngine(prompt, ctx) {
      const q = prompt.toLowerCase();
      const isAdmin = ctx.isAdmin;
      const tasks = ctx.myTasks;
      const now = new Date();

      // ── Employee Prompt: "What should I work on?" ──
      if (q.includes('what should i work on') || q.includes('next task') || q.includes('what to do')) {
        const urgentPending = tasks.filter(t => t.status !== 'Done' && (t.priority === 'Urgent' || t.priority === 'High'));
        if (!tasks.length) return `🎯 **Recommendation**: You currently have no tasks assigned. Click **+ Create Task** or ask your manager to assign a sprint goal!`;

        if (urgentPending.length) {
          const top = urgentPending[0];
          return `🎯 **Top Recommendation**:
You should focus on **"${top.title}"** right now.

• **Priority**: 🔥 ${top.priority}
• **Status**: ${top.status}
• **Due Date**: ${top.dueDate || 'No deadline set'}
${top.description ? `• **Context**: ${top.description}` : ''}

*Tip: Open the Board or Tasks view to track your progress.*`;
        }

        const anyPending = tasks.find(t => t.status !== 'Done');
        if (anyPending) {
          return `🎯 **Recommended Work**:
Work on **"${anyPending.title}"** (Priority: ${anyPending.priority}, Status: ${anyPending.status}).`;
        }

        return `🎉 **All Caught Up!**: All your tasks are completed. Great work! Take a break or plan your next sprint.`;
      }

      // ── Employee Prompt: "Summarize today's tasks." ──
      if (q.includes('summarize') || q.includes('summary of today') || q.includes("today's tasks")) {
        const done = tasks.filter(t => t.status === 'Done');
        const inProgress = tasks.filter(t => t.status === 'In Progress');
        const todo = tasks.filter(t => t.status === 'Todo' || !t.status);

        return `📊 **Today's Task Summary**:

• **Completed (${done.length})**: ${done.map(t => t.title).join(', ') || 'None yet'}
• **In Progress (${inProgress.length})**: ${inProgress.map(t => t.title).join(', ') || 'None'}
• **Pending (${todo.length})**: ${todo.map(t => t.title).join(', ') || 'None'}

*Productivity Score*: **${ctx.myScore}%** (${ctx.myHours}h worked this week).`;
      }

      // ── Employee Prompt: "Prioritize my work." ──
      if (q.includes('prioritize') || q.includes('priority order')) {
        const pending = tasks.filter(t => t.status !== 'Done');
        if (!pending.length) return `✨ You have no pending tasks to prioritize!`;

        const sorted = [...pending].sort((a, b) => {
          const rank = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
          return (rank[b.priority] || 0) - (rank[a.priority] || 0);
        });

        return `⚡ **Recommended Priority Order**:

${sorted.map((t, i) => `${i + 1}. **${t.title}** — Priority: \`${t.priority}\` (Due: ${t.dueDate || 'Flex'})`).join('\n')}`;
      }

      // ── Admin Prompt: "Who is underperforming?" ──
      if (q.includes('underperforming') || q.includes('low performance')) {
        if (!isAdmin) return `🔒 *Admin Only*: Underperformance analysis is restricted to organization Admins.`;

        const under = ctx.underperformingMembers;
        if (!under.length) {
          return `🌟 **Great News!**: All team members in your organization are performing well (Productivity scores > 70%).`;
        }

        return `⚠️ **Performance Alert**:

The following members have productivity scores below 70%:
${under.map(m => `• **${m.name}** (${m.email}): Productivity Score **${m.score}%**`).join('\n')}

*Recommendation: Review task allocation or schedule a 1-on-1 sync.*`;
      }

      // ── Admin Prompt: "Which employee missed deadlines?" ──
      if (q.includes('missed deadlines') || q.includes('overdue tasks')) {
        if (!isAdmin) return `🔒 *Admin Only*: Deadline analysis is restricted to organization Admins.`;

        const missed = ctx.membersWithMissedDeadlines;
        if (!missed.length) {
          return `✅ **On Track!**: No employees have overdue tasks in your organization right now.`;
        }

        return `⏰ **Missed Deadlines Report**:

${missed.map(m => `• **${m.name}**: ${m.missedCount} overdue task(s) — *"${m.missedTasks.join('", "')}"*`).join('\n')}`;
      }

      // ── Admin Prompt: "Generate weekly report." ──
      if (q.includes('weekly report') || q.includes('generate report')) {
        if (!isAdmin) return `🔒 *Admin Only*: Executive weekly report generation is restricted to Admins.`;

        const totalTasks = ctx.allOrgTasks.length;
        const doneTasks = ctx.allOrgTasks.filter(t => t.status === 'Done').length;
        const compRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        return `📈 **Executive Weekly Productivity Report**:
*Organization*: **${ctx.orgInfo ? ctx.orgInfo.name : 'NexusWeave Workspace'}**
*Generated*: ${new Date().toLocaleDateString()}

1. **Organization Metrics**:
   - Total Members: **${ctx.orgUsers.length}**
   - Total Sprints / Tasks: **${totalTasks}**
   - Completed Tasks: **${doneTasks}**
   - Task Completion Rate: **${compRate}%**

2. **Team Health & Performance**:
   - Underperforming Members: **${ctx.underperformingMembers.length}**
   - Members with Overdue Tasks: **${ctx.membersWithMissedDeadlines.length}**

3. **Actionable Recommendations**:
   - Re-assign overdue tasks from overburdened employees.
   - Praise top performers on the Leaderboard!`;
      }

      // Generic Intelligent Fallback
      return `🤖 **NexusAI Assistance**:
I analyzed your request (*"${prompt}"*).

Here is a quick snapshot of your workspace:
• **Your Role**: ${ctx.role === 'admin' ? '🛡️ Admin' : '👤 Employee'}
• **Total Active Tasks**: ${tasks.filter(t => t.status !== 'Done').length}
• **Productivity Score**: ${ctx.myScore}%

You can ask me:
- *"What should I work on?"*
- *"Summarize today's tasks."*
- *"Prioritize my work."*
${isAdmin ? '- *"Who is underperforming?"*\n- *"Which employee missed deadlines?"*\n- *"Generate weekly report."*' : ''}`;
    }
  };

  root.NexusAI = NexusAI;
})(window);
