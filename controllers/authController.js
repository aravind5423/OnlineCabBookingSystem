// controllers/authController.js — Register, Login, Logout
require('dotenv').config();
const db = require('../config/db');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { sign }    = require('../utils/jwt');
const { success, error, badRequest } = require('../utils/response');
const { logAction } = require('../middleware/logger');

function getIp(req) {
    return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
}

// POST /api/auth/register
async function register(req, res) {
    try {
        const { name, email, password, mobile, role } = req.body || {};

        // Validation
        if (!name || !email || !password || !mobile || !role) {
            return badRequest(res, 'All fields are required');
        }
        if (!['passenger', 'driver'].includes(role)) {
            return badRequest(res, 'Registration allowed only for passenger or driver');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return badRequest(res, 'Invalid email format');
        }
        if (password.length < 8) {
            return badRequest(res, 'Password must be at least 8 characters');
        }

        // Check duplicate
        const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (existing.length) return badRequest(res, 'Email already registered');

        const hashed = hashPassword(password);
        const [result] = await db.query(
            'INSERT INTO users (name, email, password, mobile, role, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), email.toLowerCase().trim(), hashed, mobile.trim(), role, 'active']
        );
        const userId = result.insertId;

        // Create role-specific profile
        if (role === 'passenger') {
            await db.query('INSERT INTO passenger_profiles (user_id) VALUES (?)', [userId]);
        } else if (role === 'driver') {
            const { license_no, license_expiry } = req.body;
            if (!license_no || !license_expiry) {
                return badRequest(res, 'License number and expiry are required for drivers');
            }
            await db.query(
                'INSERT INTO driver_profiles (user_id, license_no, license_expiry, verification_status) VALUES (?, ?, ?, ?)',
                [userId, license_no, license_expiry, 'pending']
            );
        }

        await logAction(userId, 'REGISTER', `New ${role} registered: ${email}`, getIp(req));
        return success(res, { user_id: userId, role }, 'Registration successful', 201);
    } catch (err) {
        console.error('[Auth] Register error:', err);
        return error(res, 'Registration failed. Please try again.');
    }
}

// POST /api/auth/login
async function login(req, res) {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return badRequest(res, 'Email and password are required');

        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ?',
            [email.toLowerCase().trim()]
        );
        if (!rows.length) return badRequest(res, 'Invalid email or password');

        const user = rows[0];
        if (user.status === 'blocked')   return error(res, 'Your account has been blocked. Contact support.', 403);
        if (user.status === 'inactive')  return error(res, 'Account is inactive. Contact support.', 403);

        const valid = verifyPassword(password, user.password);
        if (!valid) return badRequest(res, 'Invalid email or password');

        const token = sign({
            user_id: user.user_id,
            name:    user.name,
            email:   user.email,
            role:    user.role
        });

        await logAction(user.user_id, 'LOGIN', `User logged in: ${user.email}`, getIp(req));
        return success(res, {
            token,
            user: {
                user_id: user.user_id,
                name:    user.name,
                email:   user.email,
                mobile:  user.mobile,
                role:    user.role,
                status:  user.status
            }
        }, 'Login successful');
    } catch (err) {
        console.error('[Auth] Login error:', err);
        return error(res, 'Login failed. Please try again.');
    }
}

// POST /api/auth/logout
async function logout(req, res) {
    // JWT is stateless; client clears the token
    if (req.user) {
        await logAction(req.user.user_id, 'LOGOUT', `User logged out: ${req.user.email}`, getIp(req));
    }
    return success(res, {}, 'Logged out successfully');
}

// GET /api/auth/me
async function me(req, res) {
    try {
        const [rows] = await db.query(
            'SELECT user_id, name, email, mobile, role, status, created_at FROM users WHERE user_id = ?',
            [req.user.user_id]
        );
        if (!rows.length) return error(res, 'User not found', 404);
        return success(res, rows[0]);
    } catch (err) {
        console.error('[Auth] Me error:', err);
        return error(res, 'Failed to fetch user info');
    }
}

module.exports = { register, login, logout, me };
