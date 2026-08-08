const { OAuth2Client } = require('google-auth-library');

let client = null;

function getClient() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is required');
  }
  if (!client) {
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
}

/**
 * Verifies a Google ID token (the credential returned by Google Identity
 * Services on the frontend) and returns the decoded, trustworthy payload.
 * Throws if the token is missing, expired, malformed, or was issued for a
 * different client ID.
 */
async function verifyGoogleToken(idToken) {
  if (!idToken) {
    throw new Error('Missing Google ID token');
  }
  const oauthClient = getClient();
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Google token did not include an email address');
  }
  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    emailVerified: payload.email_verified,
    name: payload.name || (payload.email ? payload.email.split('@')[0] : 'User'),
    avatar: payload.picture || ''
  };
}

module.exports = { verifyGoogleToken };
