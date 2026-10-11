// utils/jwt.js — JWT sign/verify using Node.js built-in crypto (no external package)
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'cab_booking_secret_key';
const EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN) || 86400; // 24h in seconds

function base64urlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64').toString('utf8');
}

function sign(payload) {
    const header  = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body    = base64urlEncode(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + EXPIRES_IN
    }));
    const sig = crypto
        .createHmac('sha256', SECRET)
        .update(`${header}.${body}`)
        .digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${header}.${body}.${sig}`;
}

function verify(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = crypto
        .createHmac('sha256', SECRET)
        .update(`${header}.${body}`)
        .digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    try {
        const payload = JSON.parse(base64urlDecode(body));
        if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
        return payload;
    } catch {
        return null;
    }
}

module.exports = { sign, verify };
