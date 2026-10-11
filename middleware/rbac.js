// middleware/rbac.js — Role-Based Access Control
const { forbidden } = require('../utils/response');

/**
 * Returns middleware that checks req.user.role against allowed roles.
 * @param {...string} roles - allowed roles e.g. 'admin', 'superadmin'
 */
function authorize(...roles) {
    return function (req, res, next) {
        if (!req.user) return forbidden(res, 'Not authenticated');
        if (!roles.includes(req.user.role)) {
            return forbidden(res, `Access denied. Required roles: ${roles.join(', ')}`);
        }
        next();
    };
}

module.exports = { authorize };
