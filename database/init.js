// database/init.js — Database initialization and demo data seeder
require('dotenv').config();
const mysql = require('mysql2/promise');
const { hashPassword } = require('../utils/hash');

async function initDB() {
    console.log('🚀 Connecting to MySQL server...');
    const host     = process.env.DB_HOST || 'localhost';
    const port     = parseInt(process.env.DB_PORT) || 3306;
    const user     = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const dbName   = process.env.DB_NAME || 'cab_booking_db';

    let conn;
    try {
        conn = await mysql.createConnection({ host, port, user, password });
    } catch (err) {
        console.error('❌ Could not connect to MySQL server:', err.message);
        console.error('Please verify your DB_HOST, DB_USER, DB_PASSWORD in .env');
        process.exit(1);
    }

    console.log(`📦 Creating database "${dbName}" if not exists...`);
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.changeUser({ database: dbName });

    console.log('🛠️ Creating tables...');

    // 1. users
    await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
        user_id     INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(100)  NOT NULL,
        email       VARCHAR(150)  NOT NULL UNIQUE,
        password    VARCHAR(255)  NOT NULL,
        mobile      VARCHAR(15)   NOT NULL,
        role        ENUM('passenger','driver','admin','superadmin') NOT NULL DEFAULT 'passenger',
        status      ENUM('active','inactive','blocked','pending')   NOT NULL DEFAULT 'active',
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_role  (role),
        INDEX idx_users_status(status)
    ) ENGINE=InnoDB;`);

    // 2. passenger_profiles
    await conn.query(`
    CREATE TABLE IF NOT EXISTS passenger_profiles (
        passenger_id       INT AUTO_INCREMENT PRIMARY KEY,
        user_id            INT          NOT NULL UNIQUE,
        default_address    VARCHAR(300),
        emergency_contact  VARCHAR(15),
        created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    // 3. driver_profiles
    await conn.query(`
    CREATE TABLE IF NOT EXISTS driver_profiles (
        driver_id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id             INT          NOT NULL UNIQUE,
        license_no          VARCHAR(50)  NOT NULL,
        license_expiry      DATE         NOT NULL,
        experience_years    INT          DEFAULT 0,
        verification_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        availability        ENUM('online','offline')              NOT NULL DEFAULT 'offline',
        rating              DECIMAL(3,2) DEFAULT 5.00,
        total_trips         INT          DEFAULT 0,
        created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_dp_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_dp_availability (availability),
        INDEX idx_dp_verification (verification_status)
    ) ENGINE=InnoDB;`);

    // 4. vehicles
    await conn.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
        vehicle_id      INT AUTO_INCREMENT PRIMARY KEY,
        driver_id       INT          NOT NULL,
        vehicle_number  VARCHAR(20)  NOT NULL UNIQUE,
        vehicle_type    ENUM('sedan','suv','hatchback','auto','bike') NOT NULL,
        model           VARCHAR(100) NOT NULL,
        color           VARCHAR(50),
        capacity        INT          NOT NULL DEFAULT 4,
        year            YEAR,
        status          ENUM('active','inactive','maintenance') NOT NULL DEFAULT 'active',
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_veh_driver FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
        INDEX idx_veh_type   (vehicle_type),
        INDEX idx_veh_status (status)
    ) ENGINE=InnoDB;`);

    // 5. service_areas
    await conn.query(`
    CREATE TABLE IF NOT EXISTS service_areas (
        area_id    INT AUTO_INCREMENT PRIMARY KEY,
        area_name  VARCHAR(100) NOT NULL,
        city       VARCHAR(100) NOT NULL,
        state      VARCHAR(100) NOT NULL,
        pincode    VARCHAR(10),
        status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    // 6. fare_rules
    await conn.query(`
    CREATE TABLE IF NOT EXISTS fare_rules (
        fare_id            INT AUTO_INCREMENT PRIMARY KEY,
        vehicle_type       ENUM('sedan','suv','hatchback','auto','bike') NOT NULL UNIQUE,
        base_fare          DECIMAL(8,2) NOT NULL,
        per_km_rate        DECIMAL(8,2) NOT NULL,
        per_minute_rate    DECIMAL(8,2) NOT NULL DEFAULT 0.50,
        cancellation_fee   DECIMAL(8,2) NOT NULL DEFAULT 30.00,
        surge_multiplier   DECIMAL(4,2) NOT NULL DEFAULT 1.00,
        status             ENUM('active','inactive') NOT NULL DEFAULT 'active',
        updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    // 7. ride_requests
    await conn.query(`
    CREATE TABLE IF NOT EXISTS ride_requests (
        request_id        INT AUTO_INCREMENT PRIMARY KEY,
        passenger_id      INT          NOT NULL,
        pickup_location   VARCHAR(300) NOT NULL,
        pickup_lat        DECIMAL(10,7),
        pickup_lng        DECIMAL(10,7),
        destination       VARCHAR(300) NOT NULL,
        dest_lat          DECIMAL(10,7),
        dest_lng          DECIMAL(10,7),
        vehicle_type      ENUM('sedan','suv','hatchback','auto','bike') NOT NULL DEFAULT 'sedan',
        estimated_fare    DECIMAL(8,2),
        estimated_km      DECIMAL(6,2),
        requested_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status            ENUM('pending','accepted','cancelled','completed','expired') NOT NULL DEFAULT 'pending',
        CONSTRAINT fk_rr_passenger FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id),
        INDEX idx_rr_status (status),
        INDEX idx_rr_vtype  (vehicle_type)
    ) ENGINE=InnoDB;`);

    // 8. trips
    await conn.query(`
    CREATE TABLE IF NOT EXISTS trips (
        trip_id         INT AUTO_INCREMENT PRIMARY KEY,
        request_id      INT          NOT NULL UNIQUE,
        passenger_id    INT          NOT NULL,
        driver_id       INT          NOT NULL,
        vehicle_id      INT          NOT NULL,
        trip_status     ENUM('assigned','started','completed','cancelled') NOT NULL DEFAULT 'assigned',
        start_time      DATETIME,
        end_time        DATETIME,
        distance_km     DECIMAL(6,2),
        fare            DECIMAL(8,2),
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_trip_request   FOREIGN KEY (request_id)   REFERENCES ride_requests(request_id),
        CONSTRAINT fk_trip_passenger FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id),
        CONSTRAINT fk_trip_driver    FOREIGN KEY (driver_id)    REFERENCES driver_profiles(driver_id),
        CONSTRAINT fk_trip_vehicle   FOREIGN KEY (vehicle_id)   REFERENCES vehicles(vehicle_id),
        INDEX idx_trip_status (trip_status),
        INDEX idx_trip_driver (driver_id)
    ) ENGINE=InnoDB;`);

    // 9. payments
    await conn.query(`
    CREATE TABLE IF NOT EXISTS payments (
        payment_id      INT AUTO_INCREMENT PRIMARY KEY,
        trip_id         INT          NOT NULL UNIQUE,
        passenger_id    INT          NOT NULL,
        amount          DECIMAL(8,2) NOT NULL,
        payment_method  ENUM('cash','card','upi','wallet') NOT NULL DEFAULT 'cash',
        payment_status  ENUM('pending','completed','refunded','failed') NOT NULL DEFAULT 'pending',
        transaction_ref VARCHAR(100),
        paid_at         DATETIME,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_pay_trip      FOREIGN KEY (trip_id)      REFERENCES trips(trip_id),
        CONSTRAINT fk_pay_passenger FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id),
        INDEX idx_pay_status (payment_status)
    ) ENGINE=InnoDB;`);

    // 10. ratings_reviews
    await conn.query(`
    CREATE TABLE IF NOT EXISTS ratings_reviews (
        review_id        INT AUTO_INCREMENT PRIMARY KEY,
        trip_id          INT          NOT NULL,
        reviewer_id      INT          NOT NULL,
        reviewed_user_id INT          NOT NULL,
        reviewer_role    ENUM('passenger','driver') NOT NULL,
        rating           TINYINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment          TEXT,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_review (trip_id, reviewer_id),
        CONSTRAINT fk_rr_trip     FOREIGN KEY (trip_id)          REFERENCES trips(trip_id),
        CONSTRAINT fk_rr_reviewer FOREIGN KEY (reviewer_id)      REFERENCES users(user_id),
        CONSTRAINT fk_rr_reviewed FOREIGN KEY (reviewed_user_id) REFERENCES users(user_id),
        INDEX idx_rr_reviewed (reviewed_user_id)
    ) ENGINE=InnoDB;`);

    // 11. admin_permissions
    await conn.query(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
        permission_id   INT AUTO_INCREMENT PRIMARY KEY,
        admin_id        INT          NOT NULL,
        permission_name VARCHAR(100) NOT NULL,
        granted_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        granted_by      INT,
        UNIQUE KEY uq_perm (admin_id, permission_name),
        CONSTRAINT fk_ap_admin FOREIGN KEY (admin_id)  REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_ap_grantor FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`);

    // 12. system_logs
    await conn.query(`
    CREATE TABLE IF NOT EXISTS system_logs (
        log_id      INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT,
        action      VARCHAR(100) NOT NULL,
        description TEXT,
        ip_address  VARCHAR(50),
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sl_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
        INDEX idx_sl_user   (user_id),
        INDEX idx_sl_action (action),
        INDEX idx_sl_date   (created_at)
    ) ENGINE=InnoDB;`);

    console.log('🌱 Seeding initial fare rules & service areas...');
    await conn.query(`
    INSERT IGNORE INTO fare_rules (vehicle_type, base_fare, per_km_rate, per_minute_rate, cancellation_fee, surge_multiplier) VALUES
    ('bike',       15.00,  5.00, 0.30, 10.00, 1.00),
    ('auto',       25.00,  8.00, 0.40, 15.00, 1.00),
    ('hatchback',  40.00, 10.00, 0.50, 25.00, 1.00),
    ('sedan',      60.00, 12.00, 0.60, 30.00, 1.00),
    ('suv',        90.00, 16.00, 0.80, 50.00, 1.00);`);

    await conn.query(`
    INSERT IGNORE INTO service_areas (area_name, city, state, pincode) VALUES
    ('MG Road',         'Bengaluru', 'Karnataka', '560001'),
    ('Koramangala',     'Bengaluru', 'Karnataka', '560034'),
    ('Indiranagar',      'Bengaluru', 'Karnataka', '560038'),
    ('Whitefield',       'Bengaluru', 'Karnataka', '560066'),
    ('Electronic City',  'Bengaluru', 'Karnataka', '560100');`);

    console.log('👤 Seeding demo role accounts (Password: Password@123)...');
    const demoPasswordHash = hashPassword('Password@123');

    // 1. Super Admin
    await conn.query(`
    INSERT INTO users (name, email, password, mobile, role, status)
    VALUES ('Super Administrator', 'superadmin@cabsystem.com', ?, '9876543210', 'superadmin', 'active')
    ON DUPLICATE KEY UPDATE password=?, status='active';`, [demoPasswordHash, demoPasswordHash]);

    // 2. Admin
    const [resAdmin] = await conn.query(`
    INSERT INTO users (name, email, password, mobile, role, status)
    VALUES ('Regional Administrator', 'admin@cabsystem.com', ?, '9876543211', 'admin', 'active')
    ON DUPLICATE KEY UPDATE password=?, status='active';`, [demoPasswordHash, demoPasswordHash]);

    const [adminUser] = await conn.query('SELECT user_id FROM users WHERE email="admin@cabsystem.com"');
    if (adminUser.length) {
        const perms = ['MANAGE_DRIVERS', 'MANAGE_PASSENGERS', 'MANAGE_VEHICLES', 'MANAGE_FARES', 'VIEW_REPORTS'];
        for (const p of perms) {
            await conn.query('INSERT IGNORE INTO admin_permissions (admin_id, permission_name) VALUES (?, ?)',
                [adminUser[0].user_id, p]);
        }
    }

    // 3. Driver
    await conn.query(`
    INSERT INTO users (name, email, password, mobile, role, status)
    VALUES ('Rajesh Sharma (Driver)', 'driver@cabsystem.com', ?, '9876543212', 'driver', 'active')
    ON DUPLICATE KEY UPDATE password=?, status='active';`, [demoPasswordHash, demoPasswordHash]);

    const [driverUser] = await conn.query('SELECT user_id FROM users WHERE email="driver@cabsystem.com"');
    if (driverUser.length) {
        const uId = driverUser[0].user_id;
        await conn.query(`
        INSERT INTO driver_profiles (user_id, license_no, license_expiry, experience_years, verification_status, availability, rating, total_trips)
        VALUES (?, 'KA-04-2018-0098765', '2030-12-31', 6, 'approved', 'online', 4.95, 142)
        ON DUPLICATE KEY UPDATE verification_status='approved', availability='online';`, [uId]);

        const [dp] = await conn.query('SELECT driver_id FROM driver_profiles WHERE user_id=?', [uId]);
        if (dp.length) {
            await conn.query(`
            INSERT INTO vehicles (driver_id, vehicle_number, vehicle_type, model, color, capacity, year, status)
            VALUES (?, 'KA-04-AB-1234', 'sedan', 'Honda City i-VTEC', 'Pearl White', 4, 2022, 'active')
            ON DUPLICATE KEY UPDATE status='active';`, [dp[0].driver_id]);
        }
    }

    // 4. Passenger
    await conn.query(`
    INSERT INTO users (name, email, password, mobile, role, status)
    VALUES ('Priya Patel (Passenger)', 'passenger@cabsystem.com', ?, '9876543213', 'passenger', 'active')
    ON DUPLICATE KEY UPDATE password=?, status='active';`, [demoPasswordHash, demoPasswordHash]);

    const [passengerUser] = await conn.query('SELECT user_id FROM users WHERE email="passenger@cabsystem.com"');
    if (passengerUser.length) {
        const uId = passengerUser[0].user_id;
        await conn.query(`
        INSERT INTO passenger_profiles (user_id, default_address, emergency_contact)
        VALUES (?, 'Koramangala 4th Block, Bengaluru', '9988776655')
        ON DUPLICATE KEY UPDATE default_address='Koramangala 4th Block, Bengaluru';`, [uId]);
    }

    // Seed system log
    await conn.query(`
    INSERT INTO system_logs (user_id, action, description, ip_address)
    VALUES (1, 'SYSTEM_INIT', 'Online Cab Booking System initialized with schema and default roles', '127.0.0.1');`);

    console.log('\n✨ Database initialized successfully!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔑 Ready-to-use Demo Accounts (Password for all: Password@123)');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  1. Super Admin : superadmin@cabsystem.com');
    console.log('  2. Admin       : admin@cabsystem.com');
    console.log('  3. Driver      : driver@cabsystem.com (KA-04-AB-1234, Sedan)');
    console.log('  4. Passenger   : passenger@cabsystem.com');
    console.log('════════════════════════════════════════════════════════════════\n');

    await conn.end();
}

initDB().catch(err => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
});
