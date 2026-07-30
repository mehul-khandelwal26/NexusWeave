const express = require('express');
const Task = require('../models/Task');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get Tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [{ userEmail: req.user.email }, { organizationId: req.user.orgId }]
    }).sort({ createdAt: -1 });

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch tasks.'] });
  }
});

// Create Task
router.post('/', requireAuth, async (req, res) => {
  const { title, description, priority, status, dueDate, projectId, labels, attachments } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ errors: ['Task title is required.'] });
  }

  const isDone = status === 'Done';

  try {
    const task = await Task.create({
      title: title.trim(),
      description: description || '',
      priority: priority || 'Medium',
      status: status || 'Todo',
      dueDate: dueDate || '',
      completedAt: isDone ? new Date() : null,
      projectId: projectId || null,
      userEmail: req.user.email,
      organizationId: req.user.orgId,
      labels: labels || [],
      attachments: attachments || []
    });

    res.status(201).json({ task });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to create task.'] });
  }
});

// Update Task status & completion timestamp
router.put('/:id', requireAuth, async (req, res) => {
  const { title, description, priority, status, dueDate, projectId, labels } = req.body;

  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ errors: ['Task not found.'] });

    if (title) task.title = title.trim();
    if (description !== undefined) task.description = description;
    if (priority) task.priority = priority;
    if (status) {
      task.status = status;
      if (status === 'Done' && !task.completedAt) {
        task.completedAt = new Date();
      } else if (status !== 'Done') {
        task.completedAt = null;
      }
    }
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (projectId !== undefined) task.projectId = projectId;
    if (labels) task.labels = labels;

    await task.save();
    res.json({ task });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to update task.'] });
  }
});

// Delete Task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to delete task.'] });
  }
});

// Get Heatmap Stats (365-day completed task counts)
router.get('/heatmap', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({
      userEmail: req.user.email,
      status: 'Done'
    });

    const completionMap = {};
    tasks.forEach(t => {
      if (t.completedAt) {
        const dateKey = new Date(t.completedAt).toISOString().split('T')[0];
        completionMap[dateKey] = (completionMap[dateKey] || 0) + 1;
      }
    });

    res.json({ completionMap });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to generate heatmap statistics.'] });
  }
});

module.exports = router;
