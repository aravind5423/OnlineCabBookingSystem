// controllers/adminController.js — All admin management APIs
const db = require('../config/db');
const { success, error, badRequest, notFound } = require('../utils/response');
const { logAction } = require('../middleware/logger');

function getIp(req) { return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''; }

// GET /api/admin/dashboard
async function getDashboard(req, res) {
    try {
        const [[stats]] = await db.query(`
            SELECT
              (SELECT COUNT(*) FROM users WHERE role='passenger' AND status='active') AS total_passengers,
              (SELECT COUNT(*) FROM users WHERE role='driver'    AND status='active') AS total_drivers,
              (SELECT COUNT(*) FROM trips WHERE trip_status='started')                AS active_trips,
              (SELECT COUNT(*) FROM trips WHERE trip_status='completed')              AS completed_trips,
              (SELECT COALESCE(SUM(fare),0) FROM trips WHERE trip_status='completed') AS total_revenue,
              (SELECT COUNT(*) FROM driver_profiles WHERE verification_status='pending') AS pending_approvals,
              (SELECT COUNT(*) FROM ride_requests WHERE status='pending')             AS pending_requests`);
        return success(res, stats);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch dashboard stats');
    }
}

// GET /api/admin/passengers
async function listPassengers(req, res) {
    try {
        const search = req.query.search || '';
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [rows] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
                   p.passenger_id, p.default_address, p.emergency_contact,
                   COUNT(rr.request_id) AS total_bookings
            FROM users u
            JOIN passenger_profiles p ON p.user_id = u.user_id
            LEFT JOIN ride_requests rr ON rr.passenger_id = p.passenger_id
            WHERE u.role='passenger' AND (u.name LIKE ? OR u.email LIKE ?)
            GROUP BY u.user_id
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?`,
            [`%${search}%`, `%${search}%`, limit, offset]);

        const [[{ total }]] = await db.query(
            'SELECT COUNT(*) AS total FROM users u JOIN passenger_profiles p ON p.user_id=u.user_id WHERE u.role="passenger" AND (u.name LIKE ? OR u.email LIKE ?)',
            [`%${search}%`, `%${search}%`]);

        return success(res, { passengers: rows, total, page, limit });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch passengers');
    }
}

// GET /api/admin/drivers
async function listDrivers(req, res) {
    try {
        const search = req.query.search || '';
        const status = req.query.status || '';
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        let where = 'WHERE u.role="driver"';
        const params = [];
        if (search) { where += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        if (status) { where += ' AND u.status=?'; params.push(status); }

        const [rows] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
                   dp.driver_id, dp.license_no, dp.license_expiry, dp.verification_status,
                   dp.availability, dp.rating, dp.total_trips
            FROM users u
            JOIN driver_profiles dp ON dp.user_id = u.user_id
            ${where}
            ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]);

        return success(res, { drivers: rows, page, limit });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch drivers');
    }
}

// PUT /api/admin/drivers/:id/approve
async function approveDriver(req, res) {
    try {
        const userId = parseInt(req.params.id);
        const { action } = req.body || {}; // 'approve' | 'reject'
        if (!['approve', 'reject'].includes(action)) return badRequest(res, 'Action must be approve or reject');
        const status = action === 'approve' ? 'approved' : 'rejected';
        await db.query('UPDATE driver_profiles SET verification_status=? WHERE user_id=?', [status, userId]);
        await logAction(req.user.user_id, 'DRIVER_APPROVAL', `${action}d driver user #${userId}`, getIp(req));
        return success(res, {}, `Driver ${status} successfully`);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update driver status');
    }
}

// PUT /api/admin/users/:id/block
async function blockUser(req, res) {
    try {
        const userId = parseInt(req.params.id);
        const { action } = req.body || {}; // 'block' | 'unblock'
        if (!['block', 'unblock'].includes(action)) return badRequest(res, 'Action must be block or unblock');
        const status = action === 'block' ? 'blocked' : 'active';
        await db.query('UPDATE users SET status=? WHERE user_id=?', [status, userId]);
        await logAction(req.user.user_id, 'BLOCK_USER', `${action}ed user #${userId}`, getIp(req));
        return success(res, {}, `User ${action}ed successfully`);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update user status');
    }
}

// GET /api/admin/vehicles
async function listVehicles(req, res) {
    try {
        const [rows] = await db.query(`
            SELECT v.*, u.name AS driver_name, u.email AS driver_email, dp.verification_status
            FROM vehicles v
            JOIN driver_profiles dp ON dp.driver_id = v.driver_id
            JOIN users u ON u.user_id = dp.user_id
            ORDER BY v.created_at DESC`);
        return success(res, rows);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch vehicles');
    }
}

// PUT /api/admin/vehicles/:id
async function updateVehicleStatus(req, res) {
    try {
        const vehicleId = parseInt(req.params.id);
        const { status } = req.body || {};
        await db.query('UPDATE vehicles SET status=? WHERE vehicle_id=?', [status, vehicleId]);
        await logAction(req.user.user_id, 'UPDATE_VEHICLE', `Updated vehicle #${vehicleId} status to ${status}`, getIp(req));
        return success(res, {}, 'Vehicle status updated');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update vehicle');
    }
}

