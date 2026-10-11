// controllers/passengerController.js — All passenger APIs
const db = require('../config/db');
const { calculateFare, haversineKm } = require('../utils/fareCalculator');
const { success, error, badRequest, notFound } = require('../utils/response');
const { logAction } = require('../middleware/logger');

function getIp(req) { return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''; }

// GET /api/passenger/profile
async function getProfile(req, res) {
    try {
        const [rows] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
                   p.passenger_id, p.default_address, p.emergency_contact
            FROM users u
            JOIN passenger_profiles p ON p.user_id = u.user_id
            WHERE u.user_id = ?`, [req.user.user_id]);
        if (!rows.length) return notFound(res, 'Passenger profile not found');
        return success(res, rows[0]);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch profile');
    }
}

// PUT /api/passenger/profile
async function updateProfile(req, res) {
    try {
        const { name, mobile, default_address, emergency_contact } = req.body || {};
        await db.query('UPDATE users SET name=?, mobile=? WHERE user_id=?',
            [name, mobile, req.user.user_id]);
        await db.query(
            'UPDATE passenger_profiles SET default_address=?, emergency_contact=? WHERE user_id=?',
            [default_address, emergency_contact, req.user.user_id]);
        await logAction(req.user.user_id, 'UPDATE_PROFILE', 'Passenger updated profile', getIp(req));
        return success(res, {}, 'Profile updated successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to update profile');
    }
}

// POST /api/rides/search — Search available drivers + estimate fare
async function searchRides(req, res) {
    try {
        const { pickup_location, destination, vehicle_type = 'sedan',
                pickup_lat, pickup_lng, dest_lat, dest_lng } = req.body || {};

        if (!pickup_location || !destination) {
            return badRequest(res, 'Pickup and destination are required');
        }

        // Get available drivers with active vehicles
        const [drivers] = await db.query(`
            SELECT dp.driver_id, u.name, u.mobile, dp.rating, dp.total_trips,
                   v.vehicle_id, v.vehicle_number, v.vehicle_type, v.model, v.color, v.capacity
            FROM driver_profiles dp
            JOIN users u ON u.user_id = dp.user_id
            JOIN vehicles v ON v.driver_id = dp.driver_id AND v.vehicle_type = ? AND v.status = 'active'
            WHERE dp.availability = 'online' AND dp.verification_status = 'approved'
              AND u.status = 'active'
            ORDER BY dp.rating DESC LIMIT 10`, [vehicle_type]);

        // Estimate fare
        const distKm = (pickup_lat && dest_lat)
            ? haversineKm(+pickup_lat, +pickup_lng, +dest_lat, +dest_lng)
            : 5; // default estimate
        const fareInfo = await calculateFare(vehicle_type, distKm);

        return success(res, { drivers, fare_estimate: fareInfo, estimated_km: distKm.toFixed(2) });
    } catch (err) {
        console.error(err);
        return error(res, 'Search failed');
    }
}

// POST /api/rides/book
async function bookRide(req, res) {
    try {
        const { pickup_location, destination, vehicle_type = 'sedan',
                pickup_lat, pickup_lng, dest_lat, dest_lng } = req.body || {};

        if (!pickup_location || !destination) {
            return badRequest(res, 'Pickup and destination are required');
        }

        // Get passenger profile
        const [pp] = await db.query('SELECT passenger_id FROM passenger_profiles WHERE user_id=?',
            [req.user.user_id]);
        if (!pp.length) return error(res, 'Passenger profile not found', 404);
        const passengerProfileId = pp[0].passenger_id;

        const distKm = (pickup_lat && dest_lat)
            ? haversineKm(+pickup_lat, +pickup_lng, +dest_lat, +dest_lng)
            : 5;
        const fareInfo = await calculateFare(vehicle_type, distKm);

        const [result] = await db.query(`
            INSERT INTO ride_requests
              (passenger_id, pickup_location, pickup_lat, pickup_lng,
               destination, dest_lat, dest_lng, vehicle_type, estimated_fare, estimated_km, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [passengerProfileId, pickup_location, pickup_lat || null, pickup_lng || null,
             destination, dest_lat || null, dest_lng || null, vehicle_type,
             fareInfo?.estimated_fare || 0, distKm.toFixed(2)]);

        await logAction(req.user.user_id, 'BOOK_RIDE',
            `Booked ride from ${pickup_location} to ${destination}`, getIp(req));
        return success(res, { request_id: result.insertId, estimated_fare: fareInfo?.estimated_fare },
            'Ride requested successfully', 201);
    } catch (err) {
        console.error(err);
        return error(res, 'Booking failed');
    }
}

// PUT /api/rides/:id/cancel
async function cancelRide(req, res) {
    try {
        const requestId = parseInt(req.params.id);
        const { cancel_reason } = req.body || {};

        const [pp] = await db.query('SELECT passenger_id FROM passenger_profiles WHERE user_id=?',
            [req.user.user_id]);
        if (!pp.length) return error(res, 'Profile not found', 404);

        const [rows] = await db.query(
            'SELECT * FROM ride_requests WHERE request_id=? AND passenger_id=?',
            [requestId, pp[0].passenger_id]);
        if (!rows.length) return notFound(res, 'Ride request not found');

        const req_row = rows[0];
        if (!['pending', 'accepted'].includes(req_row.status)) {
            return badRequest(res, 'This ride cannot be cancelled');
        }

        await db.query(
            'UPDATE ride_requests SET status="cancelled", cancel_reason=? WHERE request_id=?',
            [cancel_reason || 'Cancelled by passenger', requestId]);

        await logAction(req.user.user_id, 'CANCEL_RIDE', `Cancelled ride request #${requestId}`, getIp(req));
        return success(res, {}, 'Ride cancelled successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Cancellation failed');
    }
}

