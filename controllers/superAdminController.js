// controllers/superAdminController.js — Super Admin exclusive APIs
const db = require('../config/db');
const { hashPassword } = require('../utils/hash');
const { success, error, badRequest, notFound } = require('../utils/response');
const { logAction } = require('../middleware/logger');

function getIp(req) { return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''; }

// GET /api/superadmin/dashboard
async function getDashboard(req, res) {
    try {
        const [[stats]] = await db.query(`
            SELECT
              (SELECT COUNT(*) FROM users)                                            AS total_users,
              (SELECT COUNT(*) FROM users WHERE role='admin')                         AS total_admins,
              (SELECT COUNT(*) FROM users WHERE role='passenger')                     AS total_passengers,
              (SELECT COUNT(*) FROM users WHERE role='driver')                        AS total_drivers,
              (SELECT COUNT(*) FROM trips)                                             AS total_trips,
              (SELECT COALESCE(SUM(fare),0) FROM trips WHERE trip_status='completed') AS total_revenue,
              (SELECT COUNT(*) FROM system_logs WHERE DATE(created_at)=CURDATE())     AS today_logs,
              (SELECT COUNT(*) FROM users WHERE status='blocked')                     AS blocked_users`);
        return success(res, stats);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch super admin dashboard');
    }
}

// GET /api/superadmin/admins
async function listAdmins(req, res) {
    try {
        const [rows] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
                   GROUP_CONCAT(ap.permission_name SEPARATOR ',') AS permissions
            FROM users u
            LEFT JOIN admin_permissions ap ON ap.admin_id = u.user_id
            WHERE u.role = 'admin'
            GROUP BY u.user_id
            ORDER BY u.created_at DESC`);
        return success(res, rows.map(r => ({
            ...r,
            permissions: r.permissions ? r.permissions.split(',') : []
        })));
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch admins');
    }
}

// POST /api/superadmin/admins
async function createAdmin(req, res) {
    try {
        const { name, email, password, mobile, permissions = [] } = req.body || {};
        if (!name || !email || !password || !mobile) {
            return badRequest(res, 'Name, email, password and mobile are required');
        }

        const [existing] = await db.query('SELECT user_id FROM users WHERE email=?', [email]);
        if (existing.length) return badRequest(res, 'Email already registered');

        const hashed = hashPassword(password);
        const [result] = await db.query(
            'INSERT INTO users (name, email, password, mobile, role, status) VALUES (?, ?, ?, ?, "admin", "active")',
            [name, email.toLowerCase(), hashed, mobile]);
        const adminId = result.insertId;

        // Assign permissions
        if (permissions.length) {
            const perms = permissions.map(p => [adminId, p, req.user.user_id]);
            await db.query(
                'INSERT INTO admin_permissions (admin_id, permission_name, granted_by) VALUES ?', [perms]);
        }

        await logAction(req.user.user_id, 'CREATE_ADMIN', `Created admin: ${email}`, getIp(req));
        return success(res, { user_id: adminId }, 'Admin created successfully', 201);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to create admin');
    }
}

// PUT /api/superadmin/admins/:id
async function updateAdmin(req, res) {
    try {
        const adminId = parseInt(req.params.id);
        const { name, mobile, status } = req.body || {};

        const [check] = await db.query('SELECT role FROM users WHERE user_id=?', [adminId]);
        if (!check.length || check[0].role !== 'admin') return notFound(res, 'Admin not found');

        await db.query('UPDATE users SET name=?, mobile=?, status=? WHERE user_id=?',
            [name, mobile, status, adminId]);
        await logAction(req.user.user_id, 'UPDATE_ADMIN', `Updated admin #${adminId}`, getIp(req));
        return success(res, {}, 'Admin updated successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update admin');
    }
}

