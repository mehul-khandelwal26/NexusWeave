const Activity = require('../models/Activity');

/**
 * Records an activity entry and pushes it to the organization in real time.
 * Failures are swallowed so that logging can never break the request it
 * belongs to.
 */
async function logActivity(req, text, { organizationId } = {}) {
  if (!req || !req.user || !text) return null;
  // Membership changes carry the org explicitly because the caller's token
  // still holds the previous (or empty) organization at that point.
  const orgId = organizationId !== undefined ? organizationId : (req.user.orgId || null);
  try {
    const entry = await Activity.create({
      userEmail: req.user.email,
      organizationId: orgId,
      text
    });

    const broadcastToOrg = req.app.get('broadcastToOrg');
    if (broadcastToOrg && orgId) {
      Promise.resolve(
        broadcastToOrg(orgId, {
          type: 'activity_update',
          payload: {
            id: entry._id.toString(),
            userEmail: entry.userEmail,
            text: entry.text,
            createdAt: entry.createdAt
          }
        })
      ).catch(() => {});
    }

    return entry;
  } catch (err) {
    console.error('Activity log error:', err.message);
    return null;
  }
}

module.exports = { logActivity };
