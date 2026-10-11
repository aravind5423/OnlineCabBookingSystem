// controllers/driverController.js — All driver APIs
const db = require('../config/db');
const { success, error, badRequest, notFound } = require('../utils/response');
const { logAction } = require('../middleware/logger');

function getIp(req) { return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''; }

async function getDriverProfile(userId) {
    const [rows] = await db.query(
        'SELECT driver_id FROM driver_profiles WHERE user_id=?', [userId]);
    return rows[0] || null;
}

// GET /api/driver/profile
async function getProfile(req, res) {
    try {
        const [rows] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
                   dp.driver_id, dp.license_no, dp.license_expiry, dp.experience_years,
                   dp.verification_status, dp.availability, dp.rating, dp.total_trips
            FROM users u
            JOIN driver_profiles dp ON dp.user_id = u.user_id
            WHERE u.user_id = ?`, [req.user.user_id]);
        if (!rows.length) return notFound(res, 'Driver profile not found');
        return success(res, rows[0]);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch driver profile');
    }
}

// PUT /api/driver/profile
async function updateProfile(req, res) {
    try {
        const { name, mobile, license_no, license_expiry, experience_years } = req.body || {};
        await db.query('UPDATE users SET name=?, mobile=? WHERE user_id=?',
            [name, mobile, req.user.user_id]);
        await db.query(
            'UPDATE driver_profiles SET license_no=?, license_expiry=?, experience_years=? WHERE user_id=?',
            [license_no, license_expiry, experience_years || 0, req.user.user_id]);
        await logAction(req.user.user_id, 'UPDATE_PROFILE', 'Driver updated profile', getIp(req));
        return success(res, {}, 'Profile updated successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update profile');
    }
}

// PUT /api/driver/availability
async function setAvailability(req, res) {
    try {
        const { availability } = req.body || {};
        if (!['online', 'offline'].includes(availability)) {
            return badRequest(res, 'Availability must be online or offline');
        }
        // Driver must be approved
        const [rows] = await db.query(
            'SELECT verification_status FROM driver_profiles WHERE user_id=?', [req.user.user_id]);
        if (!rows.length) return notFound(res, 'Driver profile not found');
        if (rows[0].verification_status !== 'approved') {
            return error(res, 'Your account must be approved to go online', 403);
        }
        await db.query('UPDATE driver_profiles SET availability=? WHERE user_id=?',
            [availability, req.user.user_id]);
        await logAction(req.user.user_id, 'SET_AVAILABILITY', `Driver set status to ${availability}`, getIp(req));
        return success(res, { availability }, `You are now ${availability}`);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update availability');
    }
}

// GET /api/driver/requests — Pending requests for this driver's vehicle type
async function getRideRequests(req, res) {
    try {
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const [vehicles] = await db.query(
            'SELECT vehicle_type FROM vehicles WHERE driver_id=? AND status="active" LIMIT 1',
            [dp.driver_id]);
        const vType = vehicles[0]?.vehicle_type || 'sedan';

        const [requests] = await db.query(`
            SELECT rr.request_id, rr.pickup_location, rr.destination, rr.vehicle_type,
                   rr.estimated_fare, rr.estimated_km, rr.requested_at,
                   u.name AS passenger_name, u.mobile AS passenger_mobile
            FROM ride_requests rr
            JOIN passenger_profiles pp ON pp.passenger_id = rr.passenger_id
            JOIN users u ON u.user_id = pp.user_id
            WHERE rr.status = 'pending' AND rr.vehicle_type = ?
            ORDER BY rr.requested_at ASC`, [vType]);

        return success(res, requests);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch ride requests');
    }
}

// PUT /api/driver/requests/:id — Accept or reject a ride request
async function respondToRequest(req, res) {
    try {
        const requestId = parseInt(req.params.id);
        const { action } = req.body || {}; // 'accept' | 'reject'

        if (!['accept', 'reject'].includes(action)) {
            return badRequest(res, 'Action must be accept or reject');
        }

        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const [rows] = await db.query(
            'SELECT * FROM ride_requests WHERE request_id=? AND status="pending"', [requestId]);
        if (!rows.length) return notFound(res, 'Ride request not available');

        if (action === 'reject') {
            await logAction(req.user.user_id, 'REJECT_RIDE', `Rejected ride request #${requestId}`, getIp(req));
            return success(res, {}, 'Ride request rejected');
        }

        // Accept: create a trip record
        const [vehicles] = await db.query(
            'SELECT vehicle_id FROM vehicles WHERE driver_id=? AND status="active" LIMIT 1',
            [dp.driver_id]);
        if (!vehicles.length) return error(res, 'No active vehicle found. Please add a vehicle first.', 400);

        await db.query('UPDATE ride_requests SET status="accepted" WHERE request_id=?', [requestId]);
        const req_row = rows[0];
        await db.query(`
            INSERT INTO trips (request_id, passenger_id, driver_id, vehicle_id, trip_status)
            VALUES (?, ?, ?, ?, 'assigned')`,
            [requestId, req_row.passenger_id, dp.driver_id, vehicles[0].vehicle_id]);

        await logAction(req.user.user_id, 'ACCEPT_RIDE', `Accepted ride request #${requestId}`, getIp(req));
        return success(res, {}, 'Ride request accepted! Head to pickup location.');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to respond to request');
    }
}

