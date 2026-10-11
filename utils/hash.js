// utils/hash.js — Password hashing using Node.js built-in crypto (no bcrypt)
const crypto = require('crypto');

const ITERATIONS = 100000;
const KEYLEN     = 64;
const DIGEST     = 'sha512';

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
    return `${ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [iters, salt, hash] = stored.split(':');
    const derived = crypto
        .pbkdf2Sync(password, salt, parseInt(iters), KEYLEN, DIGEST)
        .toString('hex');
    // Constant-time compare
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

module.exports = { hashPassword, verifyPassword };
