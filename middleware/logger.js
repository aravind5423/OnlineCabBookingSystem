// middleware/logger.js — System log writer
const db = require('../config/db');

/**
 * Write an entry to system_logs table.
 * Can be called directly from controllers after mutations.
 */
async function logAction(userId, action, description, ipAddress = '') {
    try {
        await db.query(
            'INSERT INTO system_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)',
            [userId || null, action, description, ipAddress]
        );
    } catch (err) {
        console.error('[Logger] Failed to write system log:', err.message);
    }
}

/**
 * Express-style middleware that auto-logs mutating requests on completion.
 * Attach to routes that need audit trails.
 */
function auditLog(action, descriptionFn) {
    return async function (req, res, next) {
        const originalEnd = res.end.bind(res);
        res.end = async function (...args) {
            originalEnd(...args);
            const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
            const desc = typeof descriptionFn === 'function'
                ? descriptionFn(req)
                : descriptionFn || `${req.method} ${req.url}`;
            await logAction(req.user?.user_id, action, desc, ip);
        };
        next();
    };
}

module.exports = { logAction, auditLog };
