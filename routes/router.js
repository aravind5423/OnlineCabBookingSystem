// routes/router.js — Manual URL router (no Express)
const url = require('url');

const auth      = require('../controllers/authController');
const passenger = require('../controllers/passengerController');
const driver    = require('../controllers/driverController');
const admin     = require('../controllers/adminController');
const superAdmin = require('../controllers/superAdminController');

const { authenticate }  = require('../middleware/auth');
const { authorize }     = require('../middleware/rbac');
const { notFound, error } = require('../utils/response');

// ─── Route Table ──────────────────────────────────────────────
// Each entry: { method, pattern (RegExp), middlewares, handler }
const routes = [];

function route(method, pattern, ...fns) {
    routes.push({ method: method.toUpperCase(), pattern, fns });
}

// ── AUTH (public) ──
route('POST', /^\/api\/auth\/register$/,  auth.register);
route('POST', /^\/api\/auth\/login$/,     auth.login);
route('POST', /^\/api\/auth\/logout$/,    authenticate, auth.logout);
route('GET',  /^\/api\/auth\/me$/,        authenticate, auth.me);

// ── PASSENGER ──
route('GET',  /^\/api\/passenger\/profile$/,    authenticate, authorize('passenger'), passenger.getProfile);
route('PUT',  /^\/api\/passenger\/profile$/,    authenticate, authorize('passenger'), passenger.updateProfile);
route('GET',  /^\/api\/rides\/active$/,         authenticate, authorize('passenger'), passenger.activeRide);
route('GET',  /^\/api\/rides\/history$/,        authenticate, authorize('passenger'), passenger.tripHistory);
route('POST', /^\/api\/rides\/search$/,         passenger.searchRides);
route('POST', /^\/api\/rides\/book$/,           authenticate, authorize('passenger'), passenger.bookRide);
route('PUT',  /^\/api\/rides\/(\d+)\/cancel$/,  authenticate, authorize('passenger'), passenger.cancelRide);
route('POST', /^\/api\/rides\/(\d+)\/rate$/,    authenticate, authorize('passenger'), passenger.rateTrip);

// ── DRIVER ──
route('GET',  /^\/api\/driver\/profile$/,           authenticate, authorize('driver'), driver.getProfile);
route('PUT',  /^\/api\/driver\/profile$/,           authenticate, authorize('driver'), driver.updateProfile);
route('PUT',  /^\/api\/driver\/availability$/,      authenticate, authorize('driver'), driver.setAvailability);
route('GET',  /^\/api\/driver\/requests$/,          authenticate, authorize('driver'), driver.getRideRequests);
route('PUT',  /^\/api\/driver\/requests\/(\d+)$/,   authenticate, authorize('driver'), driver.respondToRequest);
route('PUT',  /^\/api\/driver\/trips\/(\d+)\/start$/,    authenticate, authorize('driver','admin','superadmin'), driver.startTrip);
route('PUT',  /^\/api\/driver\/trips\/(\d+)\/complete$/, authenticate, authorize('driver','admin','superadmin'), driver.completeTrip);
route('GET',  /^\/api\/driver\/trips$/,             authenticate, authorize('driver'), driver.getTripHistory);
route('GET',  /^\/api\/driver\/earnings$/,          authenticate, authorize('driver'), driver.getEarnings);
route('GET',  /^\/api\/driver\/active-trip$/,       authenticate, authorize('driver'), driver.getActiveTrip);
route('GET',  /^\/api\/driver\/vehicles$/,          authenticate, authorize('driver'), driver.getVehicles);
route('POST', /^\/api\/driver\/vehicles$/,          authenticate, authorize('driver'), driver.addVehicle);
route('PUT',  /^\/api\/driver\/vehicles\/(\d+)$/,   authenticate, authorize('driver'), driver.updateVehicle);