// GET /api/admin/trips
async function listTrips(req, res) {
    try {
        const status = req.query.status || '';
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const where  = status ? 'WHERE t.trip_status=?' : '';
        const params = status ? [status] : [];

        const [trips] = await db.query(`
            SELECT t.trip_id, t.start_time, t.end_time, t.distance_km, t.fare, t.trip_status,
                   rr.pickup_location, rr.destination, rr.vehicle_type, rr.estimated_fare, rr.requested_at,
                   pu.name AS passenger_name, du.name AS driver_name,
                   v.vehicle_number, v.model,
                   p.payment_status, p.payment_method
            FROM trips t
            JOIN ride_requests rr ON rr.request_id = t.request_id
            JOIN passenger_profiles pp ON pp.passenger_id = t.passenger_id
            JOIN users pu ON pu.user_id = pp.user_id
            JOIN driver_profiles dp ON dp.driver_id = t.driver_id
            JOIN users du ON du.user_id = dp.user_id
            JOIN vehicles v ON v.vehicle_id = t.vehicle_id
            LEFT JOIN payments p ON p.trip_id = t.trip_id
            ${where}
            ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]);

        return success(res, { trips, page, limit });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch trips');
    }
}

// GET /api/admin/fare-rules
async function listFareRules(req, res) {
    try {
        const [rows] = await db.query('SELECT * FROM fare_rules ORDER BY vehicle_type');
        return success(res, rows);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch fare rules');
    }
}

// PUT /api/admin/fare-rules/:id
async function updateFareRule(req, res) {
    try {
        const fareId = parseInt(req.params.id);
        const { base_fare, per_km_rate, per_minute_rate, cancellation_fee, surge_multiplier, status } = req.body || {};
        await db.query(`
            UPDATE fare_rules SET base_fare=?, per_km_rate=?, per_minute_rate=?,
              cancellation_fee=?, surge_multiplier=?, status=? WHERE fare_id=?`,
            [base_fare, per_km_rate, per_minute_rate, cancellation_fee, surge_multiplier, status, fareId]);
        await logAction(req.user.user_id, 'UPDATE_FARE', `Updated fare rule #${fareId}`, getIp(req));
        return success(res, {}, 'Fare rule updated successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update fare rule');
    }
}

// GET /api/admin/service-areas
async function listServiceAreas(req, res) {
    try {
        const [rows] = await db.query('SELECT * FROM service_areas ORDER BY city, area_name');
        return success(res, rows);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch service areas');
    }
}

// POST /api/admin/service-areas
async function addServiceArea(req, res) {
    try {
        const { area_name, city, state, pincode } = req.body || {};
        if (!area_name || !city || !state) return badRequest(res, 'Area name, city and state are required');
        const [result] = await db.query(
            'INSERT INTO service_areas (area_name, city, state, pincode) VALUES (?, ?, ?, ?)',
            [area_name, city, state, pincode || null]);
        await logAction(req.user.user_id, 'ADD_SERVICE_AREA', `Added area: ${area_name}, ${city}`, getIp(req));
        return success(res, { area_id: result.insertId }, 'Service area added', 201);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to add service area');
    }
}

// PUT /api/admin/service-areas/:id
async function updateServiceArea(req, res) {
    try {
        const areaId = parseInt(req.params.id);
        const { area_name, city, state, pincode, status } = req.body || {};
        await db.query(
            'UPDATE service_areas SET area_name=?, city=?, state=?, pincode=?, status=? WHERE area_id=?',
            [area_name, city, state, pincode, status, areaId]);
        await logAction(req.user.user_id, 'UPDATE_SERVICE_AREA', `Updated area #${areaId}`, getIp(req));
        return success(res, {}, 'Service area updated');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update service area');
    }
}

// GET /api/admin/reports/revenue
async function revenueReport(req, res) {
    try {
        const { from, to } = req.query;
        const dateFilter = from && to ? 'AND DATE(t.end_time) BETWEEN ? AND ?' : '';
        const params = from && to ? [from, to] : [];

        const [daily] = await db.query(`
            SELECT DATE(t.end_time) AS date,
                   COUNT(*) AS trips, COALESCE(SUM(t.fare), 0) AS revenue
            FROM trips t
            WHERE t.trip_status='completed' ${dateFilter}
            GROUP BY DATE(t.end_time)
            ORDER BY date DESC LIMIT 30`, params);

        const [[totals]] = await db.query(`
            SELECT COUNT(*) AS total_trips, COALESCE(SUM(fare),0) AS total_revenue,
                   COALESCE(AVG(fare),0) AS avg_fare
            FROM trips WHERE trip_status='completed' ${dateFilter}`, params);

        return success(res, { daily, totals });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch revenue report');
    }
}

module.exports = {
    getDashboard, listPassengers, listDrivers, approveDriver, blockUser,
    listVehicles, updateVehicleStatus,
    listTrips, listFareRules, updateFareRule,
    listServiceAreas, addServiceArea, updateServiceArea,
    revenueReport
};