// PUT /api/driver/trips/:id/start
async function startTrip(req, res) {
    try {
        const tripId = parseInt(req.params.id);
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const [trips] = await db.query(
            'SELECT * FROM trips WHERE trip_id=? AND driver_id=? AND trip_status="assigned"',
            [tripId, dp.driver_id]);
        if (!trips.length) return notFound(res, 'Trip not found or already started');

        await db.query(
            'UPDATE trips SET trip_status="started", start_time=NOW() WHERE trip_id=?', [tripId]);
        await logAction(req.user.user_id, 'START_TRIP', `Started trip #${tripId}`, getIp(req));
        return success(res, {}, 'Trip started!');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to start trip');
    }
}

// PUT /api/driver/trips/:id/complete
async function completeTrip(req, res) {
    try {
        const tripId = parseInt(req.params.id);
        const { distance_km, payment_method = 'cash' } = req.body || {};
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const [trips] = await db.query(
            'SELECT * FROM trips WHERE trip_id=? AND driver_id=? AND trip_status="started"',
            [tripId, dp.driver_id]);
        if (!trips.length) return notFound(res, 'Active trip not found');

        const trip = trips[0];
        // Calculate actual fare
        const [rr] = await db.query('SELECT * FROM ride_requests WHERE request_id=?', [trip.request_id]);
        const distKm = distance_km || rr[0]?.estimated_km || 5;

        const { calculateFare } = require('../utils/fareCalculator');
        const fareInfo = await calculateFare(rr[0]?.vehicle_type || 'sedan', parseFloat(distKm));
        const finalFare = fareInfo?.estimated_fare || rr[0]?.estimated_fare || 0;

        await db.query(
            'UPDATE trips SET trip_status="completed", end_time=NOW(), distance_km=?, fare=? WHERE trip_id=?',
            [distKm, finalFare, tripId]);
        await db.query('UPDATE ride_requests SET status="completed" WHERE request_id=?', [trip.request_id]);

        // Create payment record
        await db.query(`
            INSERT INTO payments (trip_id, passenger_id, amount, payment_method, payment_status)
            VALUES (?, ?, ?, ?, 'pending')`,
            [tripId, trip.passenger_id, finalFare, payment_method]);

        // Update driver total trips
        await db.query(
            'UPDATE driver_profiles SET total_trips = total_trips + 1 WHERE driver_id=?', [dp.driver_id]);

        await logAction(req.user.user_id, 'COMPLETE_TRIP', `Completed trip #${tripId}`, getIp(req));
        return success(res, { fare: finalFare }, 'Trip completed! Fare: ₹' + finalFare);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to complete trip');
    }
}

// GET /api/driver/trips — Driver trip history
async function getTripHistory(req, res) {
    try {
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const [trips] = await db.query(`
            SELECT t.trip_id, t.start_time, t.end_time, t.distance_km, t.fare, t.trip_status,
                   rr.pickup_location, rr.destination, rr.vehicle_type,
                   u.name AS passenger_name, u.mobile AS passenger_mobile,
                   v.vehicle_number, v.model,
                   rv.rating AS passenger_rating, rv.comment AS passenger_review
            FROM trips t
            JOIN ride_requests rr ON rr.request_id = t.request_id
            JOIN passenger_profiles pp ON pp.passenger_id = t.passenger_id
            JOIN users u ON u.user_id = pp.user_id
            JOIN vehicles v ON v.vehicle_id = t.vehicle_id
            LEFT JOIN ratings_reviews rv ON rv.trip_id = t.trip_id AND rv.reviewer_role = 'passenger'
            WHERE t.driver_id = ?
            ORDER BY t.start_time DESC`, [dp.driver_id]);

        return success(res, trips);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch trip history');
    }
}