// GET /api/rides/history
async function tripHistory(req, res) {
    try {
        const [pp] = await db.query('SELECT passenger_id FROM passenger_profiles WHERE user_id=?',
            [req.user.user_id]);
        if (!pp.length) return error(res, 'Profile not found', 404);

        const [trips] = await db.query(`
            SELECT t.trip_id, t.start_time, t.end_time, t.distance_km, t.fare, t.trip_status,
                   rr.pickup_location, rr.destination, rr.vehicle_type, rr.estimated_fare,
                   rr.status AS request_status,
                   u.name AS driver_name, u.mobile AS driver_mobile,
                   dp.rating AS driver_rating,
                   v.vehicle_number, v.model,
                   p.payment_status, p.payment_method,
                   rv.rating AS my_rating, rv.comment AS my_review
            FROM ride_requests rr
            JOIN passenger_profiles pp ON pp.passenger_id = rr.passenger_id
            LEFT JOIN trips t        ON t.request_id = rr.request_id
            LEFT JOIN driver_profiles dp ON dp.driver_id = t.driver_id
            LEFT JOIN users u        ON u.user_id = dp.user_id
            LEFT JOIN vehicles v     ON v.vehicle_id = t.vehicle_id
            LEFT JOIN payments p     ON p.trip_id = t.trip_id
            LEFT JOIN ratings_reviews rv ON rv.trip_id = t.trip_id AND rv.reviewer_id = ?
            WHERE rr.passenger_id = ?
            ORDER BY rr.requested_at DESC`,
            [req.user.user_id, pp[0].passenger_id]);

        return success(res, trips);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch trip history');
    }
}

// POST /api/rides/:id/rate
async function rateTrip(req, res) {
    try {
        const tripId = parseInt(req.params.id);
        const { rating, comment } = req.body || {};

        if (!rating || rating < 1 || rating > 5) {
            return badRequest(res, 'Rating must be between 1 and 5');
        }

        // Verify trip belongs to passenger and is completed
        const [pp] = await db.query('SELECT passenger_id FROM passenger_profiles WHERE user_id=?',
            [req.user.user_id]);
        const [trips] = await db.query(
            'SELECT * FROM trips WHERE trip_id=? AND passenger_id=? AND trip_status="completed"',
            [tripId, pp[0].passenger_id]);
        if (!trips.length) return notFound(res, 'Completed trip not found');

        const trip = trips[0];
        // Get driver's user_id
        const [driverUser] = await db.query(
            'SELECT user_id FROM driver_profiles WHERE driver_id=?', [trip.driver_id]);

        await db.query(`
            INSERT INTO ratings_reviews (trip_id, reviewer_id, reviewed_user_id, reviewer_role, rating, comment)
            VALUES (?, ?, ?, 'passenger', ?, ?)
            ON DUPLICATE KEY UPDATE rating=VALUES(rating), comment=VALUES(comment)`,
            [tripId, req.user.user_id, driverUser[0].user_id, rating, comment || null]);

        // Update driver average rating
        await db.query(`
            UPDATE driver_profiles SET
              rating = (SELECT ROUND(AVG(r.rating), 2) FROM ratings_reviews r
                        WHERE r.reviewed_user_id = ? AND r.reviewer_role = 'passenger')
            WHERE user_id = ?`, [driverUser[0].user_id, driverUser[0].user_id]);

        await logAction(req.user.user_id, 'RATE_TRIP', `Rated trip #${tripId}: ${rating} stars`, getIp(req));
        return success(res, {}, 'Rating submitted successfully');
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to submit rating');
    }
}

// GET /api/rides/active
async function activeRide(req, res) {
    try {
        const [pp] = await db.query('SELECT passenger_id FROM passenger_profiles WHERE user_id=?',
            [req.user.user_id]);
        if (!pp.length) return success(res, null);

        const [rows] = await db.query(`
            SELECT rr.request_id, rr.pickup_location, rr.destination, rr.vehicle_type,
                   rr.estimated_fare, rr.status AS request_status, rr.requested_at,
                   t.trip_id, t.trip_status, t.start_time,
                   u.name AS driver_name, u.mobile AS driver_mobile,
                   dp.rating AS driver_rating,
                   v.vehicle_number, v.model, v.color
            FROM ride_requests rr
            LEFT JOIN trips t ON t.request_id = rr.request_id
            LEFT JOIN driver_profiles dp ON dp.driver_id = t.driver_id
            LEFT JOIN users u ON u.user_id = dp.user_id
            LEFT JOIN vehicles v ON v.vehicle_id = t.vehicle_id
            WHERE rr.passenger_id = ? AND rr.status IN ('pending','accepted')
            ORDER BY rr.requested_at DESC LIMIT 1`,
            [pp[0].passenger_id]);

        return success(res, rows[0] || null);
    } catch (err) {
        console.error(err);
        return error(res, 'Failed to fetch active ride');
    }
}

module.exports = { getProfile, updateProfile, searchRides, bookRide, cancelRide, tripHistory, rateTrip, activeRide };