// DELETE /api/superadmin/admins/:id
async function deleteAdmin(req, res) {
    try {
        const adminId = parseInt(req.params.id);
        if (adminId === req.user.user_id) return badRequest(res, 'Cannot delete your own account');

        const [check] = await db.query('SELECT role FROM users WHERE user_id=?', [adminId]);
        if (!check.length || check[0].role !== 'admin') return notFound(res, 'Admin not found');

        await db.query('DELETE FROM users WHERE user_id=?', [adminId]);
        await logAction(req.user.user_id, 'DELETE_ADMIN', `Deleted admin #${adminId}`, getIp(req));
        return success(res, {}, 'Admin deleted successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to delete admin');
    }
}

// GET /api/superadmin/permissions/:adminId
async function getPermissions(req, res) {
    try {
        const adminId = parseInt(req.params.adminId);
        const [perms] = await db.query(
            'SELECT * FROM admin_permissions WHERE admin_id=?', [adminId]);
        return success(res, perms);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch permissions');
    }
}

// POST /api/superadmin/permissions
async function grantPermission(req, res) {
    try {
        const { admin_id, permission_name } = req.body || {};
        if (!admin_id || !permission_name) return badRequest(res, 'admin_id and permission_name are required');

        await db.query(
            'INSERT IGNORE INTO admin_permissions (admin_id, permission_name, granted_by) VALUES (?, ?, ?)',
            [admin_id, permission_name, req.user.user_id]);
        await logAction(req.user.user_id, 'GRANT_PERMISSION',
            `Granted "${permission_name}" to admin #${admin_id}`, getIp(req));
        return success(res, {}, 'Permission granted');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to grant permission');
    }
}

// DELETE /api/superadmin/permissions
async function revokePermission(req, res) {
    try {
        const { admin_id, permission_name } = req.body || {};
        await db.query(
            'DELETE FROM admin_permissions WHERE admin_id=? AND permission_name=?',
            [admin_id, permission_name]);
        await logAction(req.user.user_id, 'REVOKE_PERMISSION',
            `Revoked "${permission_name}" from admin #${admin_id}`, getIp(req));
        return success(res, {}, 'Permission revoked');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to revoke permission');
    }
}

// GET /api/superadmin/logs
async function getSystemLogs(req, res) {
    try {
        const { user_id, action, from, to } = req.query;
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];
        if (user_id) { where += ' AND sl.user_id=?'; params.push(user_id); }
        if (action)  { where += ' AND sl.action LIKE ?'; params.push(`%${action}%`); }
        if (from)    { where += ' AND DATE(sl.created_at) >= ?'; params.push(from); }
        if (to)      { where += ' AND DATE(sl.created_at) <= ?'; params.push(to); }

        const [logs] = await db.query(`
            SELECT sl.log_id, sl.action, sl.description, sl.ip_address, sl.created_at,
                   u.name AS user_name, u.email AS user_email, u.role AS user_role
            FROM system_logs sl
            LEFT JOIN users u ON u.user_id = sl.user_id
            ${where}
            ORDER BY sl.created_at DESC
            LIMIT ? OFFSET ?`, [...params, limit, offset]);

        return success(res, { logs, page, limit });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch system logs');
    }
}

// GET /api/superadmin/reports
async function getSystemReports(req, res) {
    try {
        const [userStats] = await db.query(`
            SELECT role, status, COUNT(*) AS count
            FROM users GROUP BY role, status`);

        const [tripStats] = await db.query(`
            SELECT trip_status, COUNT(*) AS count,
                   COALESCE(SUM(fare),0) AS revenue
            FROM trips GROUP BY trip_status`);

        const [monthlyRevenue] = await db.query(`
            SELECT DATE_FORMAT(end_time,'%Y-%m') AS month,
                   COUNT(*) AS trips, COALESCE(SUM(fare),0) AS revenue
            FROM trips WHERE trip_status='completed'
            GROUP BY month ORDER BY month DESC LIMIT 12`);

        return success(res, { user_stats: userStats, trip_stats: tripStats, monthly_revenue: monthlyRevenue });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch reports');
    }
}

module.exports = {
    getDashboard, listAdmins, createAdmin, updateAdmin, deleteAdmin,
    getPermissions, grantPermission, revokePermission,
    getSystemLogs, getSystemReports
};
