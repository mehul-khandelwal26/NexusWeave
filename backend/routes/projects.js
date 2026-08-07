const express = require('express');
const Project = require('../models/Project');
const requireAuth = require('../middleware/auth');
const { isValidObjectId, sameOrg } = require('../utils/ids');
const { logActivity } = require('../utils/activity-log');

const router = express.Router();

function actorName(user) {
  return user.name || user.email.split('@')[0];
}

function canAccessProject(project, user) {
  if (!project || !user) return false;
  if (project.userEmail === user.email) return true;
  return sameOrg(project.organizationId, user.orgId);
}

function canModifyProject(project, user) {
  if (!project || !user) return false;
  if (project.userEmail === user.email) return true;
  return user.role === 'admin' && sameOrg(project.organizationId, user.orgId);
}

// Get Projects for logged in user / org
router.get('/', requireAuth, async (req, res) => {
  try {
    const clauses = [{ userEmail: req.user.email }];
    if (req.user.orgId) {
      clauses.push({ organizationId: req.user.orgId });
    }

    const projects = await Project.find({ $or: clauses }).sort({ createdAt: -1 });
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch projects.'] });
  }
});

// Create Project
router.post('/', requireAuth, async (req, res) => {
  const { name, description, deadline, timeline, boardBg, labels, attachments } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ errors: ['Project name is required.'] });
  }

  try {
    const project = await Project.create({
      name: name.trim(),
      description: description || '',
      deadline: deadline || '',
      timeline: timeline || 'Execution',
      boardBg: boardBg || 'none',
      userEmail: req.user.email,
      organizationId: req.user.orgId || null,
      labels: labels || [],
      attachments: attachments || []
    });

    logActivity(req, `${actorName(req.user)} created project "${project.name}".`);
    res.status(201).json({ project });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ errors: ['Invalid project data.'] });
    }
    res.status(500).json({ errors: ['Failed to create project.'] });
  }
});

// Update Project
router.put('/:id', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid project id.'] });
  }

  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ errors: ['Project not found.'] });
    if (!canModifyProject(project, req.user)) {
      return res.status(403).json({ errors: ['You do not have permission to update this project.'] });
    }

    const { name, description, deadline, timeline, boardBg, labels, attachments } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ errors: ['Project name cannot be empty.'] });
      project.name = String(name).trim();
    }
    if (description !== undefined) project.description = description;
    if (deadline !== undefined) project.deadline = deadline;
    if (timeline !== undefined) project.timeline = timeline;
    if (boardBg !== undefined) project.boardBg = boardBg;
    if (labels !== undefined) project.labels = labels;
    if (attachments !== undefined) project.attachments = attachments;

    await project.save();
    res.json({ project });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ errors: ['Invalid project data.'] });
    }
    res.status(500).json({ errors: ['Failed to update project.'] });
  }
});

// Delete Project
router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid project id.'] });
  }

  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ errors: ['Project not found.'] });
    if (!canModifyProject(project, req.user)) {
      return res.status(403).json({ errors: ['You do not have permission to delete this project.'] });
    }

    await Project.findByIdAndDelete(req.params.id);
    logActivity(req, `${actorName(req.user)} deleted project "${project.name}".`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to delete project.'] });
  }
});

module.exports = router;
module.exports.canAccessProject = canAccessProject;
