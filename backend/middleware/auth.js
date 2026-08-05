const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ errors: ['Access token missing or invalid format.'] });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'nexusweave_super_secret_jwt_key_2026');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ errors: ['Token is invalid or expired.'] });
  }
};
