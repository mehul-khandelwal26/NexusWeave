const express = require('express');
const Task = require('../models/Task');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get Tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [
        { userEmail: req.user.email },
        { assignedUserEmail: req.user.email },
        { organizationId: req.user.orgId, isOrgTask: true },
        // If the user is an admin of the org, they can see all org tasks. But req.user.role might not be up-to-date or we can just rely on the query.
        // Let's also include tasks created by anyone in the org IF the user is an admin
        ...(req.user.role === 'admin' ? [{ organizationId: req.user.orgId }] : [])
      ]
    }).sort({ createdAt: -1 });

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch tasks.'] });
  }
});

// Create Task
router.post('/', requireAuth, async (req, res) => {
  const { title, description, priority, status, dueDate, dueTime, reminderDate, reminderTime, projectId, labels, attachments, assignedUserEmail, isOrgTask } = req.body;
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
      dueTime: dueTime || '',
      reminderDate: reminderDate || '',
      reminderTime: reminderTime || '',
      completedAt: isDone ? new Date() : null,
      projectId: projectId || null,
      userEmail: req.user.email,
      organizationId: req.user.orgId,
      assignedUserEmail: assignedUserEmail || null,
      isOrgTask: isOrgTask || false,
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
  const { title, description, priority, status, dueDate, dueTime, reminderDate, reminderTime, projectId, labels, attachments, assignedUserEmail, isOrgTask } = req.body;

  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ errors: ['Task not found.'] });

    // Ownership check
    const isCreator = task.userEmail === req.user.email;
    const isAssignee = task.assignedUserEmail === req.user.email;
    const isOrgMember = task.organizationId === req.user.orgId;
    const isAdmin = req.user.role === 'admin' && isOrgMember;
    const isOrgTaskObj = task.isOrgTask && isOrgMember;

    if (!isCreator && !isAdmin && !isAssignee && !isOrgTaskObj) {
      return res.status(403).json({ errors: ['You do not have permission to update this task.'] });
    }

    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ errors: ['Task title cannot be empty.'] });
      task.title = title.trim();
    }
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
    if (dueTime !== undefined) task.dueTime = dueTime;
    if (reminderDate !== undefined) task.reminderDate = reminderDate;
    if (reminderTime !== undefined) task.reminderTime = reminderTime;
    if (projectId !== undefined) task.projectId = projectId;
    if (labels) task.labels = labels;
    if (attachments) task.attachments = attachments;
    if (assignedUserEmail !== undefined && (isAdmin || isCreator)) task.assignedUserEmail = assignedUserEmail;
    if (isOrgTask !== undefined && (isAdmin || isCreator)) task.isOrgTask = isOrgTask;

    await task.save();
    res.json({ task });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to update task.'] });
  }
});

// Delete Task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ errors: ['Task not found.'] });

    // Ownership check for deletion
    const isCreator = task.userEmail === req.user.email;
    const isAdmin = req.user.role === 'admin' && task.organizationId === req.user.orgId;
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ errors: ['You do not have permission to delete this task.'] });
    }

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
