// utils/fareCalculator.js — Estimate ride fares from fare_rules table
const db = require('../config/db');

/**
 * Calculate estimated fare
 * @param {string} vehicleType - sedan | suv | hatchback | auto | bike
 * @param {number} distanceKm - distance in kilometres
 * @param {number} durationMin - estimated duration in minutes
 */
async function calculateFare(vehicleType, distanceKm, durationMin = 0) {
    const [rows] = await db.query(
        'SELECT * FROM fare_rules WHERE vehicle_type = ? AND status = "active"',
        [vehicleType]
    );
    if (!rows.length) return null;

    const rule = rows[0];
    const base = parseFloat(rule.base_fare);
    const kmCharge  = parseFloat(rule.per_km_rate)     * distanceKm;
    const minCharge = parseFloat(rule.per_minute_rate) * durationMin;
    const surge     = parseFloat(rule.surge_multiplier) || 1.0;
    const total     = (base + kmCharge + minCharge) * surge;

    return {
        breakdown: {
            base_fare:       base.toFixed(2),
            distance_charge: kmCharge.toFixed(2),
            time_charge:     minCharge.toFixed(2),
            surge_multiplier: surge,
            cancellation_fee: rule.cancellation_fee
        },
        estimated_fare: parseFloat(total.toFixed(2))
    };
}

/**
 * Get rough straight-line distance between two lat/lng points (Haversine)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * (Math.PI / 180); }

module.exports = { calculateFare, haversineKm };