// ── ADMIN ──
route('GET',  /^\/api\/admin\/dashboard$/,              authenticate, authorize('admin','superadmin'), admin.getDashboard);
route('GET',  /^\/api\/admin\/passengers$/,             authenticate, authorize('admin','superadmin'), admin.listPassengers);
route('GET',  /^\/api\/admin\/drivers$/,                authenticate, authorize('admin','superadmin'), admin.listDrivers);
route('PUT',  /^\/api\/admin\/drivers\/(\d+)\/approve$/, authenticate, authorize('admin','superadmin'), admin.approveDriver);
route('PUT',  /^\/api\/admin\/users\/(\d+)\/block$/,    authenticate, authorize('admin','superadmin'), admin.blockUser);
route('GET',  /^\/api\/admin\/vehicles$/,               authenticate, authorize('admin','superadmin'), admin.listVehicles);
route('PUT',  /^\/api\/admin\/vehicles\/(\d+)$/,        authenticate, authorize('admin','superadmin'), admin.updateVehicleStatus);
route('GET',  /^\/api\/admin\/trips$/,                  authenticate, authorize('admin','superadmin'), admin.listTrips);
route('GET',  /^\/api\/admin\/fare-rules$/,             authenticate, authorize('admin','superadmin'), admin.listFareRules);
route('PUT',  /^\/api\/admin\/fare-rules\/(\d+)$/,      authenticate, authorize('admin','superadmin'), admin.updateFareRule);
route('GET',  /^\/api\/admin\/service-areas$/,          authenticate, authorize('admin','superadmin'), admin.listServiceAreas);
route('POST', /^\/api\/admin\/service-areas$/,          authenticate, authorize('admin','superadmin'), admin.addServiceArea);
route('PUT',  /^\/api\/admin\/service-areas\/(\d+)$/,   authenticate, authorize('admin','superadmin'), admin.updateServiceArea);
route('GET',  /^\/api\/admin\/reports\/revenue$/,       authenticate, authorize('admin','superadmin'), admin.revenueReport);

// ── SUPER ADMIN ──
route('GET',  /^\/api\/superadmin\/dashboard$/,          authenticate, authorize('superadmin'), superAdmin.getDashboard);
route('GET',  /^\/api\/superadmin\/admins$/,             authenticate, authorize('superadmin'), superAdmin.listAdmins);
route('POST', /^\/api\/superadmin\/admins$/,             authenticate, authorize('superadmin'), superAdmin.createAdmin);
route('PUT',  /^\/api\/superadmin\/admins\/(\d+)$/,      authenticate, authorize('superadmin'), superAdmin.updateAdmin);
route('DELETE',/^\/api\/superadmin\/admins\/(\d+)$/,     authenticate, authorize('superadmin'), superAdmin.deleteAdmin);
route('GET',  /^\/api\/superadmin\/permissions\/(\d+)$/, authenticate, authorize('superadmin'), superAdmin.getPermissions);
route('POST', /^\/api\/superadmin\/permissions$/,        authenticate, authorize('superadmin'), superAdmin.grantPermission);
route('DELETE',/^\/api\/superadmin\/permissions$/,       authenticate, authorize('superadmin'), superAdmin.revokePermission);
route('GET',  /^\/api\/superadmin\/logs$/,               authenticate, authorize('superadmin'), superAdmin.getSystemLogs);
route('GET',  /^\/api\/superadmin\/reports$/,            authenticate, authorize('superadmin'), superAdmin.getSystemReports);

// ─── Dispatcher ───────────────────────────────────────────────
async function dispatch(req, res) {
    const parsed   = url.parse(req.url, true);
    const pathname = parsed.pathname.replace(/\/$/, '') || '/';
    req.query  = parsed.query;
    req.params = {};

    for (const { method, pattern, fns } of routes) {
        if (req.method !== method) continue;
        const match = pathname.match(pattern);
        if (!match) continue;

        // Capture path params (e.g., :id from /api/rides/42/cancel)
        if (match[1]) req.params.id = match[1];
        if (match[2]) req.params.id2 = match[2];

        // Run middleware chain
        let i = 0;
        function next(err) {
            if (err) return error(res, err.message || 'Middleware error', 500);
            const fn = fns[i++];
            if (!fn) return;
            try {
                const result = fn(req, res, next);
                if (result && typeof result.catch === 'function') {
                    result.catch(e => error(res, e.message, 500));
                }
            } catch (e) {
                error(res, e.message, 500);
            }
        }
        return next();
    }

    notFound(res, `API endpoint not found: ${req.method} ${pathname}`);
}

module.exports = { dispatch };
