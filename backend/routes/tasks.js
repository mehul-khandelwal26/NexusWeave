const express = require('express');
const Task = require('../models/Task');
const requireAuth = require('../middleware/auth');
const { isValidObjectId, sameOrg } = require('../utils/ids');

const router = express.Router();

function canViewTask(task, user) {
  if (!task || !user) return false;
  if (task.userEmail === user.email) return true;
  if (task.assignedUserEmail === user.email) return true;
  if (task.isOrgTask && sameOrg(task.organizationId, user.orgId)) return true;
  if (user.role === 'admin' && sameOrg(task.organizationId, user.orgId)) return true;
  return false;
}

function canUpdateTask(task, user) {
  if (!task || !user) return false;
  if (task.userEmail === user.email) return true;
  if (task.assignedUserEmail === user.email) return true;
  if (task.isOrgTask && sameOrg(task.organizationId, user.orgId)) return true;
  if (user.role === 'admin' && sameOrg(task.organizationId, user.orgId)) return true;
  return false;
}

function canDeleteTask(task, user) {
  if (!task || !user) return false;
  if (task.userEmail === user.email) return true;
  return user.role === 'admin' && sameOrg(task.organizationId, user.orgId);
}

function buildTaskListQuery(user) {
  const clauses = [
    { userEmail: user.email },
    { assignedUserEmail: user.email }
  ];
  if (user.orgId) {
    clauses.push({ organizationId: user.orgId, isOrgTask: true });
    if (user.role === 'admin') {
      clauses.push({ organizationId: user.orgId });
    }
  }
  return { $or: clauses };
}

// Get Heatmap Stats — must be registered before /:id routes
router.get('/heatmap', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({
      userEmail: req.user.email,
      status: 'Done'
    });

    const completionMap = {};
    tasks.forEach((t) => {
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

// Get Calendar Tasks & Deadline Counts (must be registered before /:id routes)
router.get('/calendar', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find(buildTaskListQuery(req.user)).sort({ dueDate: 1, createdAt: -1 });

    const countsByDate = {};
    const formattedTasks = tasks.map((t) => {
      let dateKey = '';
      if (t.dueDate) {
        if (t.dueDate instanceof Date) {
          dateKey = t.dueDate.toISOString().split('T')[0];
        } else {
          dateKey = String(t.dueDate).split('T')[0];
        }
      }
      if (dateKey) {
        countsByDate[dateKey] = (countsByDate[dateKey] || 0) + 1;
      }
      return {
        id: t._id.toString(),
        title: t.title,
        description: t.description || '',
        dueDate: dateKey || (t.dueDate ? String(t.dueDate) : ''),
        priority: t.priority || 'Medium',
        status: t.status || 'Todo',
        assignedUserEmail: t.assignedUserEmail || t.userEmail || '',
        userEmail: t.userEmail
      };
    });

    res.json({ success: true, tasks: formattedTasks, countsByDate });
  } catch (err) {
    console.error('Error fetching calendar tasks:', err);
    res.status(500).json({ errors: ['Failed to fetch calendar tasks.'] });
  }
});

// Get Tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find(buildTaskListQuery(req.user)).sort({ createdAt: -1 });
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch tasks.'] });
  }
});

// Create Task
router.post('/', requireAuth, async (req, res) => {
  const {
    title, description, priority, status, dueDate, dueTime, reminderDate, reminderTime,
    projectId, labels, attachments, assignedUserEmail, isOrgTask
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ errors: ['Task title is required.'] });
  }

  // Past Date Validation (Time Travel Prevention)
  if (dueDate) {
    const todayStr = new Date().toISOString().split('T')[0];
    const taskDateStr = String(dueDate).split('T')[0];
    if (taskDateStr < todayStr) {
      return res.status(400).json({ errors: ['Cannot create tasks with a deadline in the past.'] });
    }
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
      organizationId: req.user.orgId || null,
      assignedUserEmail: assignedUserEmail || null,
      isOrgTask: Boolean(isOrgTask) && Boolean(req.user.orgId),
      labels: labels || [],
      attachments: attachments || []
    });

    res.status(201).json({ task });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ errors: messages.length ? messages : ['Invalid task data.'] });
    }
    res.status(500).json({ errors: ['Failed to create task.'] });
  }
});

// Update Task
router.put('/:id', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid task id.'] });
  }

  const {
    title, description, priority, status, dueDate, dueTime, reminderDate, reminderTime,
    projectId, labels, attachments, assignedUserEmail, isOrgTask
  } = req.body;

  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ errors: ['Task not found.'] });

    if (!canUpdateTask(task, req.user)) {
      return res.status(403).json({ errors: ['You do not have permission to update this task.'] });
    }

    const isCreator = task.userEmail === req.user.email;
    const isAdmin = req.user.role === 'admin' && sameOrg(task.organizationId, req.user.orgId);

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
    if (assignedUserEmail !== undefined && (isAdmin || isCreator)) {
      task.assignedUserEmail = assignedUserEmail;
    }
    if (isOrgTask !== undefined && (isAdmin || isCreator)) {
      task.isOrgTask = Boolean(isOrgTask) && Boolean(req.user.orgId || task.organizationId);
    }

    await task.save();
    res.json({ task });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ errors: ['Invalid task data.'] });
    }
    res.status(500).json({ errors: ['Failed to update task.'] });
  }
});

// Delete Task
router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid task id.'] });
  }

  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ errors: ['Task not found.'] });

    if (!canDeleteTask(task, req.user)) {
      return res.status(403).json({ errors: ['You do not have permission to delete this task.'] });
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to delete task.'] });
  }
});

module.exports = router;
module.exports.canViewTask = canViewTask;
