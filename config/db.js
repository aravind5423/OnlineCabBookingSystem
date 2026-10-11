// config/db.js — MySQL Connection Pool
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'cab_booking_db',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           '+00:00',
    charset:            'utf8mb4'
});

// Test connection on startup
pool.getConnection()
    .then(conn => {
        console.log('[DB] MySQL connected successfully');
        conn.release();
    })
    .catch(err => {
        console.error('[DB] Connection failed:', err.message);
        process.exit(1);
    });

module.exports = pool;
