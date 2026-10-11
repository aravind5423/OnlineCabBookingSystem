// public/js/auth.js — Auth helpers: session, token, role guard
const Auth = {
    getToken()  { return localStorage.getItem('cab_token'); },
    getUser()   {
        try { return JSON.parse(localStorage.getItem('cab_user') || 'null'); } catch { return null; }
    },
    isLoggedIn(){ return !!this.getToken(); },

    setSession(token, user) {
        localStorage.setItem('cab_token', token);
        localStorage.setItem('cab_user', JSON.stringify(user));
    },

    clearSession() {
        localStorage.removeItem('cab_token');
        localStorage.removeItem('cab_user');
    },

    /** Decode JWT payload without verification (client-side display only) */
    decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
        } catch { return null; }
    },

    /** Redirect to correct dashboard based on role */
    redirectToDashboard(role) {
        const dashboards = {
            passenger:  '/passenger/dashboard.html',
            driver:     '/driver/dashboard.html',
            admin:      '/admin/dashboard.html',
            superadmin: '/superadmin/dashboard.html',
        };
        window.location.href = dashboards[role] || '/login.html';
    },

    /**
     * Guard a page — redirect away if:
     *  - not logged in (→ login.html)
     *  - wrong role   (→ their own dashboard)
     * @param {...string} allowedRoles
     */
    requireRole(...allowedRoles) {
        if (!this.isLoggedIn()) {
            window.location.href = '/login.html';
            return false;
        }
        const user = this.getUser();
        if (allowedRoles.length && !allowedRoles.includes(user?.role)) {
            this.redirectToDashboard(user?.role);
            return false;
        }
        return true;
    },

    /** Redirect logged-in users away from public pages */
    redirectIfLoggedIn() {
        if (this.isLoggedIn()) {
            const user = this.getUser();
            this.redirectToDashboard(user?.role);
        }
    },

    async logout() {
        await API.post('/api/auth/logout');
        this.clearSession();
        window.location.href = '/login.html';
    }
};

window.Auth = Auth;
