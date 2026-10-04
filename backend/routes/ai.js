const express = require('express');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_PROMPT_LENGTH = 4000;

function buildSystemPrompt(ctx) {
  const context = ctx && typeof ctx === 'object' ? ctx : {};
  const tasks = Array.isArray(context.myTasks) ? context.myTasks.slice(0, 40) : [];
  const projects = Array.isArray(context.myProjects) ? context.myProjects.slice(0, 20) : [];
  const under = Array.isArray(context.underperformingMembers) ? context.underperformingMembers.slice(0, 20) : [];
  const missed = Array.isArray(context.membersWithMissedDeadlines) ? context.membersWithMissedDeadlines.slice(0, 20) : [];

  return `You are MakAI, the intelligent AI assistant inside NexusWeave Employee Productivity Platform.
You have access to the current workspace context:
- User: ${context.userName || 'Unknown'} (${context.role || 'employee'} role)
- Organization: ${context.orgName || 'Personal Workspace'}
- User Tasks: ${JSON.stringify(tasks)}
- User Projects: ${JSON.stringify(projects)}
- Org Members Count: ${context.orgUserCount || 0}
- Underperforming Members: ${JSON.stringify(under)}
- Members with Missed Deadlines: ${JSON.stringify(missed)}
- Productivity Score: ${context.myScore != null ? context.myScore : 'n/a'}
- Focus Hours (7d): ${context.myHours != null ? context.myHours : 'n/a'}

Answer the user's question directly using this workspace data. Be specific: name real tasks, people, dates, and scores. Use short sections and bullet points. If something is missing from the context, say so and still give the best next step. Do not dump raw JSON. Do not mention API keys.`;
}

function safeProviderError(errBody) {
  if (!errBody) return 'MakAI provider request failed.';
  if (typeof errBody === 'string') return 'MakAI provider request failed.';
  const msg = (errBody.error && errBody.error.message) || errBody.message;
  if (!msg || typeof msg !== 'string') return 'MakAI provider request failed.';
  // Never echo anything that could contain a credential.
  return msg.replace(/gsk_[A-Za-z0-9]+/g, '[redacted]').replace(/sk-[A-Za-z0-9]+/g, '[redacted]');
}

router.post('/ask', requireAuth, async (req, res) => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return res.status(503).json({ errors: ['MakAI is not configured on the server.'] });
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    return res.status(400).json({ errors: ['A question is required.'] });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ errors: ['Question is too long.'] });
  }

  try {
    const groqRes = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(req.body.context) },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4
      })
    });

    const data = await groqRes.json().catch(() => ({}));

    if (!groqRes.ok) {
      return res.status(502).json({ errors: [safeProviderError(data)] });
    }

    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      return res.status(502).json({ errors: ['MakAI returned an empty answer.'] });
    }

    return res.json({ success: true, content });
  } catch (err) {
    console.error('MakAI platform request failed:', err && err.message ? err.message : err);
    return res.status(502).json({ errors: ['MakAI is temporarily unavailable. Please try again.'] });
  }
});

module.exports = router;
