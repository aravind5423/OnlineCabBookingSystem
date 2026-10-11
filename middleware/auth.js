// middleware/auth.js — JWT verification middleware
const { verify } = require('../utils/jwt');
const { unauthorized } = require('../utils/response');

/**
 * Attach authenticated user to req.user from Bearer token.
 * Returns 401 if token is missing or invalid.
 */
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) return unauthorized(res, 'No token provided');

    const payload = verify(token);
    if (!payload)  return unauthorized(res, 'Invalid or expired token');

    req.user = payload; // { user_id, name, email, role }
    next();
}

module.exports = { authenticate };
