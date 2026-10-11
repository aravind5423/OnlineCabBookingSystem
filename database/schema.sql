-- ============================================================
-- Online Cab Booking System — Full MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS cab_booking_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cab_booking_db;

-- ============================================================
-- 1. USERS (root table for all roles)
-- ============================================================
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
) ENGINE=InnoDB;

-- Default Super Admin (password: Admin@1234 — change after first login)
INSERT IGNORE INTO users (name, email, password, mobile, role, status)
VALUES ('Super Admin', 'superadmin@cabsystem.com',
        '$pbkdf2$100000$defaultsalt$hashedpassword', '9000000000', 'superadmin', 'active');

-- ============================================================
-- 2. PASSENGER PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS passenger_profiles (
    passenger_id       INT AUTO_INCREMENT PRIMARY KEY,
    user_id            INT          NOT NULL UNIQUE,
    default_address    VARCHAR(300),
    emergency_contact  VARCHAR(15),
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 3. DRIVER PROFILES
-- ============================================================
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
) ENGINE=InnoDB;

-- ============================================================
-- 4. VEHICLES
-- ============================================================
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
) ENGINE=InnoDB;

-- ============================================================
-- 5. SERVICE AREAS
-- ============================================================
CREATE TABLE IF NOT EXISTS service_areas (
    area_id    INT AUTO_INCREMENT PRIMARY KEY,
    area_name  VARCHAR(100) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    state      VARCHAR(100) NOT NULL,
    pincode    VARCHAR(10),
    status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Sample service areas
INSERT IGNORE INTO service_areas (area_name, city, state, pincode) VALUES
('Koramangala', 'Bengaluru', 'Karnataka', '560034'),
('Indiranagar',  'Bengaluru', 'Karnataka', '560038'),
('Whitefield',   'Bengaluru', 'Karnataka', '560066'),
('Electronic City', 'Bengaluru', 'Karnataka', '560100'),
('MG Road',     'Bengaluru', 'Karnataka', '560001');

-- ============================================================
-- 6. FARE RULES
-- ============================================================
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
) ENGINE=InnoDB;

INSERT IGNORE INTO fare_rules (vehicle_type, base_fare, per_km_rate, per_minute_rate, cancellation_fee) VALUES
('bike',       15.00,  5.00, 0.30, 10.00),
('auto',       25.00,  8.00, 0.40, 15.00),
('hatchback',  40.00, 10.00, 0.50, 25.00),
('sedan',      60.00, 12.00, 0.60, 30.00),
('suv',        90.00, 16.00, 0.80, 50.00);

-- ============================================================
-- 7. RIDE REQUESTS
-- ============================================================
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
    cancel_reason     VARCHAR(300),
    CONSTRAINT fk_rr_passenger FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id) ON DELETE CASCADE,
    INDEX idx_rr_status (status),
    INDEX idx_rr_passenger (passenger_id)
) ENGINE=InnoDB;

-- ============================================================
-- 8. TRIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
    trip_id      INT AUTO_INCREMENT PRIMARY KEY,
    request_id   INT          NOT NULL UNIQUE,
    passenger_id INT          NOT NULL,
    driver_id    INT          NOT NULL,
    vehicle_id   INT          NOT NULL,
    start_time   DATETIME,
    end_time     DATETIME,
    distance_km  DECIMAL(6,2),
    fare         DECIMAL(8,2),
    trip_status  ENUM('assigned','started','completed','cancelled') NOT NULL DEFAULT 'assigned',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_request   FOREIGN KEY (request_id)   REFERENCES ride_requests(request_id),
    CONSTRAINT fk_trip_passenger FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id),
    CONSTRAINT fk_trip_driver    FOREIGN KEY (driver_id)    REFERENCES driver_profiles(driver_id),
    CONSTRAINT fk_trip_vehicle   FOREIGN KEY (vehicle_id)   REFERENCES vehicles(vehicle_id),
    INDEX idx_trip_status     (trip_status),
    INDEX idx_trip_passenger  (passenger_id),
    INDEX idx_trip_driver     (driver_id)
) ENGINE=InnoDB;

-- ============================================================
-- 9. PAYMENTS
-- ============================================================
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
) ENGINE=InnoDB;

-- ============================================================
-- 10. RATINGS & REVIEWS
-- ============================================================
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
) ENGINE=InnoDB;

-- ============================================================
-- 11. ADMIN PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_permissions (
    permission_id   INT AUTO_INCREMENT PRIMARY KEY,
    admin_id        INT          NOT NULL,
    permission_name VARCHAR(100) NOT NULL,
    granted_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by      INT,
    UNIQUE KEY uq_perm (admin_id, permission_name),
    CONSTRAINT fk_ap_admin FOREIGN KEY (admin_id)  REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_ap_grantor FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 12. SYSTEM LOGS
-- ============================================================
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
) ENGINE=InnoDB;
