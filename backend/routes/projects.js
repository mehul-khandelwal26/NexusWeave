const express = require('express');
const Project = require('../models/Project');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get Projects for logged in user / org
router.get('/', requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [{ userEmail: req.user.email }, { organizationId: req.user.orgId }]
    }).sort({ createdAt: -1 });

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch projects.'] });
  }
});

// Create Project
router.post('/', requireAuth, async (req, res) => {
  const { name, description, deadline, timeline, boardBg } = req.body;
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
      organizationId: req.user.orgId
    });

    res.status(201).json({ project });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to create project.'] });
  }
});

module.exports = router;
