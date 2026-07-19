const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, provider: user.provider },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '4h' }
  );
}

function validateFields(email, password) {
  const errors = [];
  if (!email || !email.trim()) errors.push('Email is required.');
  else if (!EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (!password || !password.trim()) errors.push('Password is required.');
  return errors;
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  const errors = validateFields(email, password);
  if (errors.length) return res.status(400).json({ errors });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ errors: ['An account with that email already exists.'] });
    }

    const user = await User.create({ email: normalizedEmail, password, provider: 'email' });
    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ errors: ['Something went wrong. Please try again.'] });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const errors = validateFields(email, password);
  if (errors.length) return res.status(400).json({ errors });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ errors: ['Account not found.'] });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ errors: ['Incorrect password.'] });

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ errors: ['Something went wrong. Please try again.'] });
  }
});

router.post('/google-demo', async (req, res) => {
  const { email } = req.body;
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ errors: ['Please enter a valid Google email address.'] });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({ email: normalizedEmail, provider: 'google' });
    }
    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Google demo login error:', err);
    res.status(500).json({ errors: ['Something went wrong. Please try again.'] });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ errors: ['User not found.'] });
  res.json({ user: user.toSafeObject() });
});

module.exports = router;