// GET /api/driver/earnings
async function getEarnings(req, res) {
    try {
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const [summary] = await db.query(`
            SELECT
              COUNT(*) AS total_trips,
              COALESCE(SUM(t.fare), 0) AS total_earnings,
              COALESCE(SUM(CASE WHEN DATE(t.end_time)=CURDATE() THEN t.fare END), 0) AS today_earnings,
              COALESCE(SUM(CASE WHEN YEARWEEK(t.end_time)=YEARWEEK(NOW()) THEN t.fare END), 0) AS week_earnings,
              COALESCE(SUM(CASE WHEN MONTH(t.end_time)=MONTH(NOW()) AND YEAR(t.end_time)=YEAR(NOW()) THEN t.fare END), 0) AS month_earnings
            FROM trips t
            WHERE t.driver_id=? AND t.trip_status='completed'`, [dp.driver_id]);

        const [recent] = await db.query(`
            SELECT t.trip_id, t.start_time, t.end_time, t.fare,
                   rr.pickup_location, rr.destination
            FROM trips t
            JOIN ride_requests rr ON rr.request_id = t.request_id
            WHERE t.driver_id=? AND t.trip_status='completed'
            ORDER BY t.end_time DESC LIMIT 10`, [dp.driver_id]);

        return success(res, { summary: summary[0], recent_trips: recent });
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch earnings');
    }
}

// GET /api/driver/vehicles
async function getVehicles(req, res) {
    try {
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');
        const [vehicles] = await db.query(
            'SELECT * FROM vehicles WHERE driver_id=? ORDER BY created_at DESC', [dp.driver_id]);
        return success(res, vehicles);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch vehicles');
    }
}

// POST /api/driver/vehicles
async function addVehicle(req, res) {
    try {
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const { vehicle_number, vehicle_type, model, color, capacity, year } = req.body || {};
        if (!vehicle_number || !vehicle_type || !model) {
            return badRequest(res, 'Vehicle number, type, and model are required');
        }

        const [result] = await db.query(`
            INSERT INTO vehicles (driver_id, vehicle_number, vehicle_type, model, color, capacity, year)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [dp.driver_id, vehicle_number.toUpperCase(), vehicle_type, model, color, capacity || 4, year || null]);

        await logAction(req.user.user_id, 'ADD_VEHICLE', `Added vehicle ${vehicle_number}`, getIp(req));
        return success(res, { vehicle_id: result.insertId }, 'Vehicle added successfully', 201);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return badRequest(res, 'Vehicle number already registered');
        console.error(err);
        return error(res, 'Failed to add vehicle');
    }
}

// PUT /api/driver/vehicles/:id
async function updateVehicle(req, res) {
    try {
        const vehicleId = parseInt(req.params.id);
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return notFound(res, 'Driver profile not found');

        const { model, color, capacity, status } = req.body || {};
        await db.query(
            'UPDATE vehicles SET model=?, color=?, capacity=?, status=? WHERE vehicle_id=? AND driver_id=?',
            [model, color, capacity, status, vehicleId, dp.driver_id]);
        await logAction(req.user.user_id, 'UPDATE_VEHICLE', `Updated vehicle #${vehicleId}`, getIp(req));
        return success(res, {}, 'Vehicle updated successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update vehicle');
    }
}

// GET /api/driver/active-trip
async function getActiveTrip(req, res) {
    try {
        const dp = await getDriverProfile(req.user.user_id);
        if (!dp) return success(res, null);

        const [rows] = await db.query(`
            SELECT t.trip_id, t.trip_status, t.start_time,
                   rr.pickup_location, rr.destination, rr.estimated_fare, rr.vehicle_type,
                   u.name AS passenger_name, u.mobile AS passenger_mobile
            FROM trips t
            JOIN ride_requests rr ON rr.request_id = t.request_id
            JOIN passenger_profiles pp ON pp.passenger_id = t.passenger_id
            JOIN users u ON u.user_id = pp.user_id
            WHERE t.driver_id=? AND t.trip_status IN ('assigned','started')
            LIMIT 1`, [dp.driver_id]);

        return success(res, rows[0] || null);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch active trip');
    }
}

module.exports = {
    getProfile, updateProfile, setAvailability,
    getRideRequests, respondToRequest,
    startTrip, completeTrip, getTripHistory,
    getEarnings, getVehicles, addVehicle, updateVehicle, getActiveTrip
};
